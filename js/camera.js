// =============================================================
//  camera.js - Decides which part of the world is on screen.
// =============================================================
//  The world can be bigger than the screen. The camera is like a
//  window that follows the player around. We keep the player
//  centered, but stop the camera at the edges of the map so we
//  never show empty space outside it.
// =============================================================

// ============================================================================
// STARTER STUB - you write this file during the code-along (Week 1, Day 3).
// Follow the slides / Coding Companion for this week. If you fall behind,
// the complete version is in the matching weekN-checkpoint/js/camera.js.
// ============================================================================

// TODO: build this file here.
import { CONFIG } from "./config.js";

export class Camera {
    constructor() {
        this.x = 0
        this.y = 0
    }
    follow(target, map){
        this.x = target.x + target.width/2 - CONFIG.CANVAS_WIDTH / 2;
        this.y = target.y + target.height/2 - CONFIG.CANVAS_HEIGHT / 2;

        this.x = Math.max(0,Math.min(this.x,map.pixelWidth-CONFIG.CANVAS_WIDTH))
        this.y = Math.max(0, Math.min(this.y, map.pixelHeight - CONFIG.CANVAS_HEIGHT))

        if(map.pixelWidth < CONFIG.CANVAS_WIDTH)
            this.x = (map.pixelWidth - CONFIG.CANVAS_WIDTH) / 2;
        if(map.pixelHeight < CONFIG.CANVAS_HEIGHT)
            this.y = (map.pixelHeight - CONFIG.CANVAS_HEIGHT) / 2;
    }
}