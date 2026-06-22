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

import { CONFIG } from "./config.js";
import { loadAllAssets, Images } from "./assets.js";
import { Input } from "./input.js";
import { Sound } from "./audio.js";
import { TileMap } from "./tilemap.js";
import { Camera } from "./camera.js";
import { Player, KEYMAP_P1, KEYMAP_P2 } from "./player.js";
import { NPC } from "./npc.js";
import { Enemy } from "./enemy.js";
import { Item, Inventory } from "./item.js";
import { QuestLog } from "./quest.js";
import { Dialogue } from "./dialogue.js";
import { Battle } from "./battle.js";
import { UI } from "./ui.js";
import { Particles, Floaters, Combo, Weather, Score } from "./effects.js";  // Make It Super
import { Debug } from "./debug.js";  // visual debugging overlays (press 1/3/4/5/6, 0, `)
import { AStar } from "./astar.js";  // pathfinding for smart enemies

// The possible states the game can be in.
const STATE = {
  LOADING: "loading",
  TITLE: "title",
  PLAYING: "playing",
  DIALOGUE: "dialogue",
  INVENTORY: "inventory",
  PAUSED: "paused",
  SHOP: "shop",
  GAMEOVER: "gameover",
  WIN: "win",
};

class Game {
  constructor(canvas) {
    this.ctx = canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false; // keep pixel art crisp
    this.state = STATE.LOADING;
    this.lastTime = 0;
    this.wave = 0;         // Make It Super: enemy waves (sec. 22)
    this.waveTimer = 0;
    this.wipe = 0;           // Make It Super: screen-wipe transition (sec. 23)
    this.portalFlash = 0;    // legacy flash (kept harmless)
    this.portalWarp = 0;     // wormhole warp animation: 1 -> 0
    this.portalWarpDir = 0;  // 1 = diving in, -1 = emerging out
    this.warpTime = 0;       // seconds elapsed in the current warp (drives the swerve)
    this.warpParticles = []; // streaking light particles flying past during the warp
    this.fireworks = [];     // YOU WIN celebration: rockets + sparkle bursts
    this.winTime = 0;        // seconds since the win screen appeared
    this.endScreenTime = 0;  // grace timer for WIN/GAMEOVER dismiss input
    this._fwLastT = 0;       // timestamp for the fireworks frame delta
    this.wipeDir = 0;        // 1 = closing, -1 = opening
  }

  // Make It Super: enemy waves (sec. 22) - spawn an enemy at a safe edge tile.
  // Mixes slimes and bats (so bat quests can still progress from waves), and never
  // drops an enemy onto a solid tile, so nothing spawns stuck in a wall or border.
  spawnEnemyAtRandomEdge() {
    const T = CONFIG.SCALED_TILE;
    const cols = this.map.width, rows = this.map.height;
    // pick a walkable cell near a random edge; retry a handful of times
    let cell = null;
    for (let tries = 0; tries < 30 && !cell; tries++) {
      const edge = Math.floor(Math.random() * 4);
      let c, r;
      if (edge === 0) { c = 1 + Math.floor(Math.random() * (cols - 2)); r = 2; }
      else if (edge === 1) { c = 1 + Math.floor(Math.random() * (cols - 2)); r = rows - 3; }
      else if (edge === 2) { c = 2; r = 1 + Math.floor(Math.random() * (rows - 2)); }
      else { c = cols - 3; r = 1 + Math.floor(Math.random() * (rows - 2)); }
      if (!this.map.isSolid(c, r)) cell = { c, r };
    }
    if (!cell) return;                         // map too crowded; skip this spawn
    // ~1 in 3 spawns is a bat, the rest slimes
    const type = Math.random() < 0.34 ? "bat" : "slime";
    const e = new Enemy({ type, x: cell.c * T, y: cell.r * T, kind: "enemy",
                          coins: type === "bat" ? 5 : 4 });
    this.enemies.push(e);
  }

  // Make sure the Level 2 portal exists in the Warren. Pushes it if missing.
  // `silent` skips the "opened!" announcement (used when it's just persisting across
  // a return trip rather than opening for the first time).
  ensureLevel2Portal(silent = false) {
    const hasPortal = (this.doors || []).some(d => d.portal && d.toMap === "map_meadow2");
    if (hasPortal) return;
    this.doors = this.doors || [];
    this.doors.push({ col: 28, row: 18, w: 1, h: 1,
      toMap: "map_meadow2", toCol: 24, toRow: 6, newLevel: true, portal: true });
    if (!this.level2Unlocked) {
      this.level2Unlocked = true;
      if (!silent) {
        Sound.play("quest");
        Floaters.spawn(this.player.x + 24, this.player.y - 10, "Level 2 portal opened!", "#9ad9b0");
      }
    }
  }

  // ---- Coins + item drops when an enemy is defeated ----
  // Called by battle.js the moment an enemy's hp hits 0.
  onEnemyKilled(enemy, player) {
    // 1) coins: add to the wallet and pop a gold number
    const coins = enemy.coins ?? CONFIG.COINS_PER_KILL;
    if (coins > 0) {
      player.addGold(coins);
      Floaters.spawn(enemy.x + enemy.width / 2, enemy.y - 20, "+" + coins + "g", "#ffd24a");
    }
    // 2) item drop: maybe leave an item on the ground for the player to grab
    if (enemy.dropId && Math.random() < (enemy.dropChance || 0)) {
      this.items.push(new Item({
        x: enemy.x, y: enemy.y,
        id: enemy.dropId,
        name: enemy.dropName || enemy.dropId,
        tile: enemy.dropTile || "crops:24",
        heal: enemy.dropHeal || 0,
      }));
    }
  }

  // ---- Trigger zones: fire a quest "reach" objective when the player enters ----
  // Zones come from the map's `triggers` array: { id, col, row, w, h }.
  checkTriggerZones() {
    if (!this.triggers) return;
    const p = this.player;
    for (const z of this.triggers) {
      if (z.fired) continue;                         // only the first time
      const zx = z.col * CONFIG.SCALED_TILE, zy = z.row * CONFIG.SCALED_TILE;
      const zw = (z.w || 1) * CONFIG.SCALED_TILE, zh = (z.h || 1) * CONFIG.SCALED_TILE;
      const hit = p.x < zx + zw && p.x + p.width > zx &&
                  p.y < zy + zh && p.y + p.height > zy;
      if (hit) {
        z.fired = true;
        this.questLog.onReach(z.id);                 // advance any "reach" objective
      }
    }
  }

