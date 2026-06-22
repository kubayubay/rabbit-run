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

import { CONFIG } from "./config.js";
import { drawTile } from "./tilesets.js";

export class TileMap {
  constructor(data) {
    this.data = data;
    this.width = data.width;
    this.height = data.height;
    this.pixelWidth = this.width * CONFIG.SCALED_TILE;
    this.pixelHeight = this.height * CONFIG.SCALED_TILE;
  }

  // Convert a (column, row) into the index of a flat array.
  index(col, row) { return row * this.width + col; }

  // Is the tile at this column/row solid (blocks movement)?
  isSolid(col, row) {
    // Outside the map counts as solid so the player can't walk off the edge.
    if (col < 0 || row < 0 || col >= this.width || row >= this.height) return true;
    return this.data.solid[this.index(col, row)] === 1;
  }

  // Take a pixel position and tell us if it's standing on a solid tile.
  // A solid tile blocks across its whole area - simple and predictable, so the
  // collision always matches the tile grid you see with the debug overlay (key 5).
  isSolidAtPixel(px, py) {
    const col = Math.floor(px / CONFIG.SCALED_TILE);
    const row = Math.floor(py / CONFIG.SCALED_TILE);
    return this.isSolid(col, row);
  }

  // Draw one layer ("ground" or "decor"), but only the tiles the camera sees.
  drawLayer(ctx, layerName, camera) {
    const layer = this.data[layerName];
    if (!layer) return;

    // Only loop over the tiles visible on screen (this keeps big maps fast).
    const startCol = Math.max(0, Math.floor(camera.x / CONFIG.SCALED_TILE));
    const startRow = Math.max(0, Math.floor(camera.y / CONFIG.SCALED_TILE));
    const endCol = Math.min(this.width,  startCol + CONFIG.VIEW_TILES_X + 2);
    const endRow = Math.min(this.height, startRow + CONFIG.VIEW_TILES_Y + 2);

    for (let row = startRow; row < endRow; row++) {
      for (let col = startCol; col < endCol; col++) {
        const tileId = layer[this.index(col, row)];
        if (!tileId) continue;
        // Position on screen = world position minus where the camera is.
        // Round to whole pixels so tiles never land on a fraction (which would
        // leave faint seams between them).
        const screenX = Math.round(col * CONFIG.SCALED_TILE - camera.x);
        const screenY = Math.round(row * CONFIG.SCALED_TILE - camera.y);
        drawTile(ctx, tileId, screenX, screenY);
      }
    }
  }
}
