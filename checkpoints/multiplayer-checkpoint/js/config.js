// =============================================================
//  config.js - All the "magic numbers" for Rabbit Run: Tales of the Warren RPG live here.
// =============================================================
//  Keeping settings in ONE place means you never have to hunt
//  through the whole project to change how fast the player walks
//  or how big a tile is. Change a value here, save, refresh.
// =============================================================

export const CONFIG = {
  // ---- Display ----
  TILE_SIZE: 16,        // Each tile in our maps is 16x16 pixels (matches the art).
  SCALE: 3,             // We zoom everything 3x so the pixel art looks chunky & cute.
  VIEW_TILES_X: 16,     // How many tiles fit across the screen.
  VIEW_TILES_Y: 12,     // How many tiles fit down the screen.

  // ---- Player ----
  PLAYER_SPEED: 225,    // Pixels per SECOND (not per frame!). This is what makes
                        // movement smooth no matter the frame rate.
  PLAYER_FRAME_SIZE: 48,// The bunny sprite frames are 48x48 pixels each.
  PLAYER_MAX_HP: 20,

  // ---- Timed power-ups ----
  SPEED_BOOST_DURATION: 5,   // seconds a speed boost lasts when you grab an item
  SPEED_BOOST_MULTIPLIER: 1.6, // how much faster you move while the boost is active

  // ---- Combat ----
  PLAYER_ATTACK_DAMAGE: 5,
  PLAYER_ATTACK_RANGE: 24,   // How close (pixels) an enemy must be to get hit.
  // The drawn sword TIP reaches ~16 sprite-px past the body center = ~48 world-px
  // beyond the body edge (the sprite art extends to the frame edge at peak swing).
  // The attack uses a reach BOX from the body edge out to the tip, this far:
  PLAYER_SWORD_REACH: 48,    // world-px the sword extends past the body edge (= ~tip)
  PLAYER_SWORD_HALF_W: 22,   // half-thickness of the sword's hit box (perpendicular)

  // ---- Leveling & XP ----
  // After reaching level L, the XP needed for the NEXT level is
  // round(XP_BASE * L ^ XP_GROWTH), so each level costs a bit more. Tweak these
  // two numbers to make leveling faster (lower) or slower (higher).
  XP_BASE: 12,          // XP needed to reach level 2
  XP_GROWTH: 1.5,       // how much steeper each level gets
  HP_PER_LEVEL: 6,      // max HP gained per level (also fully heals on level up)
  DAMAGE_PER_LEVEL: 2,  // attack damage gained per level

  // ---- Healing ----
  // Default HP restored by a healing item. Individual items in the map can set
  // their own "heal" value to override this (our berries use 8).
  HEAL_ITEM_AMOUNT: 8,  // HP restored by a healing item (e.g. a berry)

  // ---- Collision ----
  // ---- Animation ----
  ANIM_FPS: 8,          // Sprite animations play 8 frames per second.

  // ---- Audio ----
  MUSIC_VOLUME: 0.4,
  SFX_VOLUME: 0.6,

  // ---- Coins / economy ----
  COINS_PER_KILL: 3,        // gold dropped when an enemy is defeated (base)

  // ---- Save / load ----
  SAVE_KEY: "rabbitrun_save",   // localStorage key for the save file
};

// Computed values (don't edit these directly - they come from the ones above).
CONFIG.SCALED_TILE = CONFIG.TILE_SIZE * CONFIG.SCALE; // 48px on screen
CONFIG.CANVAS_WIDTH = CONFIG.VIEW_TILES_X * CONFIG.SCALED_TILE;
CONFIG.CANVAS_HEIGHT = CONFIG.VIEW_TILES_Y * CONFIG.SCALED_TILE;
