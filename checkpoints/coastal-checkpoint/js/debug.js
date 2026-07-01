// =============================================================
//  debug.js - Visual debugging overlays for students.
// =============================================================
//  Press the number keys to toggle different "see what's happening"
//  overlays. These don't change how the game PLAYS - they just draw
//  extra info on top so you can SEE collision boxes, enemy brains,
//  A* paths, and the framerate. This is exactly how real game
//  developers debug: make the invisible visible.
//
//  Toggle keys (handled in game.js input):
//    1  - hitboxes      (red = full sprite frame, green = body box)
//    3  - enemy AI      (state label + sight/attack range rings)
//    4  - A* paths      (the route each enemy is walking)
//    5  - tile grid     (cell lines + solid tiles tinted)
//    6  - FPS / dt meter (top-right performance readout)
//    0  - turn ALL overlays off
//    `  - master toggle (show/hide the little legend)
//  (Key 2 is left alone - it drops in Player 2 for co-op.)
// =============================================================

import { CONFIG } from "./config.js";

export const Debug = {
  // each overlay on/off
  hitboxes: false,
  ai: false,
  paths: false,
  grid: false,
  perf: false,
  legend: false,

  // rolling FPS measurement
  _frames: 0,
  _accum: 0,
  _fps: 0,
  _dt: 0,

  anyOn() { return this.hitboxes || this.ai || this.paths || this.grid || this.perf; },

  toggle(which) {
    if (which === "all-off") {
      this.hitboxes = this.ai = this.paths = this.grid = this.perf = false;
      return;
    }
    if (which in this) this[which] = !this[which];
  },

  // call once per frame with dt so the perf meter stays current
  tick(dt) {
    this._dt = dt;
    this._accum += dt;
    this._frames += 1;
    if (this._accum >= 0.5) {                 // refresh twice a second
      this._fps = Math.round(this._frames / this._accum);
      this._frames = 0;
      this._accum = 0;
    }
  },

  // ----- the main draw, called at the very end of game.draw() -----
  draw(ctx, game) {
    // Only draw debug overlays during active gameplay - never over the dialogue box,
    // inventory, title, or game-over screens (they'd overlap that UI).
    if (game.state !== "playing") return;
    const cam = game.camera;
    if (this.grid)     this._drawGrid(ctx, game, cam);
    if (this.hitboxes) this._drawHitboxes(ctx, game, cam);
    if (this.ai)       this._drawAI(ctx, game, cam);
    if (this.paths)    this._drawPaths(ctx, game, cam);
    if (this.perf)     this._drawPerf(ctx, game);
    if (this.legend)   this._drawLegend(ctx);
  },

  // --- 1: hitboxes (frame vs. body) ---
  _drawHitboxes(ctx, game, cam) {
    const frame = CONFIG.PLAYER_FRAME_SIZE * CONFIG.SCALE;   // 144
    const drawOne = (o, offX, offY) => {
      // full sprite frame in red (mostly empty padding)
      ctx.strokeStyle = "rgba(255,70,70,0.85)";
      ctx.lineWidth = 2;
      ctx.strokeRect(o.x - offX - cam.x, o.y - offY - cam.y, frame, frame);
      // real body/collision box in green
      ctx.strokeStyle = "rgba(50,220,100,1)";
      ctx.lineWidth = 3;
      ctx.strokeRect(o.x - cam.x, o.y - cam.y, o.width, o.height);
    };
    for (const p of game.players) {
      drawOne(p, p.spriteOffsetX ?? 0, p.spriteOffsetY ?? 0);
      // while swinging, show the sword's REACH BOX (orange) - it should line up with
      // the drawn blade and reach well past the body (Bug 5).
      if (p.attacking && p.getAttackBox) {
        const box = p.getAttackBox();
        ctx.strokeStyle = "rgba(255,150,0,0.95)";
        ctx.lineWidth = 2;
        ctx.strokeRect(box.x - cam.x, box.y - cam.y, box.w, box.h);
      }
    }
    for (const e of game.enemies) {
      // The enemy art is centered in its frame (just like the player), so the frame
      // overlay uses the same half-padding offset on BOTH axes.
      const offX = (frame - e.width) / 2;
      const offY = (frame - e.height) / 2;
      drawOne(e, offX, offY);
    }
  },

  // --- 2: enemy AI (state label + range rings) ---
  _drawAI(ctx, game, cam) {
    ctx.textAlign = "center";
    ctx.font = "bold 12px monospace";
    for (const e of game.enemies) {
      const cx = e.x + e.width / 2 - cam.x;
      const cy = e.y + e.height / 2 - cam.y;
      const def = e.def || {};
      // sight range (yellow) and attack range (red)
      if (def.sightRange) {
        ctx.strokeStyle = "rgba(255,210,90,0.55)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, def.sightRange, 0, Math.PI * 2); ctx.stroke();
      }
      if (def.attackRange) {
        ctx.strokeStyle = "rgba(230,90,90,0.7)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, def.attackRange, 0, Math.PI * 2); ctx.stroke();
      }
      // roam radius (green) drawn around HOME, plus the current wander target
      if (e.roams) {
        const hx = e.homeX + e.width / 2 - cam.x;
        const hy = e.homeY + e.height / 2 - cam.y;
        const radiusPx = (e.roamRadius || 4) * ((game.astar && game.astar.CELL) || 48);
        ctx.strokeStyle = "rgba(110,210,130,0.5)"; ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.arc(hx, hy, radiusPx, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        if (e.roamTarget) {
          ctx.fillStyle = "rgba(110,210,130,0.9)";
          ctx.beginPath();
          ctx.arc(e.roamTarget.x - cam.x, e.roamTarget.y - cam.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // state label above the enemy, colored by state
      const colors = { idle: "#9ad8ff", roam: "#9ad8b0", chase: "#ffd98a", hurt: "#ff8a8a", dead: "#888" };
      const label = (e.state || "?").toUpperCase();
      ctx.fillStyle = colors[e.state] || "#fff";
      const ty = e.y - cam.y - 14;
      ctx.strokeStyle = "rgba(0,0,0,0.8)"; ctx.lineWidth = 3;
      ctx.strokeText(label, cx, ty);
      ctx.fillText(label, cx, ty);
    }
    ctx.textAlign = "left";
  },

  // --- 3: A* paths (the route each enemy is walking) ---
  _drawPaths(ctx, game, cam) {
    const CELL = (game.astar && game.astar.CELL) || CONFIG.SCALED_TILE || 48;
    for (const e of game.enemies) {
      const path = e.path;
      if (!path || !path.length) continue;
      ctx.strokeStyle = "rgba(90,200,255,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(e.x + e.width / 2 - cam.x, e.y + e.height / 2 - cam.y);
      for (const cell of path) {
        const px = cell.c * CELL + CELL / 2 - cam.x;
        const py = cell.r * CELL + CELL / 2 - cam.y;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
      // dots at each cell on the path
      ctx.fillStyle = "rgba(90,200,255,0.9)";
      for (const cell of path) {
        const px = cell.c * CELL + CELL / 2 - cam.x;
        const py = cell.r * CELL + CELL / 2 - cam.y;
        ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
  },

  // --- 4: tile grid (cell lines + solid tiles tinted) ---
  _drawGrid(ctx, game, cam) {
    const map = game.map;
    if (!map) return;
    const T = CONFIG.SCALED_TILE;
    const startC = Math.floor(cam.x / T), endC = Math.ceil((cam.x + CONFIG.CANVAS_WIDTH) / T);
    const startR = Math.floor(cam.y / T), endR = Math.ceil((cam.y + CONFIG.CANVAS_HEIGHT) / T);
    ctx.lineWidth = 1;
    for (let r = startR; r <= endR; r++) {
      for (let c = startC; c <= endC; c++) {
        const x = c * T - cam.x, y = r * T - cam.y;
        // tint solid tiles so you can SEE the collision map
        const solid = map.isSolidAtPixel && map.isSolidAtPixel(c * T + T / 2, r * T + T / 2);
        if (solid) {
          ctx.fillStyle = "rgba(230,90,90,0.28)";
          ctx.fillRect(x, y, T, T);
        }
        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.strokeRect(x, y, T, T);
      }
    }
  },

  // --- 5: FPS / dt meter ---
  _drawPerf(ctx, game) {
    const x = CONFIG.CANVAS_WIDTH - 150, y = 12, w = 138, h = 56;
    ctx.fillStyle = "rgba(20,28,40,0.85)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(120,180,230,0.8)"; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.textAlign = "left";
    ctx.font = "bold 13px monospace";
    ctx.fillStyle = this._fps >= 50 ? "#7be0a0" : (this._fps >= 30 ? "#ffd98a" : "#ff8a8a");
    ctx.fillText(`FPS  ${this._fps}`, x + 10, y + 22);
    ctx.fillStyle = "#bcd4ea";
    ctx.font = "12px monospace";
    ctx.fillText(`dt   ${(this._dt * 1000).toFixed(1)} ms`, x + 10, y + 40);
    const enemies = game.enemies ? game.enemies.length : 0;
    ctx.fillText(`enemies ${enemies}`, x + 10, y + 52);
  },

  // --- legend (always shown unless toggled with backtick) ---
  _drawLegend(ctx) {
    const lines = [
      "DEBUG  [`] hide",
      `1 hitboxes ${this.hitboxes ? "ON" : "off"}`,
      `3 enemy AI ${this.ai ? "ON" : "off"}`,
      `4 A* paths ${this.paths ? "ON" : "off"}`,
      `5 tile grid ${this.grid ? "ON" : "off"}`,
      `6 perf     ${this.perf ? "ON" : "off"}`,
      "0 all off",
    ];
    const x = 12, y = CONFIG.CANVAS_HEIGHT - lines.length * 16 - 14;
    ctx.fillStyle = "rgba(20,28,40,0.82)";
    ctx.fillRect(x - 6, y - 6, 150, lines.length * 16 + 12);
    ctx.strokeStyle = "rgba(120,180,230,0.7)"; ctx.lineWidth = 1;
    ctx.strokeRect(x - 5.5, y - 5.5, 149, lines.length * 16 + 11);
    ctx.textAlign = "left";
    ctx.font = "11px monospace";
    lines.forEach((l, i) => {
      ctx.fillStyle = i === 0 ? "#ffd98a" : (l.includes("ON") ? "#7be0a0" : "#9fb6c9");
      ctx.fillText(l, x, y + 12 + i * 16);
    });
  },
};
