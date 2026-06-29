// =============================================================
//  audio.js - Plays sound effects and background music.
// =============================================================
//  Browsers won't play sound until the user clicks/presses a key
//  (an "anti-annoyance" rule). So our title screen waits for a key
//  press before starting music - that counts as permission.
// =============================================================

import { Audio } from "./assets.js";
import { CONFIG } from "./config.js";

let currentMusic = null; // which music track is playing right now

export const Sound = {
  // Play a one-shot sound effect (attack, pickup, etc.).
  play(name) {
    const a = Audio[name];
    if (!a) return;
    // cloneNode lets the same sound overlap with itself (e.g. rapid hits).
    const clip = a.cloneNode();
    clip.volume = 0.6;
    clip.play().catch(() => {}); // ignore "user hasn't interacted yet" errors
  },

  // Start looping a background music track. Stops the previous one first.
  playMusic(name) {
    if (currentMusic === Audio[name]) return; // already playing this track
    this.stopMusic();
    const m = Audio[name];
    if (!m) return;
    m.loop = true;
    m.volume = CONFIG.MUSIC_VOLUME;
    m.currentTime = 0;
    m.play().catch(() => {});
    currentMusic = m;
  },

  stopMusic() {
    if (currentMusic) {
      currentMusic.pause();
      currentMusic = null;
    }
  },
};