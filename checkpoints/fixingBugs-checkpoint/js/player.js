// =============================================================
//  player.js - The bunny you control.
// =============================================================
//  The player can:
// - walk in 4 directions (with smooth, framerate-independent speed)
// - animate (idle vs running) and face the right way
// - bump into solid tiles (collision)
// - swing a sword to attack
// - take damage and have hit-points (HP)
// =============================================================

import { CONFIG } from "./config.js";
import { Input } from "./input.js";
import { SpriteAnimator, DIR } from "./sprite.js";
import { Sound } from "./audio.js";

// How many animation columns each bunny sheet has.
const FRAMES = { idle: 5, run: 8, sword: 9 };

// ---- Make It Super: local co-op key maps (sec. 18) ----
// Each player reads its OWN set of keys. Player 1 uses the arrow keys; Player 2
// uses WASD. Giving every Player its own keymap is the whole trick to co-op: the
// rest of the Player code is identical, it just looks at a different set of keys.
export const KEYMAP_P1 = {
  up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight",
  attack: "Space", dash: "ShiftLeft",
};
export const KEYMAP_P2 = {
  up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD",
  attack: "KeyF", dash: "KeyG",
};

export class Player {
  constructor(x, y, keys = KEYMAP_P1) {
    this.x = x; // world position in pixels (top-left of the COLLISION BODY)
    this.y = y;
    this.keys = keys; // this player's own key map (P1 = arrows, P2 = WASD)
    // The bunny art only fills the CENTER 16x16 of the 48x48 sprite frame, so the
    // collision body is exactly that center region, scaled up. At SCALE=3 the frame
    // is 144px and the center 16x16 becomes a 48x48 box sitting at frame px 48..96.
    // Using the center 16x16 means you collide where the bunny actually IS, not the
    // empty padding around it.
    const framePx = CONFIG.PLAYER_FRAME_SIZE * CONFIG.SCALE; // 144
    const bodyPx = 16 * CONFIG.SCALE;                        // 48 (center 16x16 scaled)
    this.width = bodyPx;
    this.height = bodyPx;
    const spriteSize = framePx; // 144
    // The collision box's top-left = frame pixel (16,16) scaled = (48,48). So draw
    // the sprite shifted up/left by that amount to line the center region up.
    this.spriteOffsetX = 16 * CONFIG.SCALE; // 48
    this.spriteOffsetY = 16 * CONFIG.SCALE; // 48

    this.dir = DIR.DOWN;
    this.moving = false;
    this.anim = new SpriteAnimator();

    this.hp = CONFIG.PLAYER_MAX_HP;
    this.maxHp = CONFIG.PLAYER_MAX_HP;

    // ---- Leveling & XP ----
    this.level = 1;
    this.xp = 0;                       // XP earned toward the next level
    this.xpToNext = CONFIG.XP_BASE;    // XP needed to reach the next level
    this.attackDamage = CONFIG.PLAYER_ATTACK_DAMAGE;
    this.gold = 0;                     // coins for the shop
    this.justLeveledTimer = 0;         // shows a brief "LEVEL UP!" flash

    this.attacking = false;
    this.attackTimer = 0;
    this.attackHasHit = false; // so one swing only hits once
    this.invincibleTimer = 0;  // brief mercy time after taking a hit

    // ---- Make It Super: dash / dodge ----
    this.dashTimer = 0;        // how long the current dash lasts
    this.dashCooldown = 0;     // stops dash spamming
    this.trail = [];           // recent positions for the afterimage effect
    this.displayedHp = this.hp; // Make It Super: easing - bar glides to real hp (sec. 4)
    // ---- Make It Super: timed power-ups (sec. 19) ----
    // Each active boost is { remaining, total, label, color }. Storing the TOTAL
    // (not just the remaining time) lets the HUD draw a countdown bar that empties
    // as the boost runs out.
    this.boosts = {};
  }

  // Start (or refresh) a timed boost. Re-grabbing a boost resets it to full.
  addBoost(id, seconds, label, color) {
    this.boosts[id] = { remaining: seconds, total: seconds, label, color };
  }
  // Is a given boost currently active?
  hasBoost(id) {
    return !!this.boosts[id] && this.boosts[id].remaining > 0;
  }
  // Tick every boost down; drop the ones that have expired.
  updateBoosts(dt) {
    for (const id in this.boosts) {
      this.boosts[id].remaining -= dt;
      if (this.boosts[id].remaining <= 0) delete this.boosts[id];
    }
  }

