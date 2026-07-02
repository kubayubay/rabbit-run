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
import { Sound } from "./audio.js";
import { TileMap } from "./tilemap.js";
import { Camera } from "./camera.js";
import { Player } from "./player.js";
import { NPC } from "./npc.js";
import { Enemy } from "./enemy.js"
import { Item, Inventory } from "./item.js"
import { QuestLog } from "./quest.js"
import { Dialogue } from "./dialogue.js";
import { Battle } from "./battle.js";
import { UI } from "./ui.js"
import { Particles, Floaters } from "./particles.js";
const STATE = {
    LOADING : "loading",
    TITLE : "title",
    PLAYING : "playing", 
    DIALOGUE : "dialogue", 
    INVENTORY : "inventory",
    GAMEOVER: "gameover",
    WIN: "win",
};

class Game {
    constructor(canvas) {
        this.wave = 0;
        this.waveTimer = 0;
        this.waveActive = false;
        this.timeElapsed = 0;
        this.ctx = canvas.getContext("2d");
        this.ctx.imageSmoothingEnabled = false;
        this.lastTime = 0;
        this.state = STATE.LOADING;
    }
    startWave() {
    const count = 12 + this.wave*1.5;
    for (let i = 0; i < count; i++) {
        this.spawnEnemyAtRandomEdge();
    }
    this.waveActive = true;
}
spawnEnemyAtRandomEdge() {
    const side = Math.floor(Math.random() * 4);
    let x = 0, y = 0;
    if (side === 0) {
        x = Math.random() * this.map.pixelWidth;
        if(x<144){x=144}
        if(x>this.map.pixelWidth-144){x=this.map.pixelWidth-144}
        y = 144;
    } 
    else if (side === 1) {
        x = this.map.pixelWidth-144;
        y = Math.random() * this.map.pixelHeight;
        if (y<144){y=144}
        if (y>this.map.pixelHeight-144){y=this.map.pixelHeight-144}
    } 
    else if (side === 2) { 
        y = this.map.pixelHeight-144;
        x = Math.random() * this.map.pixelWidth;
        if(x<144){x=144};
        if(x>this.map.pixelWidth-144){x=this.map.pixelWidth-144}
    } 
    else {
        x = 144;
        y = Math.random() * this.map.pixelHeight-144;
        if (y<144){y=144}
        if (y>this.map.pixelHeight-144){y=this.map.pixelHeight-144}
    }
    const rand = Math.floor(Math.random() * 3);

this.enemies.push(new Enemy({
    x,
    y,
    type: rand === 0 ? "slime" : rand === 1 ? "bat" : "rat"
}));
}
    async boot(){
        await loadAllAssets();
        const res = await fetch("assets/map_meadow.json");
        this.mapData = await res.json();
        this.state = STATE.TITLE
        //this.loadWorld();
        requestAnimationFrame(this.loop.bind(this))
    }

    loadWorld(){
        this.map = new TileMap(this.mapData);
        this.camera = new Camera();
        this.player = new Player(this.mapData.playerStart.x, this.mapData.playerStart.y)
        this.inventory = new Inventory();
        this.dialogue = new Dialogue();
        this.questLog = new QuestLog();
        this.questLog.define(this.mapData.quests || []);
        this.npcs = [];
        this.enemies = [];
        this.items = [];
        for(const e of this.mapData.entities){
            if (e.kind === "npc") this.npcs.push(new NPC(e));
            else if (e.kind === "enemy") this.enemies.push(new Enemy(e))
            else if (e.kind === "item") this.items.push(new Item(e));
        }
        Sound.playMusic(this.mapData.music || "town_theme");
        this.wave = 1;
        this.timeElapsed = 0;
        this.elapsedTime = 0;
        this.startWave();
    }

    loop(timestamp){
        let dt = (timestamp - this.lastTime)/1000;
        this.lastTime = timestamp;
        if(dt > 0.05) dt = 0.05;
        this.elapsedTime += dt;

        this.update(dt);
        this.draw();
        Input.clearFrame();
        requestAnimationFrame(this.loop.bind(this));
    }
    update(dt){
       switch(this.state){
        case STATE.TITLE:
            if(Input.wasPressed("Space") || Input.wasPressed("Enter")){
                this.loadWorld();
                this.state = STATE.PLAYING;
            }
            break;
        case STATE.PLAYING:
            this.updatePlaying(dt);
            break;
        case STATE.DIALOGUE:
            this.dialogue.update(dt);
            if(!this.dialogue.active) this.state = STATE.PLAYING;
            break;
       
       case STATE.INVENTORY:
            if(Input.wasPressed("KeyI") || Input.wasPressed("Escape")){
                Sound.play("select");
                this.state = STATE.PLAYING;
            }
            break;
        case STATE.GAMEOVER:
        case STATE.WIN:
            if (Input.wasPressed("Space") || Input.wasPressed("Enter")){
                this.state = STATE.TITLE
            }
            break;
       }
       Particles.update(dt);
       Floaters.update(dt);
    }
    updatePlaying(dt){
        if(Input.wasPressed("KeyI")) {
            Sound.play("select");
            this.state = STATE.INVENTORY; 
            return;
        }
        if(Input.wasPressed("KeyQ")) {
            Sound.play("blip");
            this.questLog.toggleHud();
        }

        this.nearbyNpc = this.npcs.find(n=> n.isNear(this.player));
        if(this.nearbyNpc && !this.player.attacking && Input.wasPressed("KeyT")){
            this.startConversation(this.nearbyNpc);
            return;
        }
        this.player.update(dt, this.map);

        if(this.player.isDead){
            Sound.stopMusic();
            Sound.play("gameover");
            this.state = STATE.GAMEOVER;
            return;
        }

        Battle.resolvePlayerAttack(this.player, this.enemies, this.questLog);

        for(const enemy of this.enemies){
            enemy.update(dt, this.player, this.map, this.wave);
            if(enemy.state === "dead" && enemy.drop && !enemy.dropSpawned && enemy.dead){
                this.items.push(new Item(enemy.drop));
                enemy.dropSpawned = true;
            }
        }
        this.enemies = this.enemies.filter(e=>!e.dead);

        for(const npc of this.npcs) npc.update(dt);

        for(const item of this.items){
            item.update(dt);
            if(!item.collected && item.overlaps(this.player)){
                item.collected = true;
                this.inventory.add(item.id, item.name);
                this.questLog.onCollect(item.id);
                if(item.heal) this.player.heal(item.heal);
                if(item.moveSpeed) this.player.addMoveSpeed(item.moveSpeed);
                if(item.maxHealth) this.player.increaseMaxHealth(item.maxHealth);
                if(item.armor) this.player.addArmor(item.armor);
                if(item.attackSpeed) this.player.addAttackSpeed(item.attackSpeed);
                if(Number.isFinite(item.damage) && item.damage !== 0) this.player.addAttackDamage(item.damage);
                if(Number.isFinite(item.attackRange) && item.attackRange !== 0) this.player.addAttackRange(item.attackRange);
            }
        }
        this.items = this.items.filter(i => !i.collected);
        
        const all = Object.values(this.questLog.quests);
        if(all.length > 0 && all.every(q => q.completed)){
            Sound.stopMusic();
            Sound.play("quest");
            this.state = STATE.WIN;
        }
        
        this.camera.follow(this.player, this.map);
        this.timeElapsed += dt;
        const newWave = Math.floor(this.timeElapsed / 30) + 1;

        if (newWave > this.wave) {
            this.wave = newWave;
            this.startWave();
        }
    }

