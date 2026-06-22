// =============================================================
//  item.js - Things you can pick up, and your inventory.
// =============================================================
//  An Item sits on the map (drawn from the chest/crops art). Walk
//  over it to pick it up; it goes into your Inventory. Some items
//  count toward quest objectives ("collect 3 carrots").
// =============================================================

import { CONFIG } from "./config.js";
import { drawTile } from "./tilesets.js";
import { Sound } from "./audio.js";

export class Item {
  constructor(data) {
    this.x = data.x;
    this.y = data.y;
    this.width = CONFIG.SCALED_TILE;
    this.height = CONFIG.SCALED_TILE;
    this.id = data.id || "carrot";        // unique-ish name used by quests
    this.name = data.name || "Carrot";
    this.tile = data.tile || "crops:24";  // which tile picture represents it
    // HP restored when picked up. An item can give an explicit amount, or set
    // heal:true to use the default from config. 0/absent = not a healing item.
    this.heal = data.heal === true ? CONFIG.HEAL_ITEM_AMOUNT : (data.heal || 0);
    this.bob = Math.random() * Math.PI * 2; // start the float at a random spot
    this.collected = false;
  }

  update(dt, player) {
    this.bob += dt * 3;
  }

  overlaps(player) {
    return this.x < player.x + player.width &&
           this.x + this.width > player.x &&
           this.y < player.y + player.height &&
           this.y + this.height > player.y;
  }

  draw(ctx, camera) {
    const floatY = Math.sin(this.bob) * 4; // gentle up/down float
    // Round to whole pixels: sub-pixel drawImage sampling can pull a thin sliver
    // from the neighbouring tile in the sheet, which shows up as a flickering
    // dark line along the top/bottom of the sprite as it bobs.
    const dx = Math.round(this.x - camera.x);
    const dy = Math.round(this.y - camera.y + floatY);
    drawTile(ctx, this.tile, dx, dy);
  }
}

// A very small inventory: counts how many of each item you hold.
export class Inventory {
  constructor() { this.items = {}; } // e.g. { carrot: 2, key: 1 }

  add(id, name) {
    if (!this.items[id]) this.items[id] = { name, count: 0 };
    this.items[id].count += 1;
    Sound.play("pickup");
  }

  count(id) { return this.items[id] ? this.items[id].count : 0; }

  // A list we can loop over to draw the inventory screen.
  list() { return Object.entries(this.items).map(([id, v]) => ({ id, ...v })); }
}
