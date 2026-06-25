// =============================================================
//  battle.js - Connects the player's sword to the enemies.
// =============================================================
//  Our combat is "action" style (like Zelda), not turn-based: you
//  swing in real time and hit whatever is in front of you. This file
//  holds the rule for "did the swing connect with an enemy?".
// =============================================================

import { CONFIG } from "./config.js";
import { Sound } from "./audio.js";
import { Particles, Floaters, Combo, Score } from "./effects.js";  // Make It Super

export const Battle = {
  // Check the player's active sword swing against every enemy.
  // Returns the type of any enemy that DIED this frame (for quests).
  resolvePlayerAttack(player, enemies, questLog, camera, game, who) {
    if (!player.attacking || player.attackHasHit) return;

    // `who` is "host" (player 1) or "guest" (player 2). Screen shake should only
    // happen for the player viewing THEIR OWN bunny's hit - it's annoying to feel
    // a shake from your teammate's attack on the other side of the map. ONLINE, the
    // host's screen only follows player 1, so we only shake for who==="host" (the
    // guest replays its own shake from the fx event). OFFLINE local co-op shares one
    // screen, so both bunnies' hits shake as before.
    const shakeLocally = !(game && game.online) || who === "host";

    // Only land the hit on the middle frames of the swing (feels right).
    const swingProgress = 1 - (player.attackTimer / (9 / CONFIG.ANIM_FPS));
    if (swingProgress < 0.3 || swingProgress > 0.7) return;

    const box = player.getAttackBox(); // the sword's reach rectangle

    for (const enemy of enemies) {
      if (enemy.state === "dead") continue;
      // Does the sword's reach box overlap the enemy's body box? (AABB overlap)
      const inside =
        box.x < enemy.x + enemy.width  && box.x + box.w > enemy.x &&
        box.y < enemy.y + enemy.height && box.y + box.h > enemy.y;
      if (inside) {
        const wasAlive = enemy.hp > 0;
        enemy.takeDamage(player.attackDamage); // scales as the player levels up
        player.attackHasHit = true; // one swing, one hit

        // ----- Make It Super: stack effects for a satisfying hit -----
        const ex = enemy.x + enemy.width / 2, ey = enemy.y + enemy.height / 2;
        Particles.burst(ex, ey, "#fff2a0", 14);                 // spark splash (sec.1)
        // Floating damage number: turns gold/orange as your combo climbs, so big
        // streaks read as "critical" hits. (Bigger combo = hotter color.)
        const combo = Combo.count || 0;
        const dmgColor = combo >= 6 ? "#ffce54" : combo >= 3 ? "#ffac5f" : "#ff8a8a";
        Floaters.spawn(ex + 18, ey - 40, "-" + player.attackDamage, dmgColor); // number (sec.5)
        if (camera && shakeLocally) camera.shake(0.1, 4);      // screen shake (sec.2) - own bunny only
        // The combo counter is personal: it should only climb for the bunny on
        // THIS screen. Online, that's player 1 on the host (shakeLocally), so the
        // guest's hits don't bump the host's combo. The guest bumps its own combo
        // when it replays its own hit event (see playFxEvent).
        if (shakeLocally) Combo.hit();                         // combo counter (sec.18)
        // Record this hit so the host can tell the guest to play the same effect.
        // We tag it with WHO swung so the guest only shakes for its own bunny.
        if (game && game.addFxEvent) game.addFxEvent({ kind: "hit", x: ex, y: ey, dmg: player.attackDamage, combo, by: who });
        // knockback: shove the enemy away from the player (sec.17)
        const dx = ex - (player.x + player.width / 2);
        const dy = ey - (player.y + player.height / 2);
        const len = Math.hypot(dx, dy) || 1;
        enemy.knockX = (dx / len) * 420;
        enemy.knockY = (dy / len) * 420;
        enemy.bounceT = 0.5;   // start the up-and-down hop (sec.17)

        if (wasAlive && enemy.hp <= 0) {
          questLog.onDefeat(enemy.type); // tell quests an enemy died
          player.gainXP(enemy.xpReward); // reward XP for the kill
          Score.add(10);                 // score + high score (sec.21)
          if (game && game.onEnemyKilled) game.onEnemyKilled(enemy, player); // coins + drops
          // bigger green burst + XP popup on a kill
          Particles.burst(ex, ey, "#9ad9b0", 22);
          Floaters.spawn(ex, ey - 48, "+" + enemy.xpReward + " XP", "#ffd98a");
          if (camera && shakeLocally) camera.shake(0.16, 6);
          if (game && game.addFxEvent) game.addFxEvent({ kind: "kill", x: ex, y: ey, xp: enemy.xpReward, by: who });
        }
        break; // hit one enemy per swing
      }
    }
  },
};
