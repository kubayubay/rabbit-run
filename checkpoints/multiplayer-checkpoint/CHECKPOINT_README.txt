MAKE IT SUPER - CODE CHECKPOINT (full effects)
==============================================
This is the Rabbit Run game with the COMPLETE "Make It Super" enrichment effects
wired in, so students can SEE every effect working and compare against their own
attempts. The code here matches the "Make It Super" slides, the Game Feel coding
companion, and Appendix E exactly (same values, same logic).

HOW TO RUN
----------
Serve over http (browsers block module loading from file://):
    python3 -m http.server 8000
Then open  http://localhost:8000/index.html

CONTROLS
--------
Arrows / WASD = move    Space = attack    Shift = DASH
T = talk   I = inventory   Q = quest log
R = toggle rain     P = play a screen-wipe transition
(Gamepad: left stick = move, A = attack, if a controller is plugged in.)

WHAT'S IMPLEMENTED (and where) - matches the companion section numbers
----------------------------------------------------------------------
Group from companion Volume 1:
 1. Particle effects     -> js/effects.js (Particles)   fired on hit/kill/pickup
 2. Screen shake         -> js/camera.js  (shake)        hit 0.1/4, kill 0.16/6
 3. Hit flash            -> js/enemy.js   (draw)         white "lighter" on HURT
 4. Easing / smooth bar  -> js/player.js + js/ui.js      displayedHp glides to hp
 5. Floating numbers     -> js/effects.js (Floaters)     "-5" on hit, "+XP" on kill

Companion Volume 2:
 12. Afterimage trail    -> js/player.js  (draw + trail) shown while dashing
 13. Squash & stretch    -> js/enemy.js   (draw)         on a fresh hit
 15. Low-HP vignette     -> js/game.js    (draw)         pulsing red under 30% HP
 16. Dash / dodge        -> js/player.js  (update)       Shift: 0.18s x3 + i-frames
 17. Knockback           -> js/enemy.js + js/battle.js   220 px/s shove + friction
 18. Combo counter       -> js/effects.js (Combo)        "xN!" within 1.5s window
 19. Timed power-ups     -> js/player.js  (speedBoost)   5s speed boost on pickup
 20. Coin magnet         -> js/item.js    (update)       items glide in within 120px
 21. Score + high score  -> js/effects.js (Score)        +10 kill/+5 pickup, saved
 22. Enemy waves         -> js/game.js    (spawn...)     escalating waves on clear
 23. Screen-wipe         -> js/game.js    (wipe)         press P
 24. Minimap             -> js/game.js    (drawMinimap)  player + enemy dots
 25. Weather (rain)      -> js/effects.js (Weather)      toggle with R
 26. Gamepad support     -> js/game.js    (readGamepad)  left stick + A button

NOT in this checkpoint (and why):
 7. Co-op (one keyboard) and 8. Split screen are STRUCTURAL - they need a second
    Player and a refactor of input/drawing, which would change the single-player
    game substantially. The companion + slides teach them as build-it-yourself
    projects. 9. GitHub Pages publishing and 10. Network co-op are external/non-code.

CONSISTENCY
-----------
The code in this checkpoint is the same code shown on the slides and in the coding
companion (identical numbers and logic). If a student's version doesn't match, this
folder is the answer key.