  // ---- XP & leveling ----
  // Grant XP and level up as many times as the XP allows.
  gainXP(amount) {
    this.xp += amount;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.levelUp();
    }
  }

  // ---- Coins / gold ----
  // The player's wallet. Enemies drop gold; the shop spends it.
  addGold(amount) {
    this.gold = (this.gold || 0) + amount;
    if (amount > 0) Sound.play("pickup");
  }
  spendGold(amount) {
    if ((this.gold || 0) < amount) return false;   // can't afford it
    this.gold -= amount;
    return true;
  }

  levelUp() {
    this.level += 1;
    this.maxHp += CONFIG.HP_PER_LEVEL;
    this.attackDamage += CONFIG.DAMAGE_PER_LEVEL;
    this.hp = this.maxHp;            // level up fully heals you
    this.justLeveledTimer = 1.6;     // flash "LEVEL UP!" for a moment
    // Each level needs more XP than the last.
    this.xpToNext = Math.round(CONFIG.XP_BASE * Math.pow(this.level, CONFIG.XP_GROWTH));
    Sound.play("quest");             // reuse the happy fanfare
  }

  // Restore HP (from a healing item), never above max.
  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
    Sound.play("pickup");
  }

  // The body rectangle, used for collisions with the world.
  get body() {
    return { x: this.x, y: this.y, w: this.width, h: this.height };
  }

  update(dt, map) {
    // ----- Count down timers -----
    if (this.invincibleTimer > 0) this.invincibleTimer -= dt;
    if (this.justLeveledTimer > 0) this.justLeveledTimer -= dt;

    // ----- Make It Super: dash / dodge -----
    if (this.dashCooldown > 0) this.dashCooldown -= dt;
    if (this.dashTimer > 0) this.dashTimer -= dt;
    // ----- Make It Super: easing HP bar (sec. 4) + power-up timers (sec. 19) -----
    this.displayedHp = this.displayedHp + (this.hp - this.displayedHp) * 0.15;
    this.updateBoosts(dt);   // tick every active timed boost, drop expired ones
    // Tap dash key to dash: a quick speed burst + brief invincibility.
    if (Input.wasPressed(this.keys.dash) && this.dashCooldown <= 0) {
      this.dashTimer = 0.18;        // dash lasts ~0.18s
      this.dashCooldown = 0.6;      // can dash again in 0.6s
      this.invincibleTimer = 0.18;  // i-frames during the dash (reuse what we have!)
    }

    // ----- Attacking -----
    if (this.attacking) {
      this.attackTimer -= dt;
      this.anim.update(dt, FRAMES.sword);
      if (this.attackTimer <= 0) {
        this.attacking = false;
        this.anim.reset();
      }
      return; // can't walk while mid-swing (keeps it simple & readable)
    }

    // Start an attack when the player presses their attack key.
    if (Input.wasPressed(this.keys.attack)) {
      this.startAttack();
      return;
    }

    // ----- Movement (reads THIS player's own keys) -----
    let dx = 0, dy = 0;
    if (Input.isDown(this.keys.left))  { dx -= 1; this.dir = DIR.LEFT; }
    if (Input.isDown(this.keys.right)) { dx += 1; this.dir = DIR.RIGHT; }
    if (Input.isDown(this.keys.up))    { dy -= 1; this.dir = DIR.UP; }
    if (Input.isDown(this.keys.down))  { dy += 1; this.dir = DIR.DOWN; }

    this.moving = (dx !== 0 || dy !== 0);

    if (this.moving) {
      // Normalize diagonals so you don't move faster going corner-to-corner.
      const len = Math.hypot(dx, dy);
      dx /= len; dy /= len;

      // Multiply by speed AND by dt (delta time). This is the key trick:
      // distance = speed * time, so movement is the same at any frame rate.
      // Make It Super: while dashing, move 3x; speed-boost power-up adds 60%.
      let speed = this.dashTimer > 0 ? CONFIG.PLAYER_SPEED * 3 : CONFIG.PLAYER_SPEED;
      if (this.hasBoost("speed")) speed *= CONFIG.SPEED_BOOST_MULTIPLIER;   // timed power-up (sec. 19)
      const stepX = dx * speed * dt;
      const stepY = dy * speed * dt;

      // Move on each axis separately so we can slide along walls.
      this.moveAxis(stepX, 0, map);
      this.moveAxis(0, stepY, map);

      this.anim.update(dt, FRAMES.run);
    } else {
      this.anim.update(dt, FRAMES.idle);
    }

    // ----- Make It Super: afterimage trail (sec. 19) -----
    // Record recent positions while DASHING or while a SPEED BOOST is active, so a
    // fast run leaves a visible streak of fading ghost bunnies. We record AFTER the
    // move so the trail follows the bunny's real path.
    const trailing = this.dashTimer > 0 || this.hasBoost("speed");
    if (trailing && this.moving) {
      this.trail.push({ x: this.x, y: this.y, dir: this.dir });
    }
    const maxTrail = 10;  // a longer trail reads clearly at the faster speed
    if (this.trail.length > maxTrail || !trailing) this.trail.shift();
  }

  // Try to move by (mx, my); cancel the move if it hits a solid tile.
  moveAxis(mx, my, map) {
    const nextX = this.x + mx;
    const nextY = this.y + my;

    // Check the four corners of the body at the new spot.
    const corners = [
      [nextX,                nextY],
      [nextX + this.width-1, nextY],
      [nextX,                nextY + this.height-1],
      [nextX + this.width-1, nextY + this.height-1],
    ];
    for (const [cx, cy] of corners) {
      if (map.isSolidAtPixel(cx, cy)) return; // blocked - don't move
    }
    this.x = nextX;
    this.y = nextY;
  }

  startAttack() {
    this.attacking = true;
    this.attackTimer = FRAMES.sword / CONFIG.ANIM_FPS; // length of the swing
    this.attackHasHit = false;
    this.anim.reset();
    Sound.play("attack");
  }

  // The sword's hit area: a BOX that reaches from the player's body out to the
  // drawn sword tip. The art shows the blade extending ~48 world-px past the body
  // edge, so a single far "point" missed enemies the blade clearly overlapped.
  // A reach box hits anything under the visible swing.
  getAttackBox() {
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;
    const halfBody = this.width / 2;                       // body edge from center
    const reach = halfBody + CONFIG.PLAYER_SWORD_REACH;    // out to the sword tip
    const t = CONFIG.PLAYER_SWORD_HALF_W;                  // blade half-thickness
    if (this.dir === DIR.RIGHT) return { x: cx,        y: cy - t,     w: reach, h: t * 2 };
    if (this.dir === DIR.LEFT)  return { x: cx - reach, y: cy - t,     w: reach, h: t * 2 };
    if (this.dir === DIR.UP)    return { x: cx - t,     y: cy - reach, w: t * 2, h: reach };
    return { x: cx - t, y: cy, w: t * 2, h: reach };       // down
  }

  // Kept for compatibility: the sword tip as a single point (used by some effects).
  getAttackPoint() {
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;
    const r = this.width / 2 + CONFIG.PLAYER_SWORD_REACH;
    if (this.dir === DIR.LEFT)  return { x: cx - r, y: cy };
    if (this.dir === DIR.RIGHT) return { x: cx + r, y: cy };
    if (this.dir === DIR.UP)    return { x: cx, y: cy - r };
    return { x: cx, y: cy + r }; // down
  }

  // Called by the battle system when an enemy hits us.
  takeDamage(amount) {
    if (this.invincibleTimer > 0) return; // still in mercy time
    this.hp = Math.max(0, this.hp - amount);
    this.invincibleTimer = 0.8; // 0.8s of invincibility
    Sound.play("hit");
  }

  get isDead() { return this.hp <= 0; }

  draw(ctx, camera) {
    // Make It Super: afterimage trail. Shown while dashing OR while a speed boost
    // is active, so fast movement leaves a visible streak of fading ghost bunnies.
    const boosting = this.hasBoost("speed");
    if ((this.dashTimer > 0 || boosting) && this.trail.length > 0) {
      const sheet = this.moving ? "bunny_run" : "bunny_idle";
      // The boost trail is stronger and longer than the dash trail so it clearly
      // reads as a speed streak rather than a faint shadow.
      const base = boosting ? 0.55 : 0.4;
      this.trail.forEach((t, i) => {
        ctx.globalAlpha = (i / this.trail.length) * base; // older copies are fainter
        const tx = Math.round(t.x - this.spriteOffsetX - camera.x);
        const ty = Math.round(t.y - this.spriteOffsetY - camera.y);
        this.anim.draw(ctx, sheet, t.dir, tx, ty);
      });
      ctx.globalAlpha = 1; // always reset!
    }

    // Blink while invincible from a HIT (not during a dash, so the dash stays smooth).
    const hurtBlink = this.invincibleTimer > 0 && this.dashTimer <= 0;
    if (hurtBlink && Math.floor(this.invincibleTimer * 12) % 2 === 0) {
      return;
    }
    const screenX = Math.round(this.x - this.spriteOffsetX - camera.x);
    const screenY = Math.round(this.y - this.spriteOffsetY - camera.y);
    const sheet = this.attacking ? "bunny_sword" : (this.moving ? "bunny_run" : "bunny_idle");
    this.anim.draw(ctx, sheet, this.dir, screenX, screenY);
  }
}
