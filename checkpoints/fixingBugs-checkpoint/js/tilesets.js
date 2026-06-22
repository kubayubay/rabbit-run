// =============================================================
//  tilesets.js - Describes each tileset sheet.
// =============================================================
//  A "tileset" is one big PNG made of many 16x16 tiles in a grid.
//  To draw tile #5 we need to know how many columns the sheet has,
//  so we can figure out which row & column tile #5 sits in.
//
//  In our maps, every tile is written as "sheetName:index", e.g.
//  "grass_dirt:0" or "nature:13". This file knows the column count
//  for each sheet so the renderer can find the right pixels.
// =============================================================

import { Images } from "./assets.js";
import { CONFIG } from "./config.js";

// columns = sheet width in pixels / 16.
export const TILESETS = {
  grass_dirt: { image: "grass_dirt", cols: 21 },
  nature:     { image: "nature",     cols: 21 },
  exterior:   { image: "exterior",   cols: 25 },
  house:      { image: "house",      cols: 38 },
  crops:      { image: "crops",      cols: 6  },
  floor:      { image: "floor",      cols: 11 },
};

// Given "sheet:index", draw that single tile at screen (x, y).
export function drawTile(ctx, tileId, x, y) {
  if (!tileId) return; // empty cell, draw nothing
  const [sheet, indexStr] = tileId.split(":");
  const set = TILESETS[sheet];
  if (!set) return;
  const img = Images[set.image];
  if (!img) return;

  const index = parseInt(indexStr, 10);
  const sx = (index % set.cols) * CONFIG.TILE_SIZE; // source x in the sheet
  const sy = Math.floor(index / set.cols) * CONFIG.TILE_SIZE; // source y

  ctx.drawImage(
    img,
    sx, sy, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE,  // slice from sheet
    x, y, CONFIG.SCALED_TILE, CONFIG.SCALED_TILE // draw scaled-up on screen
  );
}
