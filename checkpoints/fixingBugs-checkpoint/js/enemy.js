// =============================================================
//  enemy.js - Monsters with simple AI.
// =============================================================
//  Our enemies use a tiny "state machine". At any moment an enemy
//  is in ONE of these states:
//      IDLE - sitting still, waiting
//      ROAM - (optional) wandering near home until the player shows up
//      CHASE - player got close, walk toward them
//      HURT - just got hit, flash briefly
//      DEAD - defeated, play death animation then disappear
//  A state machine keeps AI easy to read: each state has clear rules
//  for what to do and when to switch to another state.
// =============================================================

import { CONFIG } from "./config.js";
import { SpriteAnimator } from "./sprite.js";
import { Sound } from "./audio.js";
import { AStar } from "./astar.js";   // pathfinding so enemies walk AROUND walls

const STATE = { IDLE: "idle", ROAM: "roam", PATROL: "patrol", CHASE: "chase", HURT: "hurt", DEAD: "dead" };

// Per-enemy-type settings. Add new monsters by adding entries here.
const TYPES = {
  slime: {
    idleSheet: "slime_idle", hurtSheet: "slime_hurt", deathSheet: "slime_death",
    idleFrames: 8, hurtFrames: 2, deathFrames: 4,
    hp: 10, speed: 88, damage: 3, sightRange: 120, attackRange: 30,
    xp: 5,  // XP the player earns for defeating one
  },
  bat: {
    idleSheet: "bat_idle", hurtSheet: "bat_hurt", deathSheet: "bat_death",
    idleFrames: 4, hurtFrames: 2, deathFrames: 5,
    hp: 6, speed: 150, damage: 2, sightRange: 160, attackRange: 28,
    xp: 4,
  },
};

export class Enemy {
  constructor(data) {
    this.type = data.type || "slime";
    const t = TYPES[this.type];
    this.def = t;

    this.x = data.x;
    this.y = data.y;
    this.homeX = data.x; // remembers where it started
    this.homeY = data.y;
    this.width = CONFIG.SCALED_TILE;
    this.height = CONFIG.SCALED_TILE;

    this.hp = t.hp;
    this.xpReward = t.xp || 3;  // XP granted to the player when defeated
    this.state = STATE.IDLE;
    this.dir = 0;
    this.anim = new SpriteAnimator();
    this.hurtTimer = 0;
    this.deadTimer = 0;
    this.attackCooldown = 0;
    this.dead = false;     // when true, the game removes this enemy
    // ---- Make It Super ----
    this.knockX = 0; this.knockY = 0;  // knockback velocity (sec. 17)
    this.knocked = false;              // true while flying back from a hit
    this.bounceT = 0;                  // bounce hop timer (sec. 17) - playful spring
    this.path = [];                    // A* route (list of {c,r} cells) - shared brain
    this.repathTimer = 0;              // recompute the path a few times a second
    // ---- Roaming (optional, per enemy) ----
    // When roaming is on, an enemy that isn't chasing wanders to random walkable
    // spots near where it started, instead of standing still. Configured in the map
    // editor: `roam` turns it on, `roamRadius` is how far (in tiles) it strays.
    this.roams = data.roam ?? false;
    this.roamRadius = data.roamRadius ?? 4;   // tiles from home it may wander
    this.roamTarget = null;            // {x, y} pixel spot we're ambling toward
    this.roamPause = 0;                // short rest timer between wanders
    // ---- Patrol (optional, per enemy) ----
    // A list of {col,row} waypoints the enemy walks in a loop (set in the editor).
    // Patrol takes priority over roam when present.
    this.patrol = data.patrol || null; // e.g. [{col,row},{col,row}]
    this.patrolIndex = 0;              // which waypoint we're heading to
    this.patrolPause = 0;              // rest at each waypoint
    // ---- Drops (optional, per enemy) ----
    // What this enemy leaves behind when defeated, beyond the base coins.
    this.coins = data.coins ?? CONFIG.COINS_PER_KILL;  // gold dropped on death
    this.dropId = data.dropId || null;       // item id to maybe drop (e.g. "berry")
    this.dropChance = data.dropChance ?? 0;  // 0..1 chance to drop that item
  }

  get centerX() { return this.x + this.width/2; }
  get centerY() { return this.y + this.height/2; }

  distanceTo(player) {
    return Math.hypot(this.centerX - (player.x+player.width/2),
                      this.centerY - (player.y+player.height/2));
  }

