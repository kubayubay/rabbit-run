// =============================================================
//  assets.js - Loads all images and sounds BEFORE the game starts.
// =============================================================
//  Images and audio load from disk over time. If we tried to draw
//  a sprite before it finished loading, we'd get a blank screen.
//  So we load everything first, then start the game. This is called
//  "preloading".
// =============================================================

// Every image we need, given a short nickname we can use in code.
const IMAGE_FILES = {
  // Tilesets (the big sheets we slice tiles out of)
  coast:      "assets/tilesets/coast.png",
  cleanup:    "assets/tilesets/cleanup_items.png",
  grass_dirt: "assets/tilesets/grass_dirt.png",
  nature:     "assets/tilesets/nature.png",
  exterior:   "assets/tilesets/exterior.png",
  house:      "assets/tilesets/house.png",
  crops:      "assets/tilesets/crops.png",
  floor:      "assets/tilesets/floor_detail.png",
  chest:      "assets/tilesets/chest.png",
  campfire:   "assets/tilesets/campfire.png",

  // Character + enemy sprite sheets
  bunny_idle:  "assets/sprites/ranger_idle.png",
  bunny_run:   "assets/sprites/ranger_run.png",
  bunny_sword: "assets/sprites/ranger_tool.png",
  bunny_death: "assets/sprites/ranger_rest.png",
  slime_idle:  "assets/sprites/slime_idle.png",
  slime_hurt:  "assets/sprites/slime_hurt.png",
  slime_death: "assets/sprites/slime_death.png",
  bat_idle:    "assets/sprites/bat_idle.png",
  bat_hurt:    "assets/sprites/bat_hurt.png",
  bat_death:   "assets/sprites/bat_death.png",
  chicken:     "assets/sprites/volunteer_idle.png",
  cow:         "assets/sprites/coordinator_idle.png",
  visitor:     "assets/sprites/visitor_idle.png",
  turtle:      "assets/sprites/turtle_rescue.png",
  otter:       "assets/sprites/otter_rescue.png",
  seal:        "assets/sprites/seal_rescue.png",
  seabird:     "assets/sprites/seabird_rescue.png",
  shadow:      "assets/sprites/shadow.png",
};

// Every sound effect / music track.
const AUDIO_FILES = {
  blip:        "assets/audio/blip.mp3",
  select:      "assets/audio/select.mp3",
  pickup:      "assets/audio/pickup.mp3",
  attack:      "assets/audio/attack.mp3",
  hit:         "assets/audio/hit.mp3",
  enemy_down:  "assets/audio/enemy_down.mp3",
  quest:       "assets/audio/quest.mp3",
  text:        "assets/audio/text.mp3",
  door:        "assets/audio/door.mp3",
  gameover:    "assets/audio/gameover.mp3",
  town_theme:  "assets/audio/town_theme.ogg",
  battle_theme:"assets/audio/battle_theme.mp3",
};

// These objects get filled in once loading finishes.
export const Images = {};
export const Audio = {};

// Load a single image and resolve a Promise when it's ready.
function loadImage(name, src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { Images[name] = img; resolve(); };
    img.onerror = () => reject(new Error("Could not load image: " + src));
    img.src = src;
  });
}

// Load a single audio file.
function loadAudio(name, src) {
  return new Promise((resolve) => {
    const audio = new window.Audio();
    // 'canplaythrough' means enough has loaded to play without stopping.
    audio.addEventListener("canplaythrough", () => { Audio[name] = audio; resolve(); }, { once: true });
    audio.addEventListener("error", () => { console.warn("Audio missing:", src); resolve(); });
    audio.src = src;
    audio.load();
  });
}

// Load EVERYTHING, then resolve. Used like: await loadAllAssets();
export async function loadAllAssets() {
  const jobs = [];
  for (const [name, src] of Object.entries(IMAGE_FILES)) jobs.push(loadImage(name, src));
  for (const [name, src] of Object.entries(AUDIO_FILES)) jobs.push(loadAudio(name, src));
  await Promise.all(jobs);
}
