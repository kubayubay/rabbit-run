// =============================================================
//  sprite.js - Plays animations from a sprite sheet.
// =============================================================
//  A sprite sheet is one image holding many frames in a grid.
//  For our characters: each frame is 48x48, and the 4 ROWS are the
//  4 facing directions, in this order:
//      row 0 = down/front, row 1 = up/back, row 2 = left, row 3 = right
//  The COLUMNS are the animation frames for that direction.
//
//  This class steps through columns over time so the character
//  appears to move. It is framerate-INDEPENDENT: we advance the
//  animation based on real seconds, not on how fast the game loops.
// =============================================================

import { CONFIG } from "./config.js";
import { Images } from "./assets.js";

export class SpriteAnimator {
  constructor(frameSize = CONFIG.PLAYER_FRAME_SIZE) {
    this.frameSize = frameSize;
    this.frameIndex = 0;  // which column we're showing
    this.timer = 0;       // seconds since we last changed frame
    this.frameDuration = 1 / CONFIG.ANIM_FPS; // seconds each frame is shown
  }

  // Advance the animation. dt = seconds since last frame.
  // frameCount = how many columns this animation has.
  update(dt, frameCount) {
    this.timer += dt;
    if (this.timer >= this.frameDuration) {
      this.timer -= this.frameDuration;
      this.frameIndex = (this.frameIndex + 1) % frameCount;
    }
  }

  // Reset to the first frame (e.g. when an enemy stops moving).
  reset() { this.frameIndex = 0; this.timer = 0; }

  // Draw the current frame.
  //   imageName : key into Images (e.g. "bunny_run")
  //   row       : which direction-row to use
  //   x, y      : where on the screen to draw (top-left)
  draw(ctx, imageName, row, x, y) {
    const img = Images[imageName];
    if (!img) return;
    const sx = this.frameIndex * this.frameSize;
    const sy = row * this.frameSize;
    const size = this.frameSize * CONFIG.SCALE;
    ctx.drawImage(img, sx, sy, this.frameSize, this.frameSize, x, y, size, size);
  }
}

// Direction numbers = which ROW of the sprite sheet to draw for each facing.
// IMPORTANT: these match the actual row order in the character sprite sheets.
// Row 0 = FRONT view (facing the viewer = DOWN). Row 1 = BACK view (facing away = UP).
// Row 2 = facing LEFT. Row 3 = facing RIGHT.
export const DIR = { UP: 1, DOWN: 0, LEFT: 2, RIGHT: 3 };
