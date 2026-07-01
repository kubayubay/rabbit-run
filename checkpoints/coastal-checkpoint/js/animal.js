// =============================================================
//  animal.js - Wildlife rescue targets for California Coast Rescue.
// =============================================================
//  Animals are friendly entities. They wait in polluted spots until
//  a player gets close/overlaps them, then they are rescued, which
//  advances rescue quests and improves the ecosystem meter.
// =============================================================

import { CONFIG } from "./config.js";
import { SpriteAnimator } from "./sprite.js";

export class Animal {
  constructor(data) {
    this.x = data.x;
    this.y = data.y;
    this.width = CONFIG.SCALED_TILE;
    this.height = CONFIG.SCALED_TILE;
    this.type = data.type || "animal";
    this.name = data.name || "Animal";
    this.sprite = data.sprite || "turtle";
    this.frames = data.frames || 4;
    this.rescueText = data.rescueText || `${this.name} rescued!`;
    this.rescued = false;
    this.rescueTimer = 0;
    this.anim = new SpriteAnimator();
    this.bobPhase = (this.x * 0.017 + this.y * 0.013);
    this.facing = data.facing !== undefined ? data.facing : 0;
  }

  update(dt) {
    this.anim.update(dt, this.frames);
    if (this.rescueTimer > 0) this.rescueTimer -= dt;
  }

  isNear(player) {
    const dx = (this.x + this.width/2) - (player.x + player.width/2);
    const dy = (this.y + this.height/2) - (player.y + player.height/2);
    return Math.hypot(dx, dy) < CONFIG.SCALED_TILE * 1.6;
  }

  overlaps(player) {
    return this.x < player.x + player.width &&
           this.x + this.width > player.x &&
           this.y < player.y + player.height &&
           this.y + this.height > player.y;
  }

  rescue() {
    if (this.rescued) return false;
    this.rescued = true;
    this.rescueTimer = 1.2;
    return true;
  }

  get doneFade() { return this.rescued && this.rescueTimer <= 0; }

  draw(ctx, camera) {
    if (this.doneFade) return;
    const offset = (CONFIG.PLAYER_FRAME_SIZE * CONFIG.SCALE - this.width) / 2;
    const t = performance.now() / 320 + this.bobPhase;
    const idleBobY = Math.sin(t) * 2;
    const idleBobX = Math.sin(t * 0.53) * 1;
    const sx = Math.round(this.x - offset - camera.x + idleBobX);
    const sy = Math.round(this.y - offset - camera.y + idleBobY);
    if (this.rescued) {
      ctx.save();
      ctx.globalAlpha = Math.max(0.15, Math.min(1, this.rescueTimer));
      this.anim.draw(ctx, this.sprite, this.facing, sx, sy - (1.2 - this.rescueTimer) * 18);
      ctx.fillStyle = "#9ad9b0";
      ctx.font = "bold 16px monospace";
      ctx.fillText("♥", sx + 62, sy + 35 - (1.2 - this.rescueTimer) * 18);
      ctx.restore();
      return;
    }

    // A tiny red debris marker tells the player this animal needs help.
    this.anim.draw(ctx, this.sprite, this.facing, sx, sy);
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
    ctx.fillStyle = `rgba(255, 92, 92, ${0.65 + 0.25 * pulse})`;
    ctx.font = "bold 15px monospace";
    ctx.fillText("!", sx + 70, sy + 30);
  }
}