  update(dt, player, map) {
    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    // ---- Make It Super: apply knockback (sec. 17) ----
    // When hit, the enemy gets a velocity pointing away from the player. We move it
    // by that velocity each frame and shrink the velocity with friction, so it shoots
    // back, slows, and stops. The chase state then walks it back (gated by `knocked`).
    this.knocked = (this.knockX !== 0 || this.knockY !== 0);
    if (this.knocked) {
      this.x += this.knockX * dt; this.y += this.knockY * dt;
      this.knockX *= 0.88; this.knockY *= 0.88;   // friction - travels then settles
      if (Math.abs(this.knockX) < 6) this.knockX = 0;
      if (Math.abs(this.knockY) < 6) this.knockY = 0;
    }
    // Bounce timer: drives the up-and-down hop in draw().
    if (this.bounceT > 0) this.bounceT -= dt;

    switch (this.state) {
      case STATE.DEAD: {
        this.deadTimer -= dt;
        this.anim.update(dt, this.def.deathFrames);
        if (this.deadTimer <= 0) this.dead = true; // remove me
        break;
      }
      case STATE.HURT: {
        this.hurtTimer -= dt;
        this.anim.update(dt, this.def.hurtFrames);
        if (this.hurtTimer <= 0) {
          this.state = (this.hp <= 0) ? STATE.DEAD : STATE.CHASE;
          if (this.state === STATE.DEAD) this.startDeath();
        }
        break;
      }
      case STATE.IDLE: {
        this.anim.update(dt, this.def.idleFrames);
        // Wake up if the player comes into view.
        if (this.distanceTo(player) < this.def.sightRange) { this.state = STATE.CHASE; break; }
        // Otherwise, drift into a patrol (if it has waypoints) or a roam.
        if (this.patrol && this.patrol.length > 0) this.state = STATE.PATROL;
        else if (this.roams) this.state = STATE.ROAM;
        break;
      }
      case STATE.ROAM: {
        // Player in sight? Drop everything and chase.
        if (this.distanceTo(player) < this.def.sightRange) {
          this.state = STATE.CHASE;
          this.roamTarget = null;       // abandon the wander
          this.path = [];
          break;
        }
        this.roamNear(dt, map);         // amble toward a random nearby spot
        break;
      }
      case STATE.PATROL: {
        // Player in sight? Chase. (We resume the route afterward.)
        if (this.distanceTo(player) < this.def.sightRange) {
          this.state = STATE.CHASE;
          this.path = [];
          break;
        }
        this.patrolMove(dt, map);       // walk the fixed waypoint loop
        break;
      }
      case STATE.CHASE: {
        this.anim.update(dt, this.def.idleFrames);
        const dist = this.distanceTo(player);
        // Lose interest if the player runs far away - go back to patrol/roam/idle.
        if (dist > this.def.sightRange * 1.5) {
          this.state = this.afterChaseState();
          this.path = [];
          break;
        }

        // While still flying back from a hit, DON'T walk toward the player - let the
        // knockback carry it away first. Once the shove settles, resume the chase.
        if (!this.knocked) {
          this.chaseWithPath(dt, player, map);   // follow an A* route around walls
        }

        // Close enough? Bite the player (on a cooldown so it's fair).
        if (dist < this.def.attackRange && this.attackCooldown <= 0) {
          player.takeDamage(this.def.damage);
          this.attackCooldown = 1.0; // one bite per second
        }
        break;
      }
    }
  }

  // Recompute the A* path a few times a second, then step toward the next cell.
  // Each enemy has its OWN path, so one method serves every enemy unchanged.
  chaseWithPath(dt, player, map) {
    this.repathTimer -= dt;
    if (this.repathTimer <= 0) {
      const p = AStar.cellOf(player.x + player.width / 2, player.y + player.height / 2);
      this.repathTo(p.c, p.r);
      this.repathTimer = 0.3;                       // ~3 recomputes per second
    }
    const fallbackX = player.x + player.width / 2;  // if no route, head straight at them
    const fallbackY = player.y + player.height / 2;
    this.followPath(dt, map, fallbackX, fallbackY);
  }

  // Ask A* for a fresh route from where we are to a goal cell, and store it.
  repathTo(goalC, goalR) {
    let s = AStar.cellOf(this.centerX, this.centerY);
    s = AStar.nearestOpen(s.c, s.r);          // snap off a wall if we're touching one
    const g = AStar.nearestOpen(goalC, goalR);
    this.path = AStar.findPath(s.c, s.r, g.c, g.r);
  }

