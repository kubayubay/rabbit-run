// =============================================================
//  effects.js - "Make It Super" enrichment: particles + floating numbers.
// =============================================================
//  This matches the Game Feel coding companion (sections 1 and 5) and the
//  "Make It Super" slides. A particle is a tiny dot with a position, a
//  velocity, a color, and a life timer. A burst spawns many at once.
// =============================================================

// A palette of bright, saturated firework colors. Each particle picks one at
// random so a single burst explodes in many colors instead of one.
const FIREWORK_COLORS = [
  "#ff5a5a", // red
  "#ff9f43", // orange
  "#ffd84a", // yellow
  "#7bed5a", // green
  "#4ad6c8", // teal
  "#5aa9ff", // blue
  "#9b7bff", // violet
  "#ff6ad5", // pink
  "#ffffff", // white sparkle
];

class Particle {
  constructor(x, y, color) {
    const angle = Math.random() * Math.PI * 2;
    // Start a little way out from the center along the launch angle, so the
    // burst reads as a ring opening up rather than everything piled on one pixel.
    const startR = 6 + Math.random() * 8;
    this.x = x + Math.cos(angle) * startR;
    this.y = y + Math.sin(angle) * startR;
    // Launch FAST so the burst flies way OUT into a big firework spread (about
    // 2.5x the previous reach) before the drag below eases it to a stop.
    const speed = 320 + Math.random() * 360;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = 1.2 + Math.random() * 0.7;   // live longer so they fade slowly
    this.maxLife = this.life;
    this.size = 5 + Math.random() * 4;
    // Each particle gets its own bright color, so one burst is multi-colored.
    this.color = FIREWORK_COLORS[(Math.random() * FIREWORK_COLORS.length) | 0];
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += 60 * dt;          // gentle gravity so they drift and linger
    // Light air drag: particles keep most of their speed at first (flying far
    // outward into a big ring) and only ease to a stop near the end.
    this.vx *= 0.94;
    this.vy *= 0.94;
    this.life -= dt;             // age
  }

  draw(ctx, camera) {
    // Soft, slow fade: sqrt keeps particles bright for most of their life,
    // then they ease out gently at the end instead of vanishing abruptly.
    const t = Math.max(0, this.life / this.maxLife);
    const alpha = Math.sqrt(t);
    const sx = this.x - camera.x, sy = this.y - camera.y;
    const r = this.size * (0.5 + t * 0.5);       // shrink slowly as it ages

    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = "lighter";    // additive = colors GLOW where they overlap

    // big soft glow halo (stronger + larger than before)
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 20;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    // a second pass deepens the glow
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();

    // small white-hot center so the particle's own color stays vivid
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(sx, sy, r * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = "source-over"; // reset!
    ctx.globalAlpha = 1;
  }
}

export const Particles = {
  list: [],
  burst(x, y, color = "#ffd98a", count = 12) {
    for (let i = 0; i < count; i++) this.list.push(new Particle(x, y, color));
  },
  update(dt) {
    for (const p of this.list) p.update(dt);
    this.list = this.list.filter(p => p.life > 0);
  },
  draw(ctx, camera) {
    for (const p of this.list) p.draw(ctx, camera);
  },
};

export const Floaters = {
  list: [],
  spawn(x, y, text, color = "#fff") {
    this.list.push({ x, y, text, color, life: 1.1, vy: -34 });
  },
  update(dt) {
    for (const f of this.list) { f.y += f.vy * dt; f.life -= dt; }
    this.list = this.list.filter(f => f.life > 0);
  },
  draw(ctx, camera) {
    ctx.font = "bold 22px monospace";   // bigger so the numbers are easy to read
    ctx.textAlign = "center";
    ctx.lineWidth = 4;
    for (const f of this.list) {
      ctx.globalAlpha = Math.max(0, f.life / 1.1);
      const sx = f.x - camera.x, sy = f.y - camera.y;
      ctx.strokeStyle = "rgba(30,20,10,0.85)";   // dark outline for contrast
      ctx.strokeText(f.text, sx, sy);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, sx, sy);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = "left";
  },
};

// =============================================================
//  Combo counter (companion sec. 18): consecutive hits in a window.
// =============================================================
export const Combo = {
  count: 0,
  timer: 0,
  hit() { this.count += 1; this.timer = 1.5; }, // 1.5s to land the next hit
  update(dt) {
    if (this.timer > 0) { this.timer -= dt; if (this.timer <= 0) this.count = 0; }
  },
  draw(ctx, player, camera) {
    if (this.count > 1) {
      const px = player.x - camera.x + player.width / 2;
      const py = player.y - camera.y - 36;
      ctx.font = "bold " + (24 + this.count * 4) + "px monospace";
      ctx.textAlign = "center";
      // dark outline so it reads against any background
      ctx.lineWidth = 4; ctx.strokeStyle = "rgba(40,30,10,0.8)";
      ctx.strokeText("x" + this.count + "!", px, py);
      ctx.fillStyle = "#ffd98a";
      ctx.fillText("x" + this.count + "!", px, py);
      ctx.textAlign = "left";
    }
  },
};

// =============================================================
//  Weather - rain (companion sec. 25): a pool of looping drops.
// =============================================================
export const Weather = {
  drops: null,
  enabled: false,
  init(w, h) {
    this.drops = Array.from({ length: 160 }, () => ({
      x: Math.random() * w, y: Math.random() * h, speed: 240 + Math.random() * 160,
      len: 10 + Math.random() * 8,
    }));
  },
  update(dt, w, h) {
    if (!this.enabled || !this.drops) return;
    for (const d of this.drops) {
      d.y += d.speed * dt;
      if (d.y > h) { d.y = -5; d.x = Math.random() * w; }
    }
  },
  draw(ctx) {
    if (!this.enabled || !this.drops) return;
    ctx.fillStyle = "rgba(40,60,90,0.18)";       // grey storm tint
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.strokeStyle = "rgba(190,215,255,0.85)";  // brighter, more opaque drops
    ctx.lineWidth = 2;
    for (const d of this.drops) {
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 3, d.y + d.len); ctx.stroke();
    }
  },
};

// =============================================================
//  Score + high score (companion sec. 21): points + localStorage.
// =============================================================
export const Score = {
  value: 0,
  add(points) {
    this.value += points;
    const best = Number(localStorage.getItem("highScore") || 0);
    if (this.value > best) localStorage.setItem("highScore", this.value);
  },
  high() { return Number(localStorage.getItem("highScore") || 0); },
};
