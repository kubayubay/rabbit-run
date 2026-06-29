// =============================================================
//  input.js - Knows which keys the player is pressing.
// =============================================================
//  There are two kinds of key questions in a game:
//   1. "Is this key being HELD right now?"  (e.g. walking)
//   2. "Was this key JUST pressed this frame?" (e.g. open a menu)
//  We track both.
// =============================================================

// ============================================================================
// STARTER STUB - you write this file during the code-along (Week 1, Day 1).
// Follow the slides / Coding Companion for this week. If you fall behind,
// the complete version is in the matching weekN-checkpoint/js/input.js.
// ============================================================================

// TODO: build this file here.

const held = {}; //save keys which are held down
const pressed = {}; //save keys pressed down once

window.addEventListener("keydown", (e) => {

    if(!held[e.code])
        pressed[e.code] = true;
        held[e.code] = true;

    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
        e.preventDefault();
    }
    });
    window.addEventListener("keyup", (e) => {
        held[e.code] = false;
    });

export const Input = {
    isDown(code) { 
        return held[code] === true;}, //checks for key being held down and returns it

    wasPressed(code) { 
        return pressed[code] === true}, // checks for key pressed, returns

    get up() {return held["ArrowUp"] || held["KeyW"];},
    get down() {return held["ArrowDown"] || held["KeyS"];},
    get left() {return held["ArrowLeft"] || held["KeyA"];},
    get right() {return held["ArrowRight"] || held["KeyD"];},

    clearFrame() {
        for (const key in pressed) 
            delete pressed[key];
    },
};