  // Walk one step along this.path toward the next cell. If the path is empty, head
  // toward (fallbackX, fallbackY) directly. Shared by chasing AND roaming.
  // speedScale lets roaming amble at half pace. Returns true once we've arrived.
  followPath(dt, map, fallbackX, fallbackY, speedScale = 1) {
    let tx, ty;
    if (this.path && this.path.length > 0) {
      const t = AStar.cellCenter(this.path[0].c, this.path[0].r);
      tx = t.x; ty = t.y;
    } else {
      tx = fallbackX;
      ty = fallbackY;
    }
    const dx = tx - this.centerX, dy = ty - this.centerY;
    const len = Math.hypot(dx, dy) || 1;
    const speed = this.def.speed * speedScale;
    const movedX = this.moveAxis((dx / len) * speed * dt, 0, map);
    const movedY = this.moveAxis(0, (dy / len) * speed * dt, map);

    // ---- Anti-stuck: if both axes were blocked (wedged against a wall/corner),
    // count it; after a few stuck frames, force a repath and nudge toward the
    // nearest open cell so the enemy can never freeze permanently near a wall. ----
    if (!movedX && !movedY) {
      this._stuck = (this._stuck || 0) + dt;
      if (this._stuck > 0.25) {
        const here = AStar.cellOf(this.centerX, this.centerY);
        const open = AStar.nearestOpen(here.c, here.r);
        if (open.c !== here.c || open.r !== here.r) {
          const target = AStar.cellCenter(open.c, open.r);
          const ux = target.x - this.centerX, uy = target.y - this.centerY;
          const ulen = Math.hypot(ux, uy) || 1;
          this.moveAxis((ux / ulen) * speed * dt, 0, map);
          this.moveAxis(0, (uy / ulen) * speed * dt, map);
        }
        this.path = [];           // throw away the bad path; chaseWithPath will rebuild
        this.repathTimer = 0;
        this._stuck = 0;
      }
    } else {
      this._stuck = 0;
    }

    if (this.path && this.path.length > 0 && len < 6) this.path.shift(); // reached cell
    // arrived = nothing left on the path AND we're basically on the target point
    return (!this.path || this.path.length === 0) && len < 8;
  }

  // ---- Roaming: wander to random walkable spots near home ----
  // Picks a random cell within roamRadius of home that isn't a wall, paths to it,
  // rests a beat, then picks another. Roaming enemies move at half speed so it reads
  // as an idle amble, not a chase.
  roamNear(dt, map) {
    // Resting between wanders?
    if (this.roamPause > 0) {
      this.roamPause -= dt;
      this.anim.update(dt, this.def.idleFrames);
      return;
    }
    // Need a new place to wander to?
    if (!this.roamTarget) {
      const homeCell = AStar.cellOf(this.homeX + this.width / 2, this.homeY + this.height / 2);
      for (let tries = 0; tries < 8; tries++) {
        const dc = Math.floor((Math.random() * 2 - 1) * this.roamRadius);
        const dr = Math.floor((Math.random() * 2 - 1) * this.roamRadius);
        const c = homeCell.c + dc, r = homeCell.r + dr;
        if (AStar.isWall(c, r)) continue;             // skip walls
        this.repathTo(c, r);
        if (this.path && this.path.length > 0) {
          const goal = AStar.cellCenter(c, r);
          this.roamTarget = { x: goal.x, y: goal.y };
          break;
        }
      }
      if (!this.roamTarget) { this.roamPause = 0.5; return; } // no spot found, rest & retry
    }
    // Amble toward the target at HALF speed (roaming is lazy, not a chase).
    const arrived = this.followPath(dt, map, this.roamTarget.x, this.roamTarget.y, 0.5);
    this.anim.update(dt, this.def.idleFrames);
    if (arrived) {
      this.roamTarget = null;
      this.roamPause = 0.8 + Math.random() * 1.4;     // pause a beat before the next wander
    }
  }

  // ---- Patrol: walk a fixed list of waypoints in a loop ----
  // Like roaming, but instead of random spots it follows the {col,row} points the
  // designer placed in the map editor, A*-ing from one to the next and looping.
  patrolMove(dt, map) {
    if (this.patrolPause > 0) {                  // brief rest at each waypoint
      this.patrolPause -= dt;
      this.anim.update(dt, this.def.idleFrames);
      return;
    }
    const wp = this.patrol[this.patrolIndex];    // current target waypoint
    const goal = AStar.cellCenter(wp.col, wp.row);
    // (re)compute the route to this waypoint now and then
    this.repathTimer -= dt;
    if (this.repathTimer <= 0 || !this.path || this.path.length === 0) {
      this.repathTo(wp.col, wp.row);
      this.repathTimer = 0.4;
    }
    const arrived = this.followPath(dt, map, goal.x, goal.y, 0.6);  // amble at 60% speed
    this.anim.update(dt, this.def.idleFrames);
    if (arrived) {
      this.patrolIndex = (this.patrolIndex + 1) % this.patrol.length;  // next, looping
      this.patrolPause = 0.4;                    // small pause, then move on
      this.path = [];
    }
  }

