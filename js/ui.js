// =============================================================
//  ui.js - Draws everything that sits ON TOP of the game world:
//  the health bar, the quest objectives HUD, the dialogue box,
//  the inventory screen, and little prompts like "Press T to talk".
// =============================================================

// ============================================================================
// STARTER STUB - you write this file during the code-along (Week 3, Day 1 (grows in Week 4)).
// Follow the slides / Coding Companion for this week. If you fall behind,
// the complete version is in the matching weekN-checkpoint/js/ui.js.
// ============================================================================

// TODO: build this file here.
import { CONFIG } from "./config.js";

const COLORS = {
    panel:    "#2f4a63",
    panelEdge:"#7fb2dc",
    text:     "#f3f8fd",
    dim:      "#bcd4ea",
    hp:       "#f08a8a",
    hpBack:   "#3a5a70",
    accent:   "#ffd98a",
    done:     "#9ad9b0",
    timer:    "#ff6b6b",
};

function panel(ctx, x, y, w, h){
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(x,y,w,h);
    ctx.strokeStyle = COLORS.panelEdge;
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
}

export const UI = {
    drawHealth(ctx, player){
        const x = 12, y = 12, w = 160, hpH = 18, xpH = 10, gap = 6;
        const panelH = hpH + gap + xpH;
        panel(ctx, x - 4, y - 4,w + 8, panelH + 8);

        ctx.fillStyle = COLORS.hpBack;
        ctx.fillRect(x, y, w, hpH);
        ctx.fillStyle = COLORS.hp;
        ctx.fillRect(x, y, w * (player.hp / player.maxHp), hpH);
        ctx.fillStyle = COLORS.text;
        ctx.font = "12px monospace";
        ctx.textAlign = "left";
        ctx.fillText(`${Math.round(player.hp)}/${Math.round(player.maxHp)}`, x + 6, y + 13);

        const xpY = y + hpH + gap;
        ctx.fillStyle = COLORS.hpBack;
        ctx.fillRect(x, xpY, w, xpH);
        ctx.fillStyle = COLORS.accent;
        ctx.fillRect(x, xpY, w * (player.xp / player.xpToNext), xpH);
        ctx.fillStyle = COLORS.text;
        ctx.font = "9px monospace";
        ctx.fillText(`LV ${player.level}`, x + 6, xpY + 8);
        ctx.textAlign = "right";
        ctx.fillText(`XP ${player.xp}/${player.xpToNext}`, x + w - 6, xpY + 8);
        ctx.textAlign = "left";

        if(player.justLeveledTimer > 0){
            ctx.fillStyle = COLORS.done;
            ctx.font = "bold 14px monospace";
            ctx.fillText("LEVEL UP!", x + 2, xpY + xpH + 20);
        }
    },

    drawDeltaTime(ctx, elapsedTime){
        ctx.save();
        ctx.fillStyle = COLORS.timer;
        ctx.font = "12px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`TIME ${elapsedTime.toFixed(1)}s`, CONFIG.CANVAS_WIDTH / 2, 20);
        ctx.restore();
    },

    drawQuests(ctx, questLog){
        if(!questLog.hudVisible){
            ctx.fillStyle = COLORS.dim;
            ctx.font = "11px monospace";
            ctx.textAlign = "right";
            ctx.fillText("Quests hidden (Q)", CONFIG.CANVAS_WIDTH - 12, 22);
            return;
        }
        const active = questLog.activeQuests();
        if(active.length === 0) return;

        const inProgress = active.filter(q => !q.completed);
        const done = active.filter(q => q.completed);

        const w = 240, x = CONFIG.CANVAS_WIDTH - w - 12, y = 12;
        let lines = 1;
        for(const q of active) lines += 1 + q.objectives.length;
        const h = 14 + lines * 16;
        panel(ctx, x, y, w, h);

        ctx.textAlign = "left";
        let ty = y + 20;
        ctx.fillStyle = COLORS.accent;
        ctx.font = "bold 12px monospace";
        ctx.fillText("QUESTS (Q to hide)", x + 10, ty);
        ty += 18;

        for(const q of inProgress){
            ctx.fillStyle = COLORS.text;
            ctx.font = "bold 12px monospace";
            ctx.fillText("• " + q.title, x + 10, ty);
            ty += 16;
            for(const o of q.objectives){
                const done = o.current >= o.needed;
                ctx.fillStyle = done ? COLORS.done : COLORS.dim;
                ctx.font = "11px monospace";
                const label = o.text || `${o.type} ${o.target}`;
                ctx.fillText(`  ${label}    ${o.current}/${o.needed}`, x + 10, ty);
                ty += 16;
            }
        }

        for(const q of done){
            ctx.fillStyle = COLORS.done;
            ctx.font = "bold 12px monospace";
            ctx.fillText("✓ " + q.title, x + 10, ty);
            ty += 16;
        }
    },

    drawStats(ctx, player){
        const w = 220;
        const h = 84;
        const x = 12;
        const y = CONFIG.CANVAS_HEIGHT - h - 12;

        panel(ctx, x, y, w, h);
        ctx.fillStyle = COLORS.text;
        ctx.font = "12px monospace";
        ctx.textAlign = "left";
        ctx.fillText(`attackSpeed: ${player.attackSpeed.toFixed(2)}`, x + 10, y + 20);
        ctx.fillText(`attackDamage: ${player.attackDamage}`, x + 10, y + 38);
        ctx.fillText(`attackRange: ${player.attackRange}`, x + 10, y + 56);
        ctx.fillText(`armor: ${player.armor}`, x + 10, y + 74);
    },

    drawPrompt(ctx, text){
        const w = ctx.measureText(text).width + 24;
        const x = CONFIG.CANVAS_WIDTH/2 - w/2, y = CONFIG.CANVAS_HEIGHT - 150;
        panel(ctx, x, y, w, 28);
        ctx.fillStyle = COLORS.text;
        ctx.font = "13px monospace";
        ctx.textAlign = "center";
        ctx.fillText(text, CONFIG.CANVAS_WIDTH/2, y + 19);
    },

    drawDialogue(ctx, dialogue){
        const margin = 16;
        const h = 120;
        const x = margin, y = CONFIG.CANVAS_HEIGHT - h - margin;
        const w = CONFIG.CANVAS_WIDTH - margin * 2;
        panel(ctx, x, y, w, h);

        ctx.fillStyle = COLORS.accent;
        ctx.font = "bold 14px monospace";
        ctx.textAlign = "left";
        ctx.fillText(dialogue.speakerName, x + 16, y + 24);

        const shown = dialogue.currentText.slice(0, dialogue.charIndex);
        ctx.fillStyle = COLORS.text;
        ctx.font = "14px monospace";
        this.wrapText(ctx, shown, x + 16, y + 48, w - 32, 18);

        const choices = dialogue.currentChoices;
        if(choices && dialogue.fullyTyped){
            let cy = y + 48 + 22;
            choices.forEach((c, i) => {
                const selected = i === dialogue.choiceIndex;
                ctx.fillStyle = selected ? COLORS.accent : COLORS.dim;
                ctx.fillText((selected ? "▸ " : "   ") + c, x + 24, cy);
                cy += 18;
            });
        }else if(dialogue.fullyTyped){
            if(Math.floor(performance.now() / 400) % 2 === 0){
                ctx.fillStyle = COLORS.accent;
                ctx.fillText("▼", x + w - 28, y + h - 14);
            }
        }
    },

    drawInventory(ctx, inventory){
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(0,0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

        const w = 360, h = 280;
        const x = CONFIG.CANVASWIDTH/2 - w/2, y = CONFIG.CANVAS_HEIGHT/2 - h/2;
        panel(ctx, x, y, w,h);

        ctx.fillStyle = COLORS.accent;
        ctx.font = "old 18px monospace";
        ctx.textAlign = "center";
        ctx.fillText("PAUSED", CONFIG.CANVAS_WIDTH/2, y + 30);

        const items = inventory.list();
        ctx.textAlign = "left";
        ctx.font = "14px monospace";
        if(items.length === 0){
            ctx.fillStyle = COLORS.dim;
            ctx.fillText("(empty - go find some treasure!)", x + 24, y + 70);
        }else{
            let iy = y + 64;
            for(const it of items){
                ctx.fillStyle = COLORS.text;
                ctx.fillText(`• ${it.name}`, x + 24,iy);
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

    drawScreen(ctx, title, subtitle, color = COLORS.accent){
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

    wrapText(ctx, text, x, y, maxWidth,lineHeight){
        const words = text.split(" ");
        let line = "";
        for(const word of words){
            const test = line + word + " ";
            if(ctx.measureText(test).width > maxWidth && line !== ""){
                ctx.fillText(line, x, y);
                line = word + " ";
                y += lineHeight;
            }else{
                line = test;
            }
        }
        ctx.fillText(line, x, y);
    },
}