// =============================================================
//  game.js - The conductor. Ties every system together.
// =============================================================
//  This file:
//    1. Loads assets, then the map.
//    2. Runs the GAME LOOP (update + draw, many times a second).
//    3. Keeps track of the current STATE (title, playing, dialogue,
//       inventory, gameover, win) and behaves differently in each.
//
//  THE GAME LOOP & "DELTA TIME"
//  ----------------------------
//  Computers run at different speeds. If we moved the player "2px
//  per frame", a fast computer would zoom and a slow one would crawl.
//  Instead we measure how many SECONDS passed since the last frame
//  (we call it `dt`, for "delta time") and move "speed * dt" pixels.
//  Now everyone moves the same real-world speed. That's what
//  "framerate independent" means.
// =============================================================

// ============================================================================
// STARTER STUB - you write this file during the code-along (Week 1, Day 3 (grows every week)).
// Follow the slides / Coding Companion for this week. If you fall behind,
// the complete version is in the matching weekN-checkpoint/js/game.js.
// ============================================================================

// TODO: build this file here.
import { CONFIG } from "./config.js";
import { loadAllAssets } from "./assets.js";
import { Input } from "./input.js";
import { TileMap } from "./tilemap.js";
import { Camera } from "./camera.js";
import { Player } from "./player.js";

class Game {
    constructor(canvas) {
        this.ctx = canvas.getContext("2d");
        this.ctx.imageSmoothingEnabled = false;
        this.lastTime = 0;
    }
    async boot(){
        await loadAllAssets();
        const res = await fetch("assets/map_meadow.json");
        const mapData = await res.json();
        this.map = new TileMap(mapData);
        this.camera = new Camera();
        this.player = new Player(mapData.playerStart.x, mapData.playerStart.y);

        requestAnimationFrame(this.loop.bind(this))
    }
    loop(timestamp) {
        let dt = (timestamp - this.lastTime)/1000;
        this.lastTime = timestamp;
        if(dt > 0.05) dt = 0.05;

        this.update(dt, this.map);
    
        this.draw();
        Input.clearFrame();
        requestAnimationFrame(this.loop.bind(this))
    }
    update(dt){
        this.player.update(dt, this.map);
        this.camera.follow(this.player, this.map);
    }
    draw(){
        const ctx = this.ctx;
        ctx.fillStyle = "1a1420";
        ctx.fillRect(0,0,CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);
        this.map.drawLayer(ctx, "ground", this.camera);
        this.player.draw(ctx, this.camera);
        this.map.drawLayer(ctx, "decor", this.camera);
    }
}
window.addEventListener("load", ()=> {
    const canvas = document.getElementById("game");
    canvas.width = CONFIG.CANVAS_WIDTH;
    canvas.height = CONFIG.CANVAS_HEIGHT;
    new Game(canvas).boot();
})