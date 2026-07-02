    // =============================================================
    //  enemy.js - Monsters with simple AI.
    // =============================================================
    //  Our enemies use a tiny "state machine". At any moment an enemy
    //  is in ONE of these states:
    //      IDLE - sitting still, waiting
    //      CHASE - player got close, walk toward them
    //      HURT - just got hit, flash briefly
    //      DEAD - defeated, play death animation then disappear
    //  A state machine keeps AI easy to read: each state has clear rules
    //  for what to do and when to switch to another state.
    // =============================================================

    // ============================================================================
    // STARTER STUB - you write this file during the code-along (Week 4, Day 1).
    // Follow the slides / Coding Companion for this week. If you fall behind,
    // the complete version is in the matching weekN-checkpoint/js/enemy.js.
    // ============================================================================

    // TODO: build this file here.
    import { CONFIG } from "./config.js";
    import { SpriteAnimator, DIR1 } from "./sprite.js";
    import { Sound } from "./audio.js";
    import { Floaters } from "./particles.js";

    const STATE = { IDLE : "idle", CHASE : "chase", HURT : "hurt", DEAD : "dead"}
    const TYPES = {
        slime : {
            idleSheet: "slime_idle", hurtSheet : "slime_hurt", deathSheet : "slime_death",
            idleFrames : 8, hurtFrames : 2, deathFrames : 4,
            hp : 15 + CONFIG.PLAYER_MAX_HP * 0.4, speed:30, damage:5, sightRange:120, attackRange:30, xp:7,
            scale: 1.5
        },
        bat : {
            idleSheet: "bat_idle", hurtSheet : "bat_hurt", deathSheet : "bat_death",
            idleFrames : 4, hurtFrames : 2, deathFrames : 5,
            hp : 6 + CONFIG.PLAYER_MAX_HP * 0.3, speed:90, damage:4, sightRange:160, attackRange:28, xp:5,
            scale: 1.2
        },
        rat : {
            idleSheet: "rat_idle", hurtSheet : "rat_hurt", deathSheet : "rat_death",
            idleFrames : 4, hurtFrames : 4, deathFrames : 8,
            hp : 3 + CONFIG.PLAYER_MAX_HP * 0.1, speed:110, damage:9, sightRange:120, attackRange:20, xp:3,
            scale: 0.3
        },
    };

    export class Enemy{
        constructor(data){
            this.type = data.type || "slime";
            const t = TYPES[this.type];
            this.def = t;
            this.scale = t.scale || 1.0;

            this.x = data.x;
            this.y = data.y;
            this.homeX = data.x
            this.homeY = data.y
            this.width = CONFIG.SCALED_TILE * this.scale;
            this.height = CONFIG.SCALED_TILE * this.scale;

            this.hp = t.hp;
            this.xpReward = t.xp || 3;
            this.state = STATE.IDLE;
            this.dir = 0;
            this.anim = new SpriteAnimator();
            this.hurtTimer = 0;
            this.deadTimer = 0;
            this.attackCooldown = 0;
            this.dead = false;
            this.drop = null;
            this.dropSpawned = false;
            this.dropRoll = null;
        }

        get centerX(){ return this.x + this.width/2;}
        get centerY(){ return this.y + this.height/2;}

        distanceTo(player){
        // console.log(this.centerX + " " + this.centerY);
            return Math.hypot(
            this.centerX - (player.x + player.width/2),
            this.centerY - (player.y + player.height/2));
        }

        update(dt, player, map, wave){
        
            if(this.attackCooldown>0) {
                this.attackCooldown -= dt;
            }
            
            switch (this.state){
                case STATE.DEAD: {
                    this.deadTimer -= dt;
                    this.anim.update(dt, this.def.deathFrames);
                    if(this.deadTimer <= 0){
                        this.dead = true;
                    }
                    break;
                }
                case STATE.HURT: {
                    this.hurtTimer -= dt;
                    this.anim.update(dt, this.def.hurtFrames);
                   if (this.hurtTimer <= 0) {
                    if (this.hp <= 0) {
                    this.startDeath();
                     } else {
                    this.state = STATE.CHASE;
                        }
                    }
                    break;
                }
                case STATE.IDLE: {
                    this.anim.update(dt, this.def.idleFrames);
                    if (this.distanceTo(player)/1000 < this.def.sightRange*10000) {
                        this.state = STATE.CHASE;
                    }
                    break;
                }
                case STATE.CHASE: {
                    //print(state);
                    this.anim.update(dt, this.def.idleFrames);
                    const dist = this.distanceTo(player);
                    //console.log(dist + " " + this.type)
                    if (dist > this.def.sightRange * 1000){
                        this.state = STATE.IDLE;
                        break;
                    }
                    const dx = (player.x+player.width/2) - this.centerX;
                    const dy = (player.y + player.height/2) - this.centerY;
                    if (Math.abs(dx) > Math.abs(dy)) {
                        this.dir = dx > 0 ? DIR1.RIGHT : DIR1.LEFT;
                    } else if (Math.abs(dy) > 0) {
                        this.dir = dy > 0 ? DIR1.DOWN : DIR1.UP;
                    }
                    const len = Math.hypot(dx, dy) || 1;
                    const stepX = (dx/len) * this.def.speed * dt;
                    const stepY = (dy/len) * this.def.speed * dt;
                    this.moveAxis(stepX, 0, map);
                    this.moveAxis(0, stepY, map);

                    if (dist < this.def.attackRange && this.attackCooldown <= 0){
                        const scaledDamage = this.def.damage + Math.floor(wave / 2);
                        player.takeDamage(scaledDamage * 100/(100 + player.armor));
                        this.attackCooldown = 1.0;
                    }
                    break;
                }
                
            }
        }

        moveAxis(mx, my, map){
            const nx = this.x + mx, ny = this.y + my;
            const centerX = nx + this.width/2;
            const centerY = ny + this.height/2;
            const inBounds = centerX >= 0 && centerY >= 0 && centerX < map.pixelWidth && centerY < map.pixelHeight;
            if (!inBounds) return;

            if (this.type === "bat" || !map.isSolidAtPixel(centerX, centerY)){
                this.x = nx;
                this.y = ny;
            }
        }
        takeDamage(amount){
            if(this.state === STATE.DEAD) return;
            this.hp -= amount;
            this.state = STATE.HURT;
            this.hurtTimer = 0.25;
            this.anim.reset();
            Sound.play(this.hp <= 0 ? "enemy_down" : "hit");
            Floaters.spawn(this.centerX, this.centerY, `-${amount}`, "#ff8a8a");
        }

        startDeath() {
            
            if (this.state === STATE.DEAD) return;
            const drops = [
        {
            id: "berry",
            name: "Berry",
            tile: "crops:88",
            heal: 5 + CONFIG.PLAYER_MAX_HP * 0.2,
            damage: 3,
        },
        {
            id: "carrot",
            name: "Carrot",
            tile: "crops:85",
            moveSpeed: 5,
            attackSpeed: 0.1,
        },
        {
            id: "cabbage",
            name: "Cabbage",
            tile: "crops:86",
            maxHealth: 5,
            heal: 3,
        },
        {
            id: "pumpkin",
            name: "Pumpkin",
            tile: "crops:87",
            armor: 10,
            attackRange: 5,
        }
    ];


    const roll = Math.random();

    if (roll < 0.1) {
        this.drop = { ...drops[0] };
    } else if (roll < 0.2) {
        this.drop = { ...drops[1] };
    } else if (roll < 0.3) {
        this.drop = { ...drops[2] };
    } else if (roll < 0.4) {
        this.drop = { ...drops[3] };
    }

    if (this.drop) {
            console.log("Dropped:", this.drop.name);
        this.drop.x = this.centerX - CONFIG.SCALED_TILE / 2;
        this.drop.y = this.centerY - CONFIG.SCALED_TILE / 2;
    }

    this.dropSpawned = false;
    this.state = STATE.DEAD;
    this.deadTimer = this.def.deathFrames / CONFIG.ANIM_FPS;
    this.anim.reset();

    Floaters.spawn(
        this.centerX,
        this.centerY,
        `+${this.xpReward} XP`,
        "#ffd98a"
    );
}

        draw(ctx, camera){
            const spriteSize = CONFIG.PLAYER_FRAME_SIZE * CONFIG.SCALE * this.scale;

            const offset = (spriteSize - this.width) / 2;
            const sx = this.x - offset - camera.x;
            const sy = this.y - (spriteSize - this.height) + 6 - camera.y;
            let sheet = this.def.idleSheet, frames = this.def.idleFrames, row = this.dir;
            if(this.state === STATE.HURT) { 
                sheet = this.def.hurtSheet;
                frames = this.def.hurtFrames;
            }
            if(this.state === STATE.DEAD) { 
                sheet = this.def.deathSheet;
                frames = this.def.deathFrames;
                row = 0;
            }

            if (this.type === "rat" && row === DIR1.RIGHT) {
                this.anim.drawR(ctx, sheet, row - 3, sx, sy, this.scale);
            } else {
                this.anim.draw(ctx, sheet, row, sx, sy, this.scale);
            }
            if (this.state !== STATE.DEAD){
                const barW = this.width, barX = this.x - camera.x, barY = this.y - camera.y - 8;
                ctx.fillStyle = "#3a2e3f"; ctx.fillRect(barX, barY, barW, 4);
                ctx.fillStyle = "#e85d75"; ctx.fillRect(barX, barY, barW * (this.hp/this.def.hp), 4);
            }
            
        }
        get body(){
        return { x: this.x, y: this.y, w: this.width, h: this.height };
    }
        
    }