    startConversation(npc){
        this.state = STATE.DIALOGUE;
        this.questLog.onTalk(npc.name);

        const quest = npc.givesQuest ?
        this.questLog.quests[npc.givesQuest] : null;
        let pages = npc.dialogue;
        let offersQuest = true;
        let handInNow = false;
        if (quest && quest.started) {
            offersQuest = false;
            const done = quest.objectives.every(o => o.current >= o.needed);
            if (done && npc.dialogueComplete && !quest.turnedIn) {
                pages = npc.dialogueComplete;
                handInNow = true;
            } else if (done) {
                pages = npc.dialogueComplete || npc.dialogueInProgress || npc.dialogue;
            } else {
                pages = npc.dialogueInProgress || npc.dialogue;
            }
        }

        this.dialogue.start(
            npc.name,
            pages,
            () => {
                if (offersQuest && npc.givesQuest && !npc._declined) {
                    this.questLog.start(npc.givesQuest);
                }
                if (handInNow && quest) {
                    quest.turnedIn = true;
                    quest.checkComplete();
                }
                npc._declined = false;
            },
            (choiceIndex) => {
                if (choiceIndex === 1) npc._declined = true;
            }
        );
    }

    draw(){
        const ctx = this.ctx;
        ctx.fillStyle = "#bfe0f2";
        ctx.fillRect(0,0,CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);
        
        if(this.state === STATE.LOADING){
            UI.drawScreen(ctx, "Loading...", "Readying Sword");
            return
        }
        if(this.state === STATE.TITLE){
            UI.drawScreen(ctx, "Knighting at Night",
                "Press Space to begin", "#ffd98a");
            return;
        }
        
        Particles.draw(ctx, this.camera);
        this.map.drawLayer(ctx, "ground", this.camera);
        this.map.drawLayer(ctx, "overlay", this.camera);

        const worldEntities = [...this.npcs, ...this.enemies];
        worldEntities.sort((a,b) => (a.y + a.height) - (b.y + b.height));
        for (const entity of worldEntities) entity.draw(ctx, this.camera);

        this.map.drawLayer(ctx, "decor", this.camera);

        for (const item of this.items) item.draw(ctx, this.camera);
        this.player.draw(ctx, this.camera);
        Floaters.draw(ctx, this.camera);

        UI.drawDeltaTime(ctx, this.elapsedTime);
        UI.drawHealth(ctx, this.player);
        UI.drawStats(ctx, this.player);
        UI.drawQuests(ctx, this.questLog);
        if(this.state === STATE.PLAYING && this.nearbyNpc){
            UI.drawPrompt(ctx, `Press T to talk to ${this.nearbyNpc.name}`);
        }
        if(this.state === STATE.DIALOGUE) {
            UI.drawDialogue(ctx, this.dialogue);
        }
        if(this.state === STATE.INVENTORY) {
            UI.drawInventory(ctx,this.inventory);
        }
        if(this.state === STATE.GAMEOVER){
            UI.drawScreen(ctx, "Game Over", "Press ENTER or SPACE to try again", "#f08a8a");
        }
        if(this.state === STATE.WIN){
            UI.drawScreen(ctx, "You Win!", "Enter for title", "#9ad9b0");
        }
        if (this.state === STATE.PLAYING) {
        const ctx = this.ctx;
        ctx.fillStyle = "red";
        ctx.font = "16px Arial";
        ctx.textAlign = "right";
        const x = CONFIG.CANVAS_WIDTH - 20;
        ctx.fillText(`Wave: ${this.wave}`, x, 30);
        ctx.fillText(`Enemies: ${this.enemies.length}`, x, 50);
}
    }
}
window.addEventListener("load", ()=> {
    const canvas = document.getElementById("game");
    canvas.width = CONFIG.CANVAS_WIDTH;
    canvas.height = CONFIG.CANVAS_HEIGHT;
    const game = new Game(canvas);

    window.game = game;
    game.boot();
})