  // ---- Save / load with localStorage ----
  saveGame() {
    const p = this.player;
    const data = {
      version: 1,
      map: this.currentMap,                          // which map the player is on
      player: {
        x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp, level: p.level,
        xp: p.xp, xpToNext: p.xpToNext, attackDamage: p.attackDamage, gold: p.gold || 0,
      },
      inventory: this.inventory.items,
      quests: this.serializeQuests(),
      triggers: (this.triggers || []).map(z => ({ id: z.id, fired: !!z.fired })),
    };
    try {
      localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(data));
      Floaters.spawn(p.x + p.width / 2, p.y - 30, "Saved!", "#9ad9b0");
      Sound.play("quest");
    } catch (e) { console.warn("Save failed:", e); }
  }

  hasSave() {
    try { return !!localStorage.getItem(CONFIG.SAVE_KEY); } catch (e) { return false; }
  }

  async loadGame() {
    let data;
    try { data = JSON.parse(localStorage.getItem(CONFIG.SAVE_KEY)); } catch (e) { return false; }
    if (!data || !data.player) return false;
    // If the save was on a different map, load that map's world first.
    if (data.map && data.map !== this.currentMap) {
      this.currentMap = data.map;
      this.mapData = await this.fetchMap(data.map);
      this.loadWorld();
    }
    const p = this.player;
    Object.assign(p, data.player);                   // restore hp, level, gold, etc.
    p.displayedHp = p.hp;
    this.inventory.items = data.inventory || {};
    this.restoreQuests(data.quests || {});
    // restore which trigger zones have already fired
    if (this.triggers && data.triggers) {
      for (const saved of data.triggers) {
        const z = this.triggers.find(t => t.id === saved.id);
        if (z) z.fired = saved.fired;
      }
    }
    Floaters.spawn(p.x + p.width / 2, p.y - 30, "Loaded!", "#9ad8ff");
    Sound.play("select");
    return true;
  }

  // Compact quest progress for saving: per quest, started/completed + objective counts.
  serializeQuests() {
    const out = {};
    for (const id in this.questLog.quests) {
      const q = this.questLog.quests[id];
      out[id] = {
        started: q.started, completed: q.completed, turnedIn: q.turnedIn,
        objectives: q.objectives.map(o => o.current),
      };
    }
    out._tallies = {
      defeats: this.questLog.defeats, talked: this.questLog.talked, visited: this.questLog.visited,
    };
    return out;
  }
  restoreQuests(saved) {
    for (const id in saved) {
      if (id === "_tallies") continue;
      const q = this.questLog.quests[id];
      if (!q) continue;
      q.started = saved[id].started; q.completed = saved[id].completed; q.turnedIn = saved[id].turnedIn;
      saved[id].objectives.forEach((c, i) => { if (q.objectives[i]) q.objectives[i].current = c; });
    }
    if (saved._tallies) {
      this.questLog.defeats = saved._tallies.defeats || {};
      this.questLog.talked = saved._tallies.talked || {};
      this.questLog.visited = saved._tallies.visited || {};
    }
  }

  // ---- Shop: a special NPC that sells things for gold ----
  openShop(npc) {
    this.state = STATE.SHOP;
    this.shopNpc = npc;
    this.shopIndex = 0;
    // Items for sale. Each: label, price, and what buying does to the player.
    this.shopItems = [
      { label: "Heal potion (+10 HP)", price: 5, buy: (p) => p.heal(10) },
      { label: "Max HP boost (+5)", price: 15, buy: (p) => { p.maxHp += 5; p.hp += 5; } },
      { label: "Sharpen sword (+2 dmg)", price: 20, buy: (p) => { p.attackDamage += 2; } },
    ];
  }
  buyShopItem(i) {
    const item = this.shopItems[i];
    if (!item) return;
    if (this.player.spendGold(item.price)) {
      item.buy(this.player);
      Sound.play("quest");
      Floaters.spawn(this.player.x + this.player.width / 2, this.player.y - 30, "Bought!", "#9ad9b0");
    } else {
      Sound.play("blip");   // can't afford
      Floaters.spawn(this.player.x + this.player.width / 2, this.player.y - 30, "Need gold", "#ff8a8a");
    }
  }

  // Make It Super: gamepad support (sec. 26) - read the first controller.
  readGamepad(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && pads[0];
    if (!pad) return;
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    const speed = this.player.dashTimer > 0 ? CONFIG.PLAYER_SPEED * 3 : CONFIG.PLAYER_SPEED;
    if (Math.abs(ax) > 0.2) { this.player.x += ax * speed * dt; this.player.dir = ax < 0 ? 2 : 1; this.player.moving = true; }
    if (Math.abs(ay) > 0.2) { this.player.y += ay * speed * dt; this.player.dir = ay < 0 ? 0 : 3; this.player.moving = true; }
    if (pad.buttons[0] && pad.buttons[0].pressed && !this.player.attacking) this.player.startAttack();
  }

  // Make It Super: minimap (sec. 24) - scale world coords into a small corner box.
  // ---- Door markers: a soft pulsing glow so the player notices a doorway ----
  // The celebratory YOU WIN screen: a warm gradient, big glowing title, and a sky
  // full of bursting fireworks (bright coloured sparks). Animated each frame.
  drawWinScreen(ctx) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const now = performance.now() / 1000;
    const dt = this._fwLastT ? Math.min(0.05, now - this._fwLastT) : 0.016;
    this._fwLastT = now;
    this.winTime += dt;

    // keep launching fireworks on a gentle cadence
    if (Math.random() < dt * 2.4) this.launchFirework();
    if (this.fireworks.length === 0 && this.winTime < 0.3) {
      // an opening volley so the screen bursts to life immediately
      for (let i = 0; i < 3; i++) this.launchFirework();
    }
    this.updateFireworks(dt);

    // 1) deep celebratory backdrop (twilight gradient)
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "rgba(24, 16, 56, 0.92)");
    bg.addColorStop(1, "rgba(40, 22, 70, 0.92)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 2) the fireworks (additive glow)
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const f of this.fireworks) {
      if (f.kind === "rocket") {
        ctx.fillStyle = `hsla(${f.hue}, 100%, 80%, 0.95)`;
        ctx.beginPath(); ctx.arc(f.x, f.y, 2.2, 0, Math.PI * 2); ctx.fill();
        // a faint trail
        ctx.strokeStyle = `hsla(${f.hue}, 100%, 70%, 0.4)`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x, f.y + 12); ctx.stroke();
      } else {
        const a = Math.max(0, f.life);
        // glowing spark with a soft halo
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.size * 3);
        g.addColorStop(0, `hsla(${f.hue}, 100%, 85%, ${a})`);
        g.addColorStop(1, `hsla(${f.hue}, 100%, 60%, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.size * 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `hsla(${f.hue}, 100%, 92%, ${a})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();

    // 3) the title - big, glowing, with a gentle pop-in and shimmer
    const pop = Math.min(1, this.winTime / 0.5);
    const scale = 0.6 + 0.4 * (1 - Math.pow(1 - pop, 3));   // ease-out pop
    const shimmer = 0.5 + 0.5 * Math.sin(now * 3);
    ctx.save();
    ctx.translate(W / 2, H / 2 - 30);
    ctx.scale(scale, scale);
    ctx.textAlign = "center";
    ctx.shadowColor = `hsla(${(now * 60) % 360}, 100%, 65%, 0.9)`;
    ctx.shadowBlur = 24 + 12 * shimmer;
    ctx.fillStyle = "#fff7d6";
    ctx.font = "bold 60px monospace";
    ctx.fillText("YOU WIN!", 0, 0);
    ctx.restore();

    // 4) subtitle + prompt (fade in after the title)
    const subA = Math.min(1, Math.max(0, (this.winTime - 0.5) / 0.6));
    ctx.globalAlpha = subA;
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffe08a";
    ctx.font = "bold 20px monospace";
    ctx.fillText("Every quest complete - you are the Warren Hero!", W / 2, H / 2 + 36);
    ctx.fillStyle = "#cfe8ff";
    ctx.font = "16px monospace";
    ctx.fillText("Press ENTER for the title screen", W / 2, H / 2 + 70);
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
  }

  drawDoors(ctx) {
    if (!this.doors || this.doors.length === 0) return;
    const T = CONFIG.SCALED_TILE;
    const now = performance.now();
    const pulse = 0.5 + 0.5 * Math.sin(now / 350);  // 0..1 shimmer
    for (const d of this.doors) {
      const x = d.col * T - this.camera.x;
      const y = d.row * T - this.camera.y;
      const w = (d.w || 1) * T, h = (d.h || 1) * T;
      if (d.portal) { this.drawPortal(ctx, x + w / 2, y + h / 2, now); continue; }
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.25 * pulse;       // soft golden glow
      ctx.fillStyle = "#ffe08a";
      ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = "#ffd24a";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
      ctx.fillStyle = "#7a5a18";                   // a little "enter" chevron
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "center";
      ctx.fillText("\u25BC", x + w / 2, y + h / 2 + 4);
      ctx.textAlign = "left";
      ctx.restore();
    }
  }

  // ---- A magical circular portal: glowing rings, a swirling core, and sparks ----
  drawPortal(ctx, cx, cy, now) {
    const t = now / 1000;
    const baseR = CONFIG.SCALED_TILE * 0.62;
    const breathe = 1 + 0.06 * Math.sin(t * 2.2);   // gentle size pulse
    const R = baseR * breathe;
    ctx.save();
    ctx.translate(cx, cy);

    // outer glow halo
    const halo = ctx.createRadialGradient(0, 0, R * 0.3, 0, 0, R * 1.8);
    halo.addColorStop(0, "rgba(150, 90, 255, 0.55)");
    halo.addColorStop(0.5, "rgba(120, 110, 255, 0.28)");
    halo.addColorStop(1, "rgba(120, 110, 255, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(0, 0, R * 1.8, 0, Math.PI * 2); ctx.fill();

    // swirling core (gradient disc)
    const core = ctx.createRadialGradient(0, 0, 2, 0, 0, R);
    core.addColorStop(0, "#f3e9ff");
    core.addColorStop(0.35, "#b98cff");
    core.addColorStop(0.75, "#6a4ad6");
    core.addColorStop(1, "#2a1a5e");
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();

    // spiral swirl lines rotating inside the core
    ctx.globalCompositeOperation = "lighter";
    for (let s = 0; s < 3; s++) {
      ctx.save();
      ctx.rotate(t * 1.6 + s * (Math.PI * 2 / 3));
      ctx.strokeStyle = "rgba(220, 200, 255, 0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 1.6; a += 0.2) {
        const rr = (a / (Math.PI * 1.6)) * R * 0.9;
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalCompositeOperation = "source-over";

    // bright rotating ring of light at the rim
    ctx.lineWidth = 3;
    const rim = ctx.createLinearGradient(-R, -R, R, R);
    rim.addColorStop(0, "#ffe6ff");
    rim.addColorStop(0.5, "#a07bff");
    rim.addColorStop(1, "#ffe6ff");
    ctx.strokeStyle = rim;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();

    // orbiting sparkles around the edge
    for (let i = 0; i < 8; i++) {
      const a = t * 2 + i * (Math.PI * 2 / 8);
      const rr = R * (1.05 + 0.08 * Math.sin(t * 3 + i));
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      const tw = 0.6 + 0.4 * Math.sin(t * 6 + i * 1.7);
      ctx.fillStyle = `rgba(255, 240, 255, ${tw})`;
      ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  drawMinimap(ctx) {
    if (!this.map) return;
    const mmW = 118, mmH = 88, mmX = ctx.canvas.width - mmW - 12, mmY = 12;
    const sx = mmW / this.map.pixelWidth, sy = mmH / this.map.pixelHeight;
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(mmX, mmY, mmW, mmH);
    ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.strokeRect(mmX, mmY, mmW, mmH);
    ctx.fillStyle = "#f07167";
    for (const e of this.enemies) ctx.fillRect(mmX + e.x * sx, mmY + e.y * sy, 3, 3);
    ctx.fillStyle = "#9ad9b0";
    ctx.fillRect(mmX + this.player.x * sx, mmY + this.player.y * sy, 4, 4);
  }

  // Make It Super: score + high score (sec. 21) - shown under the minimap.
  drawScoreHud(ctx) {
    ctx.font = "bold 13px monospace";
    ctx.fillStyle = "#ffd98a";
    ctx.textAlign = "right";
    const rx = ctx.canvas.width - 14;
    ctx.fillText("Score " + Score.value, rx, 118);
    ctx.fillStyle = "#cadcfc";
    ctx.fillText("Best " + Score.high(), rx, 134);
    ctx.fillStyle = "#ffd24a";
    ctx.fillText("Gold " + (this.player ? this.player.gold || 0 : 0), rx, 150);
    if (this.wave > 0) ctx.fillText("Wave " + this.wave, rx, 166);
    if (Sound.muted) { ctx.fillStyle = "#ff8a8a"; ctx.fillText("MUTED (M)", rx, 182); }
    ctx.textAlign = "left";
  }

  // ---- Pause menu overlay ----
  drawPauseMenu(ctx) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.fillStyle = "rgba(20,18,30,0.72)";
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffd98a";
    ctx.font = "bold 34px monospace";
    ctx.fillText("Paused", w / 2, h / 2 - 70);
    ctx.font = "16px monospace";
    ctx.fillStyle = "#fff";
    const lines = [
      "ESC / P  -  Resume",
      "S  -  Save game",
      this.hasSave() ? "L  -  Load game" : "L  -  (no save yet)",
      "M  -  " + (Sound.muted ? "Unmute sound" : "Mute sound"),
    ];
    lines.forEach((t, i) => ctx.fillText(t, w / 2, h / 2 - 10 + i * 30));
    ctx.textAlign = "left";
  }

  // ---- Shop menu overlay ----
  drawShop(ctx) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.fillStyle = "rgba(20,18,30,0.72)";
    ctx.fillRect(0, 0, w, h);
    const bx = w / 2 - 200, by = h / 2 - 130, bw = 400, bh = 260;
    ctx.fillStyle = "#2b2740";
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = "#ffd98a"; ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffd98a"; ctx.font = "bold 22px monospace";
    ctx.fillText("Shop", w / 2, by + 34);
    ctx.fillStyle = "#ffd24a"; ctx.font = "14px monospace";
    ctx.fillText("Your gold: " + (this.player.gold || 0), w / 2, by + 58);
    ctx.textAlign = "left";
    this.shopItems.forEach((item, i) => {
      const y = by + 92 + i * 40;
      const selected = i === this.shopIndex;
      if (selected) { ctx.fillStyle = "rgba(255,217,138,0.18)"; ctx.fillRect(bx + 14, y - 20, bw - 28, 34); }
      ctx.fillStyle = selected ? "#ffd98a" : "#fff";
      ctx.font = (selected ? "bold " : "") + "15px monospace";
      ctx.fillText((selected ? "> " : "  ") + item.label, bx + 24, y);
      ctx.textAlign = "right";
      ctx.fillStyle = (this.player.gold || 0) >= item.price ? "#9ad9b0" : "#ff8a8a";
      ctx.fillText(item.price + "g", bx + bw - 24, y);
      ctx.textAlign = "left";
    });
    ctx.textAlign = "center";
    ctx.fillStyle = "#cadcfc"; ctx.font = "12px monospace";
    ctx.fillText("Up/Down choose - Space buy - ESC leave", w / 2, by + bh - 16);
    ctx.textAlign = "left";
  }

  async boot() {
    await loadAllAssets();                 // wait for images + sound
    this.currentMap = "map_meadow";        // which map file we're on
    this.mapData = await this.fetchMap(this.currentMap);
    this.state = STATE.TITLE;
    // Start the loop. We bind so 'this' still means the Game inside it.
    requestAnimationFrame(this.loop.bind(this));
  }

  // Load a map JSON file by name (e.g. "map_meadow" -> assets/map_meadow.json).
  async fetchMap(name) {
    const res = await fetch("assets/" + name + ".json");
    return await res.json();
  }

  // ---- Doors: travel from one map to another ----
  // A door is a zone on the map: { col, row, w, h, toMap, toCol, toRow }.
  // Step on it and we load the target map, dropping the player at (toCol,toRow).
  // The player keeps their stats, inventory, and quest progress across the trip.
  async useDoor(door) {
    if (this.transitioning) return;        // don't double-fire mid-transition
    this.transitioning = true;
    // A portal triggers a dramatic WORMHOLE warp: the bunny spins into a swirling
    // purple tunnel, then re-emerges in the next level.
    if (door.portal) {
      this.portalWarp = 1;                  // 1 -> 0 drives the whole wormhole animation
      this.portalWarpDir = 1;               // 1 = diving in, -1 = emerging out
      this.warpTime = 0;                    // seconds spent travelling the wormhole
      Particles.burst(this.player.x + 24, this.player.y + 24, "#b98cff", 28);
      Sound.play("quest");
      // let the longer "dive in / fly through" half of the warp play before swapping
      // the long "dive in / fly through" half: ~5 seconds of winding wormhole travel
      await new Promise(res => setTimeout(res, 5000));
    }
    // remember everything that should survive the journey
    const saved = {
      hp: this.player.hp, maxHp: this.player.maxHp, level: this.player.level,
      xp: this.player.xp, xpToNext: this.player.xpToNext,
      attackDamage: this.player.attackDamage, gold: this.player.gold,
      inventory: this.inventory.items,
      questLog: this.questLog,
    };
    // Entering a NEW LEVEL: keep the player's stats and inventory, but start the
    // new level's own quests fresh (don't carry the finished ones across).
    if (door.newLevel) saved.questLog = null;
    this.currentMap = door.toMap;
    this.mapData = await this.fetchMap(door.toMap);
    // spawn position on the new map comes from the door
    this.mapData = { ...this.mapData,
      playerStart: { x: door.toCol * CONFIG.SCALED_TILE, y: door.toRow * CONFIG.SCALED_TILE } };
    this.loadWorld(saved);                 // rebuild the world, restoring saved state
    Sound.play("select");
    // second half of the wormhole: the bunny spins back OUT into the new level
    if (door.portal) { this.portalWarp = 1; this.portalWarpDir = -1; }
    this.transitioning = false;
  }

  // Detect the player standing on a door zone, then travel.
  // Check level completion each frame. Runs BEFORE checkDoors so that finishing the
  // final level's quests triggers the win immediately, instead of the player being
  // teleported away by a portal they happened to be standing on at the same moment.
  checkProgress() {
    if (this.transitioning || this.state !== STATE.PLAYING) return;
    const all = Object.values(this.questLog.quests);
    const allDone = all.length > 0 && all.every(q => q.completed);
    if (allDone) {
      if (this.currentMap === "map_meadow") {
        this.ensureLevel2Portal();          // Level 1 done -> open the portal to L2
      } else {
        // Finished the final level: that's the win.
        Sound.stopMusic();
        Sound.play("quest");
        this.startWin();
        return;
      }
    }
    // Keep the L2 portal present in the Warren once it's ever been earned, so
    // returning from Level 2 never strands the player.
    if (this.currentMap === "map_meadow" && this.level2Unlocked) {
      this.ensureLevel2Portal(true);
    }
  }

  // Kick off the celebratory win screen.
  startWin() {
    this.state = STATE.WIN;
    this.winTime = 0;
    this.endScreenTime = 0;
    this.fireworks = [];
    this._fwLastT = performance.now() / 1000;
  }

  // Spawn a single firework rocket that will burst into coloured sparks.
  launchFirework() {
    const W = this.ctx.canvas.width, H = this.ctx.canvas.height;
    const hue = Math.floor(Math.random() * 360);
    this.fireworks.push({
      kind: "rocket",
      x: 60 + Math.random() * (W - 120),
      y: H + 10,
      vy: -(260 + Math.random() * 120),       // upward speed
      targetY: 80 + Math.random() * (H * 0.45),
      hue,
    });
  }

  // Advance + recycle the fireworks. Rockets rise, then explode into ~40 sparks
  // that fan out, fall under gravity, and fade.
  updateFireworks(dt) {
    const next = [];
    for (const f of this.fireworks) {
      if (f.kind === "rocket") {
        f.y += f.vy * dt;
        if (f.y <= f.targetY) {
          // burst!
          const n = 36 + Math.floor(Math.random() * 16);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
            const sp = 90 + Math.random() * 150;
            next.push({
              kind: "spark", x: f.x, y: f.y,
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, hue: (f.hue + Math.random() * 40) % 360,
              size: 1.5 + Math.random() * 1.8,
            });
          }
          Sound.play("pickup");
        } else {
          next.push(f);
        }
      } else {
        f.x += f.vx * dt; f.y += f.vy * dt;
        f.vy += 220 * dt;                       // gravity
        f.vx *= 0.99;                           // air drag
        f.life -= dt * 0.7;
        if (f.life > 0) next.push(f);
      }
    }
    this.fireworks = next;
  }

  checkDoors() {
    if (!this.doors || this.transitioning || this.state !== STATE.PLAYING) return;
    const p = this.player;
    // If the player has finished every quest on a level past the first, the win takes
    // priority - don't let a "return" portal (one that goes back to map_meadow without
    // starting a new level) teleport them away before checkProgress fires the win.
    const all = Object.values(this.questLog.quests);
    const levelDone = all.length > 0 && all.every(q => q.completed)
      && this.currentMap !== "map_meadow";
    for (const d of this.doors) {
      const isReturnPortal = d.toMap === "map_meadow" && !d.newLevel;
      if (levelDone && isReturnPortal) continue;   // let the win happen instead
      const dx = d.col * CONFIG.SCALED_TILE, dy = d.row * CONFIG.SCALED_TILE;
      const dw = (d.w || 1) * CONFIG.SCALED_TILE, dh = (d.h || 1) * CONFIG.SCALED_TILE;
      if (p.x < dx + dw && p.x + p.width > dx && p.y < dy + dh && p.y + p.height > dy) {
        this.useDoor(d);
        return;
      }
    }
  }

  // Build a fresh game world from the map data. If `carry` is given (from a door),
  // restore the player's stats / inventory / quests instead of starting fresh.
  loadWorld(carry) {
    this.map = new TileMap(this.mapData);
    AStar.init(this.map);                  // pathfinding needs to know the wall grid
    this.astar = AStar;                    // expose for the debug path overlay
    Weather.init(this.ctx.canvas.width, this.ctx.canvas.height); // Make It Super (sec. 25)
    this.camera = new Camera();
    this.player = new Player(this.mapData.playerStart.x, this.mapData.playerStart.y, KEYMAP_P1);
    // ---- Make It Super: local co-op (sec. 18) ----
    // Player 2 starts as null. Press "2" to drop them in beside Player 1; they share
    // one screen and one camera. `players` is the list we update & draw each frame.
    this.player2 = null;
    this.players = [this.player];
    this.inventory = new Inventory();
    this.dialogue = new Dialogue();
    this.questLog = new QuestLog();
    this.questLog.define(this.mapData.quests || []);

    // If we walked through a door, copy the saved progress back onto the new world.
    if (carry) {
      Object.assign(this.player, {
        hp: carry.hp, maxHp: carry.maxHp, level: carry.level, xp: carry.xp,
        xpToNext: carry.xpToNext, attackDamage: carry.attackDamage, gold: carry.gold,
      });
      this.player.displayedHp = carry.hp;
      this.inventory.items = carry.inventory;
      // keep quest progress: reuse the old QuestLog but re-point it at this map's quests
      if (carry.questLog) {
        this.questLog.quests = carry.questLog.quests;
        this.questLog.defeats = carry.questLog.defeats;
        this.questLog.talked = carry.questLog.talked;
        this.questLog.visited = carry.questLog.visited;
        this.questLog.define(this.mapData.quests || []);  // add any new quests this map introduces
      }
    }

    // Turn entity data into real objects.
    this.npcs = [];
    this.enemies = [];
    this.items = [];
    for (const e of this.mapData.entities) {
      if (e.kind === "npc") this.npcs.push(new NPC(e));
      else if (e.kind === "enemy") this.enemies.push(new Enemy(e));
      else if (e.kind === "item") this.items.push(new Item(e));
    }
    // Trigger zones (for quest "reach" objectives) come from a separate map array.
    this.triggers = (this.mapData.triggers || []).map(z => ({ ...z, fired: false }));
    // Doors (for traveling between maps).
    this.doors = this.mapData.doors || [];
    Sound.playMusic(this.mapData.music || "town_theme");
  }

  // ---------- THE GAME LOOP ----------
  loop(timestamp) {
    // Compute delta time in seconds. Cap it so a lag spike (or the
    // player switching browser tabs) can't teleport everything.
    let dt = (timestamp - this.lastTime) / 1000;
    this.lastTime = timestamp;
    if (dt > 0.05) dt = 0.05;

    Debug.tick(dt);    // keep the FPS / dt meter current
    this.update(dt);
    this.draw();

    Input.clearFrame(); // forget "just pressed" keys for next frame
    requestAnimationFrame(this.loop.bind(this));
  }

  // ---------- UPDATE (game logic) ----------
  update(dt) {
    // Time spent on an end screen (WIN or GAMEOVER) so we can ignore the dismiss
    // key for a moment - the Space that landed the killing blow / final hit
    // shouldn't instantly skip the screen (Space is also the attack key).
    if (this.state === STATE.WIN || this.state === STATE.GAMEOVER) {
      this.endScreenTime = (this.endScreenTime || 0) + dt;
    }
    switch (this.state) {
      case STATE.TITLE:
        if (Input.wasPressed("Space") || Input.wasPressed("Enter")) {
          this.loadWorld();
          this.state = STATE.PLAYING;
        } else if (Input.wasPressed("KeyL") && this.hasSave()) {
          // Continue from a saved game.
          this.loadWorld();
          this.loadGame();
          this.state = STATE.PLAYING;
        }
        break;

      case STATE.PLAYING:
        this.updatePlaying(dt);
        break;

      case STATE.DIALOGUE:
        this.dialogue.update(dt);
        if (!this.dialogue.active) this.state = STATE.PLAYING;
        break;

      case STATE.INVENTORY:
        if (Input.wasPressed("KeyI") || Input.wasPressed("Escape")) {
          Sound.play("select");
          this.state = STATE.PLAYING;
        }
        break;

      case STATE.PAUSED:
        // The world is frozen. Resume, save, load, or toggle mute.
        if (Input.wasPressed("Escape") || Input.wasPressed("KeyP")) {
          Sound.play("select");
          this.state = STATE.PLAYING;
        } else if (Input.wasPressed("KeyS")) {
          this.saveGame();
        } else if (Input.wasPressed("KeyL") && this.hasSave()) {
          this.loadGame();
        } else if (Input.wasPressed("KeyM")) {
          Sound.toggleMute();
        }
        break;

      case STATE.SHOP: {
        // Up/down to pick, Space/Enter to buy, Escape to leave.
        const n = this.shopItems.length;
        if (Input.wasPressed("ArrowUp")) { this.shopIndex = (this.shopIndex - 1 + n) % n; Sound.play("blip"); }
        if (Input.wasPressed("ArrowDown")) { this.shopIndex = (this.shopIndex + 1) % n; Sound.play("blip"); }
        if (Input.wasPressed("Space") || Input.wasPressed("Enter")) this.buyShopItem(this.shopIndex);
        if (Input.wasPressed("Escape") || Input.wasPressed("KeyT")) { Sound.play("select"); this.state = STATE.PLAYING; }
        break;
      }

      case STATE.GAMEOVER:
      case STATE.WIN:
        // Require a 3-second grace period before the screen can be dismissed, so the
        // player has time to enjoy it and the Space press that landed the final blow
        // (Space is the attack key) can't instantly skip the screen to the title.
        if ((this.endScreenTime || 0) > 3.0 &&
            (Input.wasPressed("Space") || Input.wasPressed("Enter"))) {
          this.state = STATE.TITLE;
        }
        break;
    }
  }

  updatePlaying(dt) {
    // ----- Make It Super: update standalone effect systems -----
    Combo.update(dt);
    Weather.update(dt, this.ctx.canvas.width, this.ctx.canvas.height);
    // Toggle key: R = rain on/off
    if (Input.wasPressed("KeyR")) Weather.enabled = !Weather.enabled;

    // ----- Debug overlays: visualize what's happening (Appendix F) -----
    if (Input.wasPressed("Digit1")) Debug.toggle("hitboxes");
    if (Input.wasPressed("Digit3")) Debug.toggle("ai");
    if (Input.wasPressed("Digit4")) Debug.toggle("paths");
    if (Input.wasPressed("Digit5")) Debug.toggle("grid");
    if (Input.wasPressed("Digit6")) Debug.toggle("perf");
    if (Input.wasPressed("Digit0")) Debug.toggle("all-off");
    if (Input.wasPressed("Backquote")) Debug.legend = !Debug.legend;
    // Make It Super: screen-wipe transition demo (sec. 23) - press K to play it.
    if (Input.wasPressed("KeyK") && this.wipe <= 0) { this.wipe = 0; this.wipeDir = 1; }
    if (this.wipeDir !== 0) {
      this.wipe += this.wipeDir * dt * 2;
      if (this.wipe >= 1) { this.wipe = 1; this.wipeDir = -1; }       // fully closed -> open
      else if (this.wipe <= 0 && this.wipeDir === -1) { this.wipe = 0; this.wipeDir = 0; }
    }

    // ----- Make It Super: gamepad support (sec. 26) -----
    this.readGamepad(dt);

    // ----- Pause the game -----
    if (Input.wasPressed("Escape") || Input.wasPressed("KeyP")) {
      Sound.play("select");
      this.state = STATE.PAUSED;
      return;
    }
    // ----- Mute / unmute audio -----
    if (Input.wasPressed("KeyM")) Sound.toggleMute();

    // ----- Open inventory -----
    if (Input.wasPressed("KeyI")) {
      Sound.play("select");
      this.state = STATE.INVENTORY;
      return;
    }
    // ----- Toggle the quest HUD on/off -----
    if (Input.wasPressed("KeyQ")) {
      Sound.play("blip");
      this.questLog.toggleHud();
    }

    // ----- Talk to a nearby NPC -----
    // Talk and attack are now separate keys: T talks, Space attacks. We still
    // figure out who is nearby first so we can show the "Press T" prompt.
    this.nearbyNpc = this.npcs.find(n => n.isNear(this.player));
    if (this.nearbyNpc && !this.player.attacking && Input.wasPressed("KeyT")) {
      this.startConversation(this.nearbyNpc);
      return; // skip the rest of this frame's logic, we are talking now
    }

    // ----- Make It Super: local co-op join (sec. 18) -----
    // Press "2" to add or remove Player 2 (WASD to move, F to attack).
    if (Input.wasPressed("Digit2")) this.toggleCoop();

    // ----- Player(s) -----
    this.player.update(dt, this.map);
    if (this.player2) this.player2.update(dt, this.map);
    this.checkTriggerZones();   // fire any "reach" quest objectives
    this.checkProgress();       // win / open the portal BEFORE doors can teleport us
    this.checkDoors();          // travel to another map if standing on a door
    if (this.player.isDead) {
      Sound.stopMusic();
      Sound.play("gameover");
      this.state = STATE.GAMEOVER;
      this.endScreenTime = 0;
      return;
    }

    // ----- Sword vs enemies (each player's swing can hit) -----
    Battle.resolvePlayerAttack(this.player, this.enemies, this.questLog, this.camera, this);
    if (this.player2) Battle.resolvePlayerAttack(this.player2, this.enemies, this.questLog, this.camera, this);

    // ----- Enemies (chase the NEAREST player) -----
    for (const enemy of this.enemies) enemy.update(dt, this.nearestPlayer(enemy), this.map);
    // Remove enemies whose death animation finished.
    this.enemies = this.enemies.filter(e => !e.dead);

    // ----- Make It Super: enemy waves (sec. 22) -----
    // When all enemies are cleared, spawn a bigger wave after a short pause.
    // Indoor maps (shops, houses) set noWaves so they stay peaceful.
    if (this.enemies.length === 0 && !this.mapData.noWaves) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        this.wave += 1;
        const count = 2 + this.wave;          // each wave is bigger
        for (let i = 0; i < count; i++) this.spawnEnemyAtRandomEdge();
        this.waveTimer = 3;                    // 3s before the next check
        Floaters.spawn(this.player.x + this.player.width / 2, this.player.y - 40,
          "Wave " + this.wave + "!", "#ffd98a");
      }
    }

    // ----- NPCs -----
    for (const npc of this.npcs) npc.update(dt);

    // ----- Items: pick up on overlap -----
    for (const item of this.items) {
      item.update(dt, this.player);
      if (!item.collected && item.overlaps(this.player)) {
        item.collected = true;
        this.inventory.add(item.id, item.name);
        this.questLog.onCollect(item.id);
        // Make It Super: gold sparkle + floating label on pickup
        Particles.burst(item.x + item.width / 2, item.y + item.height / 2, "#ffd98a", 14);
        Floaters.spawn(item.x + item.width / 2, item.y, "+" + item.name, "#ffd98a");
        Score.add(5);   // Make It Super: score on pickup (sec. 21)
        // Different pickups do different things:
        //  - a healing item (berry) restores HP right away
        //  - a carrot grants a timed SPEED boost (HUD shows a countdown bar)
        if (item.heal) {
          this.player.heal(item.heal);
        } else if (item.id === "carrot") {
          this.player.addBoost("speed", CONFIG.SPEED_BOOST_DURATION, "Speed", "#7fd1ff");
        }
      }
    }
    this.items = this.items.filter(i => !i.collected);

    // ----- Did the player complete this level's quests? -----
    // (handled by checkProgress(), called above before doors so finishing the
    //  final level wins immediately instead of being pre-empted by a portal)

    // ----- Camera follows player -----
    // ----- Make It Super: update effects, pass dt to the camera for shake -----
    Particles.update(dt);
    Floaters.update(dt);
    // portal entry flash fades out quickly
    if (this.portalFlash > 0) this.portalFlash = Math.max(0, this.portalFlash - dt * 1.4);
    // Wormhole warp. Dive-in (dir 1) ramps the tunnel up and holds near full while
    // the bunny flies the winding path; emerging (dir -1) spins back out.
    if (this.portalWarpDir === 1) {
      this.warpTime = (this.warpTime || 0) + dt;
      // ramp the tunnel up in ~0.6s, then hold at full envelope for the long flight
      this.portalWarp = Math.max(0.05, this.portalWarp - dt * 1.6);
    } else if (this.portalWarpDir === -1) {
      this.warpTime = (this.warpTime || 0) + dt;
      this.portalWarp = Math.max(0, this.portalWarp - dt * 1.4);
      if (this.portalWarp <= 0) this.portalWarpDir = 0;   // done
    }
    // In co-op, follow the midpoint between the two bunnies so both stay on screen.
    this.camera.follow(this.player2 ? this.coopMidpoint() : this.player, this.map, dt);
  }

  // ---- Make It Super: local co-op helpers (sec. 18) ----
  // Add Player 2 next to Player 1, or remove them if they're already in.
  toggleCoop() {
    if (this.player2) {
      this.player2 = null;
    } else {
      // Spawn P2 next to P1, but pick a spot that ISN'T inside a wall. Try a few
      // offsets around P1 and use the first clear one (fall back to P1's own spot).
      const w = this.player.width, h = this.player.height;
      const clear = (x, y) =>
        !this.map.isSolidAtPixel(x, y) &&
        !this.map.isSolidAtPixel(x + w - 1, y) &&
        !this.map.isSolidAtPixel(x, y + h - 1) &&
        !this.map.isSolidAtPixel(x + w - 1, y + h - 1);
      const offsets = [[60, 0], [-60, 0], [0, 60], [0, -60], [60, 60], [-60, -60], [0, 0]];
      let sx = this.player.x, sy = this.player.y;
      for (const [ox, oy] of offsets) {
        const tx = this.player.x + ox, ty = this.player.y + oy;
        if (clear(tx, ty)) { sx = tx; sy = ty; break; }
      }
      this.player2 = new Player(sx, sy, KEYMAP_P2);
    }
    this.players = this.player2 ? [this.player, this.player2] : [this.player];
  }

  // Which player is closest to a given enemy (so enemies chase the nearer bunny).
  nearestPlayer(enemy) {
    if (!this.player2) return this.player;
    const d1 = Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y);
    const d2 = Math.hypot(enemy.x - this.player2.x, enemy.y - this.player2.y);
    return d1 <= d2 ? this.player : this.player2;
  }

  // A fake "player" at the midpoint, just so the camera can frame both bunnies.
  coopMidpoint() {
    return {
      x: (this.player.x + this.player2.x) / 2,
      y: (this.player.y + this.player2.y) / 2,
      width: this.player.width, height: this.player.height,
    };
  }

  startConversation(npc) {
    // A shop NPC opens the buy menu instead of regular dialogue.
    if (npc.shop) {
      this.questLog.onTalk(npc.name);   // still counts as "talked to" for quests
      this.openShop(npc);
      return;
    }
    this.state = STATE.DIALOGUE;
    this.questLog.onTalk(npc.name);

    // Pick which dialogue to show based on the quest this NPC cares about.
    // - not started yet  -> the intro dialogue (which offers the quest)
    // - started, not done -> the "in progress" lines
    // - all objectives met -> the "complete" lines (and hand in the quest once)
    const quest = npc.givesQuest ? this.questLog.quests[npc.givesQuest] : null;
    let pages = npc.dialogue;
    let offersQuest = true;          // only the intro dialogue offers the quest
    let handInNow = false;           // are we completing the quest this talk?

    if (quest && quest.started) {
      offersQuest = false;           // already accepted; don't re-offer
      const objectivesDone = quest.objectives.every(o => o.current >= o.needed);
      if (objectivesDone && npc.dialogueComplete && !quest.turnedIn) {
        pages = npc.dialogueComplete; // objectives met -> thank-you lines
        handInNow = true;
      } else if (objectivesDone && quest.turnedIn) {
        // Already thanked the player before - keep it short and friendly.
        pages = npc.dialogueComplete || npc.dialogueInProgress || npc.dialogue;
      } else {
        pages = npc.dialogueInProgress || npc.dialogue; // still working on it
      }
    }

    this.dialogue.start(
      npc.name,
      pages,
      // onFinish:
      () => {
        if (offersQuest && npc.givesQuest && !npc._declined) {
          this.questLog.start(npc.givesQuest, this.inventory);
        }
        if (handInNow && quest) {
          quest.turnedIn = true;     // remember we've handed it in
          quest.checkComplete();     // play the completion fanfare once
        }
        npc._declined = false;
      },
      // onChoice: choice 1 ("Maybe later") declines the quest.
      (choiceIndex) => { if (choiceIndex === 1) npc._declined = true; }
    );
  }

  // ---------- DRAW (paint the screen) ----------
  draw() {
    const ctx = this.ctx;
    ctx.fillStyle = "#bfe0f2";
    ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

    if (this.state === STATE.LOADING) {
      UI.drawScreen(ctx, "Loading...", "Gathering carrots and courage");
      return;
    }
    if (this.state === STATE.TITLE) {
      const sub = this.hasSave() ? "SPACE - new game    L - continue" : "Press SPACE to begin";
      UI.drawScreen(ctx, "Rabbit Run: Tales of the Warren", sub, "#ffd98a");
      return;
    }

    // ----- Draw the world -----
    // Order: ground (grass/dirt/water) first, then flat "overlay" details
    // (grass tufts, flowers, pebbles) that the player walks OVER, then the
    // moving things sorted by Y, then tall "decor" (tree tops, roofs) on top.
    this.map.drawLayer(ctx, "ground", this.camera);
    this.map.drawLayer(ctx, "overlay", this.camera);
    this.drawDoors(ctx);          // glowing markers so doors are easy to spot

    // Collect all "things" and sort by Y so lower ones draw in front
    // (this gives a nice sense of depth - classic top-down trick).
    const things = [...this.items, ...this.npcs, ...this.enemies, ...this.players];
    things.sort((a, b) => (a.y + a.height) - (b.y + b.height));
    for (const t of things) t.draw(ctx, this.camera);

    // ----- Make It Super: draw particles & floating numbers on top of the world -----
    Particles.draw(ctx, this.camera);
    Floaters.draw(ctx, this.camera);

    this.map.drawLayer(ctx, "decor", this.camera);

    // ----- Make It Super: world-tint effects (over the world, under the HUD) -----
    Weather.draw(ctx);                          // rain (sec. 25), toggle R
    Combo.draw(ctx, this.player, this.camera);  // combo counter (sec. 18)

    // ----- Draw the UI on top -----
    UI.drawHealth(ctx, this.player);
    UI.drawBoosts(ctx, this.player);             // timed power-up countdown bars (sec. 19)
    const minimapShowing = !!this.map;          // the minimap draws whenever a map is loaded
    UI.drawQuests(ctx, this.questLog, minimapShowing);
    this.drawMinimap(ctx);                       // minimap (sec. 24)
    this.drawScoreHud(ctx);                      // score + high score (sec. 21)

    // ----- Make It Super: screen-wipe transition (sec. 23) -----
    if (this.wipe > 0) {
      const r = (1 - this.wipe) * ctx.canvas.width;   // shrinking circle hole
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.arc(ctx.canvas.width / 2, ctx.canvas.height / 2, Math.max(0, r), 0, Math.PI * 2, true);
      ctx.fill("evenodd");
    }

    // ----- Portal WORMHOLE warp: a cinematic vortex tunnel -----
    // Inspired by sci-fi "flying through a wormhole" shots: a swirling tunnel whose
    // walls are made of spiralling light streaks, with bright particles/stars
    // rushing past the camera toward the viewer, all twisting around a glowing core.
    if (this.portalWarp > 0 || this.portalWarpDir !== 0) {
      const W = ctx.canvas.width, H = ctx.canvas.height;
      const cx = W / 2, cy = H / 2;
      const t = performance.now() / 1000;
      // local frame delta for advancing the warp particles (draw() has no dt)
      const dt = this._warpLastT ? Math.min(0.05, t - this._warpLastT) : 0.016;
      this._warpLastT = t;
      const dir = this.portalWarpDir === 1 ? 1 : -1;       // 1 dive, -1 emerge
      // env: 0 = no warp, 1 = fully inside the tunnel.
      const env = Math.min(1, Math.max(0,
        dir === 1 ? (1 - this.portalWarp) * 1.25 : this.portalWarp));
      const maxR = Math.hypot(cx, cy);

      // ---- The tunnel SWERVES as we fly through it: the vanishing point weaves
      //      around the screen on a layered Lissajous path with several frequencies,
      //      so it reads as a wild, winding wormhole that keeps changing direction. ----
      const wt = this.warpTime || 0;
      const swMag = maxR * 0.28 * env;       // bigger, more dramatic swerve
      const path = (tt) =>
        [ Math.sin(tt * 1.7) * swMag + Math.sin(tt * 0.9 + 1.3) * swMag * 0.6
            + Math.sin(tt * 2.7 + 0.4) * swMag * 0.35,
          Math.cos(tt * 1.3) * swMag + Math.sin(tt * 2.1 + 0.5) * swMag * 0.5
            + Math.cos(tt * 3.1 + 1.1) * swMag * 0.3 ];
      const [swerveX, swerveY] = path(wt);
      // the bunny lags behind the vanishing point (chasing the winding path)
      const [bunnyX, bunnyY] = path(wt - 0.22);

      // ---- spawn streaking particles that fly past the camera ----
      if (env > 0.05) {
        const want = Math.floor(52 * env);   // denser field for more drama
        while (this.warpParticles.length < want) {
          const ang = Math.random() * Math.PI * 2;
          this.warpParticles.push({
            ang,
            depth: Math.random(),                 // 0 far (core) .. 1 near (off screen)
            speed: 0.6 + Math.random() * 1.1,
            spin: (Math.random() - 0.5) * 1.4,    // tangential drift (swirl)
            hue: 250 + Math.random() * 70,        // violet..magenta..blue
            size: 0.6 + Math.random() * 1.4,
            glow: Math.random() < 0.5,            // half are big glowing orbs near the bunny
          });
        }
      }
      // advance particles outward (toward the viewer) and recycle them at the core
      for (const p of this.warpParticles) {
        p.depth += dt * p.speed * (0.9 + env * 1.2);  // faster, more dramatic flow
        p.ang += dt * p.spin * 0.7;               // swirl as they fly
        if (p.depth >= 1) { p.depth = 0; p.ang = Math.random() * Math.PI * 2; }
      }
      if (env < 0.02) this.warpParticles.length = 0;

      ctx.save();

      // 1) deep-space backdrop - fully opaque once enveloped so no canvas shows
      //    through at the corners even when the tunnel center swerves off-centre.
      ctx.fillStyle = `rgba(6, 3, 20, ${Math.min(1, env * 1.5)})`;
      ctx.fillRect(0, 0, W, H);

      ctx.translate(cx + swerveX, cy + swerveY);
      const swirl = t * (dir === 1 ? 2.4 : -2.4);

      // 2a) NEBULA HAZE: soft rotating wisps of colour filling the tunnel between the
      //     spiral arms, so the walls read as glowing gas rather than bare lines.
      ctx.globalCompositeOperation = "lighter";
      const HAZE = 5;
      for (let h = 0; h < HAZE; h++) {
        const hazeAng = (h / HAZE) * Math.PI * 2 + swirl * 0.6;
        let depth = ((h / HAZE) + (dir === 1 ? t : -t) * 0.35) % 1;
        if (depth < 0) depth += 1;
        const rr = maxR * 1.1 * Math.pow(depth, 1.6);
        const hx = Math.cos(hazeAng) * rr * 0.55, hy = Math.sin(hazeAng) * rr * 0.5;
        const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, maxR * 0.5 * (0.4 + depth));
        const hue = 255 + (h % 3) * 22;
        hg.addColorStop(0, `hsla(${hue}, 85%, 65%, ${0.10 * env})`);
        hg.addColorStop(1, `hsla(${hue}, 85%, 50%, 0)`);
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.arc(hx, hy, maxR * 0.5 * (0.4 + depth), 0, Math.PI * 2); ctx.fill();
      }

      // 2) the TUNNEL WALLS as spiralling light arcs. Several spiral "blades" wind
      //    from the core outward; as they scroll they read as a rushing vortex.
      const ARMS = 7;                          // spiral arms around the tunnel
      const SEGS = 30;                         // segments per arm (smoothness)
      for (let arm = 0; arm < ARMS; arm++) {
        const base = (arm / ARMS) * Math.PI * 2 + swirl;
        ctx.beginPath();
        for (let sgi = 0; sgi <= SEGS; sgi++) {
          // depth scrolls so the spiral appears to rush outward toward us
          let depth = ((sgi / SEGS) + (dir === 1 ? t : -t) * 0.5) % 1;
          if (depth < 0) depth += 1;
          const rr = maxR * 2.2 * Math.pow(depth, 2.0);    // perspective: bunch at core
          const twist = base + depth * 5.5;                // the spiral winding
          const x = Math.cos(twist) * rr, y = Math.sin(twist) * rr * 0.92;
          sgi === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        const hue = 250 + (arm % 3) * 18;
        ctx.strokeStyle = `hsla(${hue}, 90%, 70%, ${0.32 * env})`;
        ctx.lineWidth = 5;
        ctx.stroke();
      }

      // 2b) SECONDARY fine threads winding the opposite-ish way, tighter, brighter -
      //     they add intricate detail and a sense of fast rotation.
      const THREADS = 11;
      for (let th = 0; th < THREADS; th++) {
        const base = (th / THREADS) * Math.PI * 2 - swirl * 1.4;
        ctx.beginPath();
        for (let sgi = 0; sgi <= SEGS; sgi++) {
          let depth = ((sgi / SEGS) + (dir === 1 ? t : -t) * 0.7) % 1;
          if (depth < 0) depth += 1;
          const rr = maxR * 2.2 * Math.pow(depth, 2.1);
          const twist = base + depth * 8.0;               // tighter winding
          const x = Math.cos(twist) * rr, y = Math.sin(twist) * rr * 0.92;
          sgi === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `hsla(${280 + (th % 4) * 12}, 95%, 80%, ${0.18 * env})`;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }

      // 3) faint concentric rings give the tunnel solidity behind the spirals
      const RINGS = 18;
      for (let i = RINGS; i >= 0; i--) {
        let depth = ((i / RINGS) + (dir === 1 ? t : -t) * 0.5) % 1;
        if (depth < 0) depth += 1;
        const rr = maxR * 2.2 * Math.pow(depth, 2.0);
        if (rr < 3) continue;
        const bright = 1 - depth;
        ctx.strokeStyle = `hsla(265, 80%, ${30 + 40 * bright}%, ${0.16 * bright * env})`;
        ctx.lineWidth = 2 + 10 * bright;
        ctx.beginPath();
        ctx.ellipse(0, 0, rr, rr * 0.92, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 4) particles/stars streaking past the camera (with motion-blur tails)
      for (const p of this.warpParticles) {
        const rr = maxR * 2.2 * Math.pow(p.depth, 1.8);
        const tailDepth = Math.max(0, p.depth - 0.06);
        const rr2 = maxR * 2.2 * Math.pow(tailDepth, 1.8);
        const ca = Math.cos(p.ang), sa = Math.sin(p.ang);
        const a = Math.min(1, p.depth * 1.6) * env;        // brighter as it nears us
        if (p.glow) {
          // a soft glowing orb that drifts past the bunny, growing as it nears
          const orbR = p.size * (1.5 + p.depth * 6);
          const og = ctx.createRadialGradient(ca * rr, sa * rr * 0.92, 0,
                                              ca * rr, sa * rr * 0.92, orbR);
          og.addColorStop(0, `hsla(${p.hue}, 100%, 90%, ${a})`);
          og.addColorStop(0.4, `hsla(${p.hue}, 95%, 75%, ${a * 0.6})`);
          og.addColorStop(1, `hsla(${p.hue}, 90%, 60%, 0)`);
          ctx.fillStyle = og;
          ctx.beginPath(); ctx.arc(ca * rr, sa * rr * 0.92, orbR, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.strokeStyle = `hsla(${p.hue}, 95%, 78%, ${a})`;
          ctx.lineWidth = p.size * (0.6 + p.depth * 2.2);
          ctx.beginPath();
          ctx.moveTo(ca * rr2, sa * rr2 * 0.92);
          ctx.lineTo(ca * rr,  sa * rr  * 0.92);
          ctx.stroke();
          // bright sparkle head at the leading edge for a starry twinkle
          if (p.depth > 0.45) {
            ctx.fillStyle = `hsla(${p.hue}, 100%, 92%, ${a})`;
            ctx.beginPath();
            ctx.arc(ca * rr, sa * rr * 0.92, p.size * (0.6 + p.depth), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      // 4b) chromatic edge glow - faint coloured vignette pulling toward the rim,
      //     selling the feeling of speed rushing past the screen edges.
      const edge = ctx.createRadialGradient(0, 0, maxR * 0.55, 0, 0, maxR * 1.15);
      edge.addColorStop(0, "rgba(120, 70, 220, 0)");
      edge.addColorStop(0.7, `rgba(150, 90, 240, ${0.12 * env})`);
      edge.addColorStop(1, `rgba(90, 50, 200, ${0.30 * env})`);
      ctx.fillStyle = edge;
      ctx.beginPath(); ctx.arc(0, 0, maxR * 1.15, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = "source-over";

      // 5) bright swirling event horizon at the core
      const horR = maxR * (0.13 + 0.05 * Math.sin(t * 5));
      const hor = ctx.createRadialGradient(0, 0, 1, 0, 0, horR * 2.6);
      hor.addColorStop(0, `rgba(255, 255, 255, ${env})`);
      hor.addColorStop(0.3, `rgba(230, 200, 255, ${0.95 * env})`);
      hor.addColorStop(0.7, `rgba(170, 110, 245, ${0.5 * env})`);
      hor.addColorStop(1, `rgba(120, 70, 220, 0)`);
      ctx.fillStyle = hor;
      ctx.beginPath(); ctx.arc(0, 0, horR * 2.6, 0, Math.PI * 2); ctx.fill();

      // 6) the bunny flying the winding path. For drama it first ZOOMS in close to
      //    the viewer (big), then scales back down as it falls away into the core -
      //    selling the sense of tumbling deeper into the wormhole. It trails the
      //    vanishing point and banks into the turns.
      const sprite = Images.bunny_idle;
      const warpT = dir === 1 ? env : (1 - env);
      // dive scale: starts ~2.4x (zoomed at the viewer) and falls to ~0.45x (deep in);
      // emerge: grows from ~0.45x back to full as it lands in the new map.
      let scale;
      if (dir === 1) {
        // early in the journey it's big and close; ease it down over the flight
        const journey = Math.min(1, wt / 4.2);          // 0..1 over ~4.2s
        const zoom = 2.4 - 1.95 * Math.pow(journey, 0.7); // 2.4 -> ~0.45
        // a gentle bob so it feels like it's being tossed in the current
        scale = zoom * (1 + 0.06 * Math.sin(wt * 6));
      } else {
        scale = 0.45 + 0.75 * warpT;                    // 0.45 -> 1.2 on the way out
      }
      // velocity of the swerve -> lean the bunny into the direction it's heading
      const [nextBX, nextBY] = path(wt - 0.22 + 0.03);
      const bank = Math.atan2(nextBY - bunnyY, nextBX - bunnyX) * 0.3;
      const tumble = dir * warpT * Math.PI * 2.4 + bank;
      if (env > 0.04) {
        ctx.save();
        // sit the bunny on its path point (relative to the already-swerved center)
        ctx.translate(bunnyX - swerveX, bunnyY - swerveY + (dir === 1 ? warpT * 6 : (1 - warpT) * 6));
        ctx.rotate(tumble);
        ctx.globalAlpha = Math.min(1, env * 1.8);
        const bs = (CONFIG.SCALED_TILE * 1.8) * scale;
        if (sprite && sprite.complete) {
          const fr = CONFIG.PLAYER_FRAME_SIZE || 48;
          ctx.imageSmoothingEnabled = false;
          ctx.shadowColor = "rgba(190, 150, 255, 0.95)";
          ctx.shadowBlur = 24 + 16 * Math.max(0, scale - 1);  // bigger glow when zoomed in
          ctx.drawImage(sprite, 0, 0, fr, fr, -bs / 2, -bs / 2, bs, bs);
        } else {
          ctx.fillStyle = "#fdf4e3";
          ctx.beginPath(); ctx.arc(0, 0, bs / 2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
      ctx.restore();
    }

    if (this.state === STATE.PLAYING && this.nearbyNpc) {
      UI.drawPrompt(ctx, `Press T to talk to ${this.nearbyNpc.name}`);
    }
    if (this.state === STATE.DIALOGUE) {
      UI.drawDialogue(ctx, this.dialogue);
    }
    if (this.state === STATE.INVENTORY) {
      UI.drawInventory(ctx, this.inventory);
    }
    if (this.state === STATE.PAUSED) {
      this.drawPauseMenu(ctx);
    }
    if (this.state === STATE.SHOP) {
      this.drawShop(ctx);
    }
    if (this.state === STATE.GAMEOVER) {
      UI.drawScreen(ctx, "Game Over", "Press ENTER to try again", "#f08a8a");
    }
    if (this.state === STATE.WIN) {
      this.drawWinScreen(ctx);
    }

    // ----- Debug overlays draw LAST, on top of everything (Appendix F) -----
    Debug.draw(ctx, this);
  }
}

// ---------- Start everything once the page is ready ----------
window.addEventListener("load", () => {
  const canvas = document.getElementById("game");
  canvas.width = CONFIG.CANVAS_WIDTH;
  canvas.height = CONFIG.CANVAS_HEIGHT;
  const game = new Game(canvas);
  // Exposed on purpose: open the browser console and type `game` to poke at
  // the live game while it runs (e.g. `game.player.hp = 1`). Great for learning!
  window.game = game;
  game.boot();
});
