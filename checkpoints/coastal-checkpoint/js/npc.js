// =============================================================
//  npc.js - Friendly characters you can talk to.
// =============================================================
//  An NPC (Non-Player Character) stands on the map. When the player
//  walks up and presses the talk key, we open a dialogue. NPCs can
//  also give quests (the dialogue lines and quest are set in the map
//  data from the editor).
// =============================================================

import { CONFIG } from "./config.js";
import { SpriteAnimator } from "./sprite.js";

export class NPC {
  constructor(data) {
    this.x = data.x;          // world pixel position
    this.y = data.y;
    this.width = CONFIG.SCALED_TILE;
    this.height = CONFIG.SCALED_TILE;
    this.sprite = data.sprite || "cow";   // which idle sheet to draw
    this.frames = data.frames || 1;       // idle animation columns
    this.name = data.name || "Villager";
    this.dialogue = data.dialogue || ["..."]; // shown before the quest starts
    // Optional extra dialogue sets that react to the quest state:
    this.dialogueInProgress = data.dialogueInProgress || null; // quest started, not done
    this.dialogueComplete = data.dialogueComplete || null;     // objectives all met
    this.givesQuest = data.givesQuest || null; // quest id this NPC starts
    this.shop = data.shop || false;            // true = this NPC opens the shop menu
    this.anim = new SpriteAnimator();
    this.facing = data.facing !== undefined ? data.facing : 0; // row 0 = facing down/forward (toward the viewer)
    this.staticIdle = data.staticIdle === true;
  }

  update(dt) {
    // Most NPC sheets are walking sheets. Keep them on frame 0 so they stand still
    // instead of looking like they are sliding sideways while talking.
    if (!this.staticIdle && this.frames > 1) this.anim.update(dt, this.frames);
  }

  // Is the player close enough to talk? The sprites are drawn larger than
  // their collision bodies, so we use a generous radius (~2 tiles) so that
  // "looks next to them" reliably counts as "near".
  isNear(player) {
    const dx = (this.x + this.width/2) - (player.x + player.width/2);
    const dy = (this.y + this.height/2) - (player.y + player.height/2);
    return Math.hypot(dx, dy) < CONFIG.SCALED_TILE * 2.2;
  }

  draw(ctx, camera) {
    const offset = (CONFIG.PLAYER_FRAME_SIZE * CONFIG.SCALE - this.width) / 2;
    const screenX = this.x - offset - camera.x;
    const screenY = this.y - (CONFIG.PLAYER_FRAME_SIZE*CONFIG.SCALE - this.height) + 6 - camera.y;
    this.anim.draw(ctx, this.sprite, this.facing, screenX, screenY);
  }
}
