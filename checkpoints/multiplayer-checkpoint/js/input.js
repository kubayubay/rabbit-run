// =============================================================
//  input.js - Knows which keys the player is pressing.
// =============================================================
//  There are two kinds of key questions in a game:
//   1. "Is this key being HELD right now?"  (e.g. walking)
//   2. "Was this key JUST pressed this frame?" (e.g. open a menu)
//  We track both.
// =============================================================

// Keys currently held down (true while the key is down).
const held = {};
// Keys pressed during THIS frame only (cleared at end of each update).
const pressed = {};

// We listen for browser keyboard events and record them.
window.addEventListener("keydown", (e) => {
  // If the key wasn't already down, it counts as "just pressed".
  if (!held[e.code]) pressed[e.code] = true;
  held[e.code] = true;

  // Stop arrow keys / space from scrolling the web page.
  if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code)) {
    e.preventDefault();
  }
});

window.addEventListener("keyup", (e) => {
  held[e.code] = false;
});

export const Input = {
  // Is a key being held? Pass a key code like "ArrowLeft" or "Space".
  isDown(code) { return held[code] === true; },

  // Was a key pressed this exact frame? (Good for menus & confirm buttons.)
  wasPressed(code) { return pressed[code] === true; },

  // Convenience helpers so game code reads nicely.
  get up()      { return held["ArrowUp"]    || held["KeyW"]; },
  get down()    { return held["ArrowDown"]  || held["KeyS"]; },
  get left()    { return held["ArrowLeft"]  || held["KeyA"]; },
  get right()   { return held["ArrowRight"] || held["KeyD"]; },

  // IMPORTANT: call this at the END of every frame to reset "just pressed".
  clearFrame() {
    for (const key in pressed) delete pressed[key];
  },
};
