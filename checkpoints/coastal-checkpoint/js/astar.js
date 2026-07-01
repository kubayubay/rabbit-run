// =============================================================
//  astar.js - A* pathfinding on the tile grid.
// =============================================================
//  Enemies use this to walk AROUND walls instead of into them.
//  findPath(startCol, startRow, goalCol, goalRow) returns a list of
//  {c, r} grid cells from just after the start to the goal, or [] if
//  there's no route. See Appendix F for the full explanation of
//  g / h / f, the OPEN and CLOSED lists, and PARENT.
// =============================================================

import { CONFIG } from "./config.js";

export const AStar = {
  CELL: CONFIG.SCALED_TILE,   // one grid cell = one scaled tile
  map: null,                  // set once, so isWall can ask the tilemap
  cols: 0,
  rows: 0,

  init(map) {
    this.map = map;
    this.CELL = CONFIG.SCALED_TILE;
    this.cols = Math.ceil(map.pixelWidth / this.CELL);
    this.rows = Math.ceil(map.pixelHeight / this.CELL);
  },

  cellOf(px, py) { return { c: Math.floor(px / this.CELL), r: Math.floor(py / this.CELL) }; },

  // Snap a cell to the nearest non-wall cell (spiral out). Used so an enemy that
  // spawned touching a wall, or got nudged into one, still has a valid path start.
  nearestOpen(c, r, maxRadius = 4) {
    if (!this.isWall(c, r)) return { c, r };
    for (let rad = 1; rad <= maxRadius; rad++) {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.abs(dc) !== rad && Math.abs(dr) !== rad) continue; // ring only
          if (!this.isWall(c + dc, r + dr)) return { c: c + dc, r: r + dr };
        }
      }
    }
    return { c, r };
  },
  cellCenter(c, r) { return { x: c * this.CELL + this.CELL / 2, y: r * this.CELL + this.CELL / 2 }; },

  isWall(c, r) {
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return true; // off-grid = solid
    // ask the tilemap whether the CENTER of this cell is solid
    return this.map.isSolidAtPixel(c * this.CELL + this.CELL / 2, r * this.CELL + this.CELL / 2);
  },

  // Manhattan distance: steps left/right PLUS up/down. Our GUESS of steps remaining.
  heuristic(c, r, gc, gr) { return Math.abs(c - gc) + Math.abs(r - gr); },

  findPath(sc, sr, gc, gr) {
    const PARENT = new Map();
    const key = (c, r) => c + "," + r;
    const open = new Map();
    const closed = new Set();

    open.set(key(sc, sr), { c: sc, r: sr, g: 0, f: this.heuristic(sc, sr, gc, gr) });

    let guard = 0;                          // safety: never loop forever
    while (open.size > 0 && guard++ < 5000) {
      // pick the open cell with the smallest f
      let cur = null;
      for (const node of open.values()) if (!cur || node.f < cur.f) cur = node;

      if (cur.c === gc && cur.r === gr) {   // reached the goal
        const path = [];
        let k = key(cur.c, cur.r);
        while (k) {
          const [c, r] = k.split(",").map(Number);
          path.unshift({ c, r });
          k = PARENT.get(k);
        }
        path.shift();                       // we're already on the start cell
        return path;
      }

      open.delete(key(cur.c, cur.r));
      closed.add(key(cur.c, cur.r));

      for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nc = cur.c + dc, nr = cur.r + dr, nk = key(nc, nr);
        if (this.isWall(nc, nr) || closed.has(nk)) continue;
        const tg = cur.g + 1;
        const ex = open.get(nk);
        if (!ex || tg < ex.g) {
          PARENT.set(nk, key(cur.c, cur.r));
          open.set(nk, { c: nc, r: nr, g: tg, f: tg + this.heuristic(nc, nr, gc, gr) });
        }
      }
    }
    return [];   // no route - caller can fall back to a straight line
  },
};