  // Which "calm" state to fall back to after losing the player.
  afterChaseState() {
    if (this.patrol && this.patrol.length > 0) return STATE.PATROL;
    if (this.roams) return STATE.ROAM;
    return STATE.IDLE;
  }

  // Move one axis, blocked if ANY of the four body corners hits a wall. (Fixes the
  // old bug where only the center point was tested, letting enemies sink into walls.)
  moveAxis(mx, my, map) {
    const nx = this.x + mx, ny = this.y + my;
    const corners = [
      [nx,              ny],
      [nx + this.width-1, ny],
      [nx,              ny + this.height-1],
      [nx + this.width-1, ny + this.height-1],
    ];
    for (const [cx, cy] of corners) {
      if (map.isSolidAtPixel(cx, cy)) return false;  // a corner is in a wall -> blocked
    }
    this.x = nx; this.y = ny;
    return true;
  }

  // Called by the battle system when the player's sword connects.
  takeDamage(amount) {
    if (this.state === STATE.DEAD) return;
    this.hp -= amount;
    this.hurtTimer = 0.25;
    this.state = STATE.HURT;
    this.anim.reset();
    Sound.play(this.hp <= 0 ? "enemy_down" : "hit");
  }

  startDeath() {
    this.state = STATE.DEAD;
    this.deadTimer = this.def.deathFrames / CONFIG.ANIM_FPS;
    this.anim.reset();
  }

  draw(ctx, camera) {
    // The collision box (this.x/y, 48x48) should sit at the CENTER of the sprite
    // frame, exactly like the player. Offset the drawn sprite by half the empty
    // padding on each side so the art is centered on the body box - not shoved to
    // the bottom of the frame.
    const offset = (CONFIG.PLAYER_FRAME_SIZE * CONFIG.SCALE - this.width) / 2;
    const sx = this.x - offset - camera.x;
    // ----- Make It Super: knockback hop (sec.17) -----
    // While the bounce timer runs, the sprite arcs UP and back down a couple of times
    // (a decaying double hop) so the shove looks springy. The actual backward TRAVEL
    // is the knockback velocity moving this.x/this.y (handled in update); this is just
    // the visual hop layered on top.
    let bounceHop = 0;
    if (this.bounceT > 0) {
      const DUR = 0.5;
      const p = 1 - this.bounceT / DUR;             // 0 at hit -> 1 at end
      // two arcs that shrink over time: a clear hop, then a smaller settle-bounce
      bounceHop = -Math.abs(Math.sin(p * Math.PI * 2)) * 26 * (1 - p);
    }
    const sy = this.y - offset - camera.y + bounceHop;

    let sheet = this.def.idleSheet, frames = this.def.idleFrames, row = 0;
    if (this.state === STATE.HURT) { sheet = this.def.hurtSheet; frames = this.def.hurtFrames; }
    if (this.state === STATE.DEAD) { sheet = this.def.deathSheet; frames = this.def.deathFrames; row = 0; }

    this.anim.draw(ctx, sheet, row, sx, sy);

    // ----- Make It Super: hit flash (sec.3) - the enemy blinks bright white -----
    // The enemy art fills the CENTER of the frame (like the bunny), so the flash uses
    // the SAME sheet/row/position as the sprite and lines up exactly. We re-draw the
    // current sprite frame as a solid white silhouette on top, held bright then faded.
    if (this.state === STATE.HURT) {
      const k = Math.max(0, Math.min(1, this.hurtTimer / 0.25)); // 1 -> 0 over the hurt window
      const flash = Math.min(1, k / 0.35);                       // full white most of the time
      ctx.save();
      ctx.globalAlpha = flash;
      // brightness(0) makes the sprite black; invert(1) flips black -> white. The
      // result is a pure-white copy of the sprite's exact shape, drawn over it.
      ctx.filter = "brightness(0) invert(1)";
      this.anim.draw(ctx, sheet, row, sx, sy);
      this.anim.draw(ctx, sheet, row, sx, sy);          // twice = fully opaque white blink
      ctx.filter = "none";
      ctx.restore();
    }
    if (this.state !== STATE.DEAD) {
      const barW = this.width, barX = this.x - camera.x, barY = this.y - camera.y - 8;
      ctx.fillStyle = "#3a2e3f"; ctx.fillRect(barX, barY, barW, 4);
      const hpRatio = Math.max(0, Math.min(1, this.hp / this.def.hp));  // clamp 0..1
      ctx.fillStyle = "#e85d75"; ctx.fillRect(barX, barY, barW * hpRatio, 4);
    }
  }
}
