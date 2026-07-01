// =============================================================
//  camera.js - Decides which part of the world is on screen.
// =============================================================
//  The world can be bigger than the screen. The camera is like a
//  window that follows the player around. We keep the player
//  centered, but stop the camera at the edges of the map so we
//  never show empty space outside it.
// =============================================================

import { CONFIG } from "./config.js";

export class Camera {
  constructor() {
    this.x = 0; // top-left corner of the camera, in world pixels
    this.y = 0;
    this.shakeTime = 0;       // seconds of shake left   (Make It Super)
    this.shakeStrength = 0;   // how many pixels to jiggle
  }

  // Start a screen shake, e.g. camera.shake(0.15, 5). (Make It Super: screen shake)
  shake(duration, strength) {
    this.shakeTime = duration;
    this.shakeStrength = strength;
  }

  // Center on a target (the player), then clamp to the map bounds.
  follow(target, map, dt = 0) {
    // Center the target on screen.
    this.x = target.x + target.width / 2 - CONFIG.CANVAS_WIDTH / 2;
    this.y = target.y + target.height / 2 - CONFIG.CANVAS_HEIGHT / 2;

    // clamp(value, min, max): keep the camera inside the map.
    this.x = Math.max(0, Math.min(this.x, map.pixelWidth - CONFIG.CANVAS_WIDTH));
    this.y = Math.max(0, Math.min(this.y, map.pixelHeight - CONFIG.CANVAS_HEIGHT));

    // If the map is smaller than the screen, just pin to 0.
    if (map.pixelWidth < CONFIG.CANVAS_WIDTH) this.x = (map.pixelWidth - CONFIG.CANVAS_WIDTH) / 2;
    if (map.pixelHeight < CONFIG.CANVAS_HEIGHT) this.y = (map.pixelHeight - CONFIG.CANVAS_HEIGHT) / 2;

    // Round to whole pixels. The player moves by fractional amounts each
    // frame (speed * dt), so without this the camera lands on a fraction of a
    // pixel and the browser anti-aliases every tile edge - that's what shows up
    // as faint "gridlines" between tiles. Snapping to integers removes them.
    this.x = Math.round(this.x);
    this.y = Math.round(this.y);

    // Screen shake (Make It Super): jiggle a few pixels for a split second.
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const s = this.shakeStrength;
      this.x += (Math.random() * 2 - 1) * s;
      this.y += (Math.random() * 2 - 1) * s;
    }
  }
}
