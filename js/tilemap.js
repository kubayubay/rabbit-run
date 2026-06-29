// =============================================================
//  tilemap.js - Loads, draws, and answers questions about a map.
// =============================================================
//  A map is just data (a plain object) made in our Map Editor.
//  It has:
// - width / height in tiles
// - "ground" layer  : the floor (grass, paths, water)
// - "decor"  layer  : things drawn on top (trees, houses)
// - "solid"  array  : which tiles you CANNOT walk through
// - "entities" list : NPCs, enemies, items, doors, etc.
// =============================================================

// ============================================================================
// STARTER STUB - you write this file during the code-along (Week 1, Day 3).
// Follow the slides / Coding Companion for this week. If you fall behind,
// the complete version is in the matching weekN-checkpoint/js/tilemap.js.
// ============================================================================

// TODO: build this file here.
import { CONFIG } from "./config.js";
import { drawTile } from "./tilesets.js"

export class TileMap {
    constructor(data) {
        this.data = data
        this.width = data.width
        this.height = data.height
        this.pixelWidth = this.width * CONFIG.SCALED_TILE;
        this.pixelHeight = this.height * CONFIG.SCALED_TILE;
    }
    //remember syntax. input / output function, one line
    index(col, row) {
        return row * this.width + col;}
    isSolid(col,row){
        if(col<0 || row < 0 || col >= this.width || row>= this.height) 
            return true;
            return this.data.solid[this.index(col, row)] === 1;
    }
    
    isSolidAtPixel(px, py){
        const col = Math.floor(px / CONFIG.SCALED_TILE);
        const row = Math.floor(py / CONFIG.SCALED_TILE);
        return this.isSolid(col, row);
    }
    drawLayer(ctx, layerName, camera) {
        const layer = this.data[layerName];
        if (!layer) return;
        const startCol = Math.max(0, Math.floor(camera.x / CONFIG.SCALED_TILE));
        const startRow = Math.max(0, Math.floor(camera.y / CONFIG.SCALED_TILE));
        const endCol = Math.min(this.width, startCol + CONFIG.VIEW_TILES_X + 2);
        const endRow = Math.min(this.height, startRow + CONFIG.VIEW_TILES_Y + 2);

        for(let row = startRow; row<endRow; row++){
            for(let col = startCol; col<endCol; col++){
                const tileId = layer[this.index(col, row)];
                if(!tileId) continue;
                
                const screenX = Math.round(col * CONFIG.SCALED_TILE - camera.x);
                const screenY = Math.round(row * CONFIG.SCALED_TILE - camera.y)
                drawTile(ctx,tileId,screenX,screenY)
            }
        }
    }

}