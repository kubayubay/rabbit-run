// =============================================================
//  ui.js - Draws everything that sits ON TOP of the game world:
//  the health bar, the quest objectives HUD, the dialogue box,
//  the inventory screen, and little prompts like "Press T to talk".
// =============================================================
//  All UI is drawn with simple canvas rectangles and text so you
//  can see exactly how each piece is made - no hidden magic.
// =============================================================

import { CONFIG } from "./config.js";

// Our cozy blue-pastel palette (kept in one spot for consistency).
// Soft slate-blue panels read clearly over the bright Dreamyland tileset.
const COLORS = {
  panel:    "#2f4a63",   // deep slate blue
  panelEdge:"#7fb2dc",   // soft sky-blue border
  text:     "#f3f8fd",   // near-white
  dim:      "#bcd4ea",   // pale blue
  hp:       "#f08a8a",   // soft coral
  hpBack:   "#3a5a70",   // muted blue-grey
  accent:   "#ffd98a",   // warm soft amber
  done:     "#9ad9b0",   // soft mint green
};

// Draw a rounded retro panel with a border.
function panel(ctx, x, y, w, h) {
  ctx.fillStyle = COLORS.panel;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = COLORS.panelEdge;
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
}

export const UI = {
  // ----- Make It Super: timed power-up countdown bars (sec. 19) -----
  // Draws one small bar per active boost at the top-center of the screen. Each
  // bar empties as its boost runs out, so the player can see how long is left.
  drawBoosts(ctx, player, topY = 12) {
    if (!player || !player.boosts) return;
    const ids = Object.keys(player.boosts);
    if (ids.length === 0) return;

    const barW = 150, barH = 16, gap = 6;
    let y = topY;
    for (const id of ids) {
      const b = player.boosts[id];
      const frac = Math.max(0, Math.min(1, b.remaining / b.total)); // clamp 0..1
      const x = (CONFIG.CANVAS_WIDTH - barW) / 2;                   // centered

      panel(ctx, x - 4, y - 4, barW + 8, barH + 8);
      ctx.fillStyle = COLORS.hpBack;                 // empty track
      ctx.fillRect(x, y, barW, barH);
      ctx.fillStyle = b.color || COLORS.accent;      // filled portion shrinks
      ctx.fillRect(x, y, barW * frac, barH);
      ctx.fillStyle = COLORS.text;                   // label + seconds left
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "left";
      ctx.fillText(b.label || id, x + 6, y + 12);
      ctx.textAlign = "right";
      ctx.fillText(b.remaining.toFixed(1) + "s", x + barW - 6, y + 12);
      ctx.textAlign = "left";
      y += barH + 8 + gap;
    }
  },

  // ---------- The player's stats: HP, level & XP (top-left) ----------
  drawHealth(ctx, player) {
    const x = 12, y = 12, w = 160, hpH = 18, xpH = 10, gap = 6;
    const panelH = hpH + gap + xpH;
    panel(ctx, x - 4, y - 4, w + 8, panelH + 8);

    // HP bar
    ctx.fillStyle = COLORS.hpBack;
    ctx.fillRect(x, y, w, hpH);
    ctx.fillStyle = COLORS.hp;
    // Make It Super: draw from displayedHp (eased) so the bar GLIDES (sec. 4).
    const shownHp = (player.displayedHp !== undefined) ? player.displayedHp : player.hp;
    ctx.fillRect(x, y, w * (shownHp / player.maxHp), hpH);
    ctx.fillStyle = COLORS.text;
    ctx.font = "12px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`HP ${player.hp}/${player.maxHp}`, x + 6, y + 13);

    // XP bar (thinner, below HP)
    const xpY = y + hpH + gap;
    ctx.fillStyle = COLORS.hpBack;
    ctx.fillRect(x, xpY, w, xpH);
    ctx.fillStyle = COLORS.accent; // warm amber for XP
    ctx.fillRect(x, xpY, w * (player.xp / player.xpToNext), xpH);
    ctx.fillStyle = COLORS.text;
    ctx.font = "9px monospace";
    ctx.fillText(`LV ${player.level}`, x + 6, xpY + 8);
    ctx.textAlign = "right";
    ctx.fillText(`XP ${player.xp}/${player.xpToNext}`, x + w - 6, xpY + 8);
    ctx.textAlign = "left";

    // Brief "LEVEL UP!" flash near the player's stats
    if (player.justLeveledTimer > 0) {
      ctx.fillStyle = COLORS.done;
      ctx.font = "bold 14px monospace";
      ctx.fillText("LEVEL UP!", x + 2, xpY + xpH + 20);
    }
  },

  // ---------- Quest objectives HUD (top-right, toggleable) ----------
  drawQuests(ctx, questLog, minimapShowing) {
    // If the minimap is up in the top-right corner, the quest panel would collide
    // with it. So when the minimap is showing we anchor the panel on the LEFT,
    // tucked just under the health bar; otherwise we keep it in the top-right.
    if (!questLog.hudVisible) {
      // Show a tiny hint that the HUD is hidden.
      ctx.fillStyle = COLORS.dim;
      ctx.font = "11px monospace";
      ctx.textAlign = minimapShowing ? "left" : "right";
      const hintX = minimapShowing ? 12 : CONFIG.CANVAS_WIDTH - 12;
      ctx.fillText("Quests hidden (Q)", hintX, 70);
      ctx.textAlign = "left";
      return;
    }
    const active = questLog.activeQuests();
    if (active.length === 0) return;

    // Show completed quests collapsed (title only) and in-progress quests with
    // their objectives. This keeps the panel tidy even with many quests.
    const inProgress = active.filter(q => !q.completed);
    const done = active.filter(q => q.completed);

    const w = 250;
    // Left side (under the health bar) when the minimap is up; top-right otherwise.
    const x = minimapShowing ? 12 : CONFIG.CANVAS_WIDTH - w - 12;
    const y = minimapShowing ? 60 : 12;
    let lines = 1; // header
    for (const q of inProgress) lines += 1 + q.objectives.length;
    lines += done.length; // one line each
    const h = 14 + lines * 16;
    panel(ctx, x, y, w, h);

    ctx.textAlign = "left";
    let ty = y + 20;
    ctx.fillStyle = COLORS.accent;
    ctx.font = "bold 12px monospace";
    ctx.fillText("QUESTS  (Q to hide)", x + 10, ty);
    ty += 18;

    // In-progress quests with their objectives.
    for (const q of inProgress) {
      ctx.fillStyle = COLORS.text;
      ctx.font = "bold 12px monospace";
      ctx.fillText("• " + q.title, x + 10, ty);
      ty += 16;
      for (const o of q.objectives) {
        const odone = o.current >= o.needed;
        ctx.fillStyle = odone ? COLORS.done : COLORS.dim;
        ctx.font = "11px monospace";
        const label = o.text || `${o.type} ${o.target}`;
        ctx.fillText(`   ${label}  ${o.current}/${o.needed}`, x + 10, ty);
        ty += 16;
      }
    }
    // Completed quests, collapsed to one green line each.
    for (const q of done) {
      ctx.fillStyle = COLORS.done;
      ctx.font = "bold 12px monospace";
      ctx.fillText("✓ " + q.title, x + 10, ty);
      ty += 16;
    }
  },

  // ---------- "Press T" style prompt near the player ----------
  drawPrompt(ctx, text) {
    // Set the font BEFORE measuring, or measureText() uses whatever font was
    // active from the last draw - giving a width that doesn't match the text we
    // actually render, so the box ends up too narrow. Measure with the real font.
    ctx.font = "13px monospace";
    const w = ctx.measureText(text).width + 24;
    const x = CONFIG.CANVAS_WIDTH/2 - w/2, y = CONFIG.CANVAS_HEIGHT - 150;
    panel(ctx, x, y, w, 28);
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "center";
    ctx.fillText(text, CONFIG.CANVAS_WIDTH/2, y + 19);
  },

  // ---------- Dialogue box at the bottom ----------
  drawDialogue(ctx, dialogue) {
    const margin = 16;
    const h = 120;
    const x = margin, y = CONFIG.CANVAS_HEIGHT - h - margin;
    const w = CONFIG.CANVAS_WIDTH - margin * 2;
    panel(ctx, x, y, w, h);

    // Speaker name tab.
    ctx.fillStyle = COLORS.accent;
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "left";
    ctx.fillText(dialogue.speakerName, x + 16, y + 24);

    // The typed-so-far text, wrapped to fit.
    const shown = dialogue.currentText.slice(0, dialogue.charIndex);
    ctx.fillStyle = COLORS.text;
    ctx.font = "14px monospace";
    this.wrapText(ctx, shown, x + 16, y + 48, w - 32, 18);

    // Choices (if any, and only after text finished typing).
    const choices = dialogue.currentChoices;
    if (choices && dialogue.fullyTyped) {
      let cy = y + 48 + 22;
      choices.forEach((c, i) => {
        const selected = i === dialogue.choiceIndex;
        ctx.fillStyle = selected ? COLORS.accent : COLORS.dim;
        ctx.fillText((selected ? "▶ " : "   ") + c, x + 24, cy);
        cy += 18;
      });
    } else if (dialogue.fullyTyped) {
      // Little blinking "continue" arrow.
      if (Math.floor(performance.now() / 400) % 2 === 0) {
        ctx.fillStyle = COLORS.accent;
        ctx.fillText("▼", x + w - 28, y + h - 14);
      }
    }
  },

  // ---------- Inventory screen ----------
  drawInventory(ctx, inventory) {
    // Dim the world behind the menu.
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

    const w = 360, h = 280;
    const x = CONFIG.CANVAS_WIDTH/2 - w/2, y = CONFIG.CANVAS_HEIGHT/2 - h/2;
    panel(ctx, x, y, w, h);

    ctx.fillStyle = COLORS.accent;
    ctx.font = "bold 18px monospace";
    ctx.textAlign = "center";
    ctx.fillText("INVENTORY", CONFIG.CANVAS_WIDTH/2, y + 30);

    const items = inventory.list();
    ctx.textAlign = "left";
    ctx.font = "14px monospace";
    if (items.length === 0) {
      ctx.fillStyle = COLORS.dim;
      ctx.fillText("(empty - go find some treasure!)", x + 24, y + 70);
    } else {
      let iy = y + 64;
      for (const it of items) {
        ctx.fillStyle = COLORS.text;
        ctx.fillText(`• ${it.name}`, x + 24, iy);
        ctx.fillStyle = COLORS.accent;
        ctx.textAlign = "right";
        ctx.fillText(`x${it.count}`, x + w - 24, iy);
        ctx.textAlign = "left";
        iy += 24;
      }
    }
    ctx.fillStyle = COLORS.dim;
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.fillText("Press I or Esc to close", CONFIG.CANVAS_WIDTH/2, y + h - 18);
  },

  // ---------- A full-screen message (title / game over / win) ----------
  drawScreen(ctx, title, subtitle, color = COLORS.accent) {
    ctx.fillStyle = "rgba(28,52,74,0.82)";
    ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.font = "bold 40px monospace";
    ctx.fillText(title, CONFIG.CANVAS_WIDTH/2, CONFIG.CANVAS_HEIGHT/2 - 10);
    ctx.fillStyle = COLORS.text;
    ctx.font = "16px monospace";
    ctx.fillText(subtitle, CONFIG.CANVAS_WIDTH/2, CONFIG.CANVAS_HEIGHT/2 + 30);
  },

  // Helper: wrap a long string into multiple lines inside maxWidth.
  wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(" ");
    let line = "";
    for (const word of words) {
      const test = line + word + " ";
      if (ctx.measureText(test).width > maxWidth && line !== "") {
        ctx.fillText(line, x, y);
        line = word + " ";
        y += lineHeight;
      } else {
        line = test;
      }
    }
    ctx.fillText(line, x, y);
  },
};
