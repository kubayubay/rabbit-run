// =============================================================
//  player.js - The bunny you control.
// =============================================================
//  The player can:
// - walk in 4 directions (with smooth, framerate-independent speed)
// - animate (idle vs running) and face the right way
// - bump into solid tiles (collision)
// - swing a sword to attack
// - take damage and have hit-points (HP)
// =============================================================

// ============================================================================
// STARTER STUB - you write this file during the code-along (Week 2, Day 1 (grows in Week 4)).
// Follow the slides / Coding Companion for this week. If you fall behind,
// the complete version is in the matching weekN-checkpoint/js/player.js.
// ============================================================================

// TODO: build this file here.
import { CONFIG } from "./config.js";
import { Input } from "./input.js";
import { Images } from "./assets.js";
import { SpriteAnimator, DIR, DIR1 } from "./sprite.js";
import { Sound } from "./audio.js";

const FRAMES = {idle: 4, run: 6, sword: 4};
const BASE_SIZE  = 16;
export class Player{
    constructor(x, y){  
        this.attackSpeed = 1;
        this.attackCd = 0;
        this.x = x; 
        this.y = y;
        this.scale = CONFIG.SCALE;

        this.spriteSize = 48 * this.scale;

        this.width = 24 * this.scale;
        this.height = 24 * this.scale;

        this.spriteOffsetX = (this.spriteSize - this.width) / 2;
        this.spriteOffsetY = (this.spriteSize - this.height) / 2;
        this.dir = DIR1.DOWN;
        this.moving = false;
        this.anim = new SpriteAnimator();

        this.hp = CONFIG.PLAYER_MAX_HP;
        this.maxHp = CONFIG.PLAYER_MAX_HP;
        this.armor = CONFIG.PLAYER_ARMOR;
        this.level = 1;
        this.xp = 0;
        this.xpToNext = CONFIG.XP_BASE;
        this.attackDamage = CONFIG.PLAYER_ATTACK_DAMAGE;
        this.attackRange = CONFIG.PLAYER_ATTACK_RANGE;
        this.moveSpeed = CONFIG.PLAYER_SPEED;
        this.justLeveledTimer = 0;

        this.attacking = false;
        this.attackTimer = 0;
        this.attackHasHit = false;
        this.invincibleTimer = 0;
    }

    gainXP(amount){
        this.xp += amount;
        while(this.xp >= this.xpToNext){
            this.xp -= this.xpToNext;
            this.levelUp();
        }
    }

    levelUp(){
        this.level += 1;
        this.maxHp += CONFIG.HP_PER_LEVEL;
        this.attackDamage += CONFIG.DAMAGE_PER_LEVEL;
        this.justLeveledTimer = 1.6;
        this.armor += CONFIG.ARMOR_PER_LEVEL;
        this.hp += CONFIG.HP_PER_LEVEL * 0.5;
        if(this.hp > this.maxHp) this.hp = this.maxHp;
        this.xpToNext = Math.round(CONFIG.XP_BASE * Math.pow(this.level, CONFIG.XP_GROWTH));
        Sound.play("quest");
    }

    heal(amount){
        this.hp = Math.min(this.maxHp, this.hp + amount);
        Sound.play("pickup");
    }

    addMoveSpeed(amount){
        this.moveSpeed += amount;
    }

    increaseMaxHealth(amount){
        this.maxHp += amount;
    }

    addArmor(amount){
        this.armor += amount;
    }

    addAttackSpeed(amount){
        this.attackSpeed += amount;
    }

    addAttackDamage(amount){
        this.attackDamage += amount;
    }

    addAttackRange(amount){
        this.attackRange += amount;
    }

    get body(){
        return{ x: this.x, y: this.y, w:this.width, h: this.height};
    }

    update(dt, map){
        const wasAttacking = this.attacking;

        if (this.attackCd > 0) {
            this.attackCd -= dt;
        }
        if(this.invincibleTimer > 0) this.invincibleTimer -= dt;
        if(this.justLeveledTimer > 0) this.justLeveledTimer -= dt;
        
        if (this.attacking) {
            this.attackTimer -= dt;
            this.anim.update(dt, FRAMES.sword, CONFIG.ATTACK_ANIM_FPS);

            if (this.attackTimer <= 0) {
                this.attacking = false;
                this.anim.reset();
            }
        }

        if (!wasAttacking && !this.attacking && this.attackCd <= 0) {
            this.startAttack();
        }

        let dx = 0, dy = 0;
        if(Input.left){ dx -= 1; this.dir = DIR1.LEFT;}
        if(Input.right){ dx += 1; this.dir = DIR1.RIGHT;}
        if(Input.up){ dy -= 1; this.dir = DIR1.UP;}
        if(Input.down){ dy += 1; this.dir = DIR1.DOWN;}
        
        this.moving = (dx !== 0 || dy !== 0);
        if(this.moving){
            const len = Math.hypot(dx, dy);
            dx /= len;
            dy /= len;
            const stepX = dx * this.moveSpeed * dt;
            const stepY = dy * this.moveSpeed * dt;
            this.moveAxis(stepX, 0, map);
            this.moveAxis(0, stepY, map);
            if (!this.attacking) this.anim.update(dt, FRAMES.run);
        } else if (!this.attacking) {
            this.anim.update(dt, FRAMES.idle);
        }
    }
    moveAxis(mx, my, map){
        const nextX = this.x + mx;
        const nextY = this.y + my;
        const corners = [[nextX, nextY], [nextX + this.width - 1, nextY], [nextX, nextY + this.height - 1], [nextX + this.width - 1, nextY + this.height - 1]];
        for(const[cx, cy] of corners){
            if(map.isSolidAtPixel(cx, cy)){
                return;
            }
        }
        this.x = nextX;
        this.y = nextY;
    }

    startAttack(){
        if(this.attacking) return;

        this.attacking = true;
        this.attackTimer = FRAMES.sword / CONFIG.ATTACK_ANIM_FPS;
        this.attackCd = 2 / this.attackSpeed;
        this.attackHasHit = false;
        this.anim.reset();
        Sound.play("attack");
    }

    getAttackPoint(){
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;
    const r = this.attackRange;

    if(this.dir === DIR1.LEFT){
        return { x: cx - r, y: cy - 10, w: r, h: 20 };
    }
    if(this.dir === DIR1.RIGHT){
        return { x: cx, y: cy - 10, w: r, h: 20 };
    }
    if(this.dir === DIR1.UP){
        return { x: cx - 10, y: cy - r, w: 20, h: r };
    }

    return { x: cx - 10, y: cy, w: 20, h: r };
}

    get isDead(){ return this.hp <= 0; }

    draw(ctx, camera){
        if(this.invincibleTimer > 0 && Math.floor(this.invincibleTimer * 12) % 2 === 0){
            return;
        }

        const screenX = this.x - camera.x - this.spriteOffsetX;
        const screenY = this.y - camera.y - this.spriteOffsetY;
        const sheet = this.attacking ? "bunny_sword" : (this.moving ? "bunny_run" : "bunny_idle");
        this.anim.draw(ctx, sheet, this.dir, screenX, screenY);
        if(this.dir === 3){this.anim.drawR(ctx, sheet, this.dir-3, screenX, screenY);}
    }
    takeDamage(amount){
    if(this.invincibleTimer > 0) return;
    
    this.hp = Math.max(0, this.hp - amount);
    this.invincibleTimer = 0.8;
    Sound.play("hit");
}
    
}
