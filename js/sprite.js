// =============================================================
//  sprite.js - Plays animations from a sprite sheet.
// =============================================================
//  A sprite sheet is one image holding many frames in a grid.
//  For our characters: each frame is 48x48, and the 4 ROWS are the
//  4 facing directions, in this order:
//      row 0 = down, row 1 = up, row 2 = left, row 3 = right
//  The COLUMNS are the animation frames for that direction.
//
//  This class steps through columns over time so the character
//  appears to move. It is framerate-INDEPENDENT: we advance the
//  animation based on real seconds, not on how fast the game loops.
// =============================================================

// ============================================================================
// STARTER STUB - you write this file during the code-along (Week 2, Day 1).
// Follow the slides / Coding Companion for this week. If you fall behind,
// the complete version is in the matching weekN-checkpoint/js/sprite.js.
// ============================================================================

// TODO: build this file here.
import { CONFIG } from './config.js'
import { Images} from './assets.js'
   
export class SpriteAnimator {
    constructor(frameSize = CONFIG.PLAYER_FRAME_SIZE) {
        this.frameSize = frameSize;
        this.frameIndex = 0;
        this.timer = 0;
        this.frameDuration = 1 / CONFIG.ANIM_FPS;
    }

    update(dt, frameCount) {
        this.timer += dt;
        if (this.timer >= this.frameDuration) {
            this.timer -= this.frameDuration;
            this.frameIndex = (this.frameIndex + 1) % frameCount;
        }
    }

    reset() { this.frameIndex - 0; this.timer = 0; }

    draw(ctx, imageName, row, x, y) {
        const img = Images[imageName];
        if (!img) return;
        const sx = this.frameIndex * this.frameSize;
        const sy = row * this.frameSize;
        const size = this.frameSize * CONFIG.SCALE;
        ctx.drawImage(img, sx, sy, this.frameSize, this.frameSize, x, y, size, size);

    }
}
export const DIR = { UP: 0, DOWN: 3, LEFT: 2, RIGHT: 1 };