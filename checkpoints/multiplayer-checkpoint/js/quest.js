// =============================================================
//  quest.js - Quests and their objectives.
// =============================================================
//  A QUEST is a goal with one or more OBJECTIVES (small steps).
//  Examples of objective types we support:
//      "collect" - gather N of an item   (e.g. collect 3 carrots)
//      "defeat" - beat N enemies of a type (e.g. defeat 2 slimes)
//      "talk" - talk to a specific NPC
//      "reach" - step on a special tile / location
//  The QuestLog holds all active/finished quests and checks progress.
// =============================================================

import { Sound } from "./audio.js";

export class Quest {
  constructor(def) {
    this.id = def.id;
    this.title = def.title;
    this.description = def.description || "";
    // Copy objectives and give each a 'current' counter starting at 0.
    this.objectives = def.objectives.map(o => ({
      type: o.type,
      target: o.target,        // item id, enemy type, npc name, etc.
      needed: o.needed || 1,   // how many to finish this objective
      current: 0,
      text: o.text || "",      // what shows on the HUD
    }));
    this.started = false;
    this.completed = false;
  }

  start() { this.started = true; }

  // When a quest starts, the player may ALREADY have done some of what it asks:
  // grabbed the carrots, beaten the slimes, or stepped on the spot - all BEFORE
  // talking to the quest-giver. Back-fill each objective from the world's history
  // so the quest reflects what they've already done, instead of unfairly asking
  // them to do it a second time.
  //   history = { inventory, defeats, visited, talked } (any may be missing)
  creditFromHistory(history) {
    if (!history) return;
    const inv = history.inventory;
    const defeats = history.defeats || {};   // { enemyType: countKilled }
    const visited = history.visited || {};   // { locationId: true }
    const talked  = history.talked  || {};   // { npcName: true }
    for (const o of this.objectives) {
      let have = 0;
      if (o.type === "collect" && inv) have = inv.count(o.target);
      else if (o.type === "defeat")     have = defeats[o.target] || 0;
      else if (o.type === "reach")      have = visited[o.target] ? o.needed : 0;
      else if (o.type === "talk")       have = talked[o.target]  ? o.needed : 0;
      else continue;
      o.current = Math.min(o.needed, have);   // never overshoot the goal
    }
    this.checkComplete();   // they might already be done!
  }

  // True only when every objective is finished.
  checkComplete() {
    const done = this.objectives.every(o => o.current >= o.needed);
    if (done && !this.completed) {
      this.completed = true;
      Sound.play("quest");
    }
    return this.completed;
  }
}

export class QuestLog {
  constructor() {
    this.quests = {};       // id -> Quest
    this.hudVisible = true;  // the objectives HUD can be toggled on/off
    // Running tallies of things the player has done, so a quest accepted LATER can
    // still count work done earlier. (The inventory already plays this role for
    // "collect"; these cover "defeat" and "reach".)
    this.defeats = {};       // enemyType -> how many the player has beaten
    this.visited = {};       // locationId -> true once stepped on
    this.talked = {};        // npcName -> true once spoken to
  }

  // Load quest definitions (from the map) but don't start them yet.
  // Exception: a quest flagged `autoStart` (e.g. a "prove yourself" capstone that
  // no NPC hands out) begins immediately and back-fills any progress already made.
  define(defs) {
    for (const def of defs) {
      if (!this.quests[def.id]) this.quests[def.id] = new Quest(def);
      if (def.autoStart) this.start(def.id);
    }
  }

  start(id, inventory) {
    const q = this.quests[id];
    if (q && !q.started) {
      q.start();
      // back-fill from everything the player has already done
      q.creditFromHistory({ inventory, defeats: this.defeats, visited: this.visited, talked: this.talked });
      return q;
    }
    return null;
  }

  // ---- These get called by the game when things happen ----
  onCollect(itemId) { this.progress("collect", itemId); }
  onDefeat(enemyType) {
    this.defeats[enemyType] = (this.defeats[enemyType] || 0) + 1;  // remember the kill
    this.progress("defeat", enemyType);
  }
  onTalk(npcName) {
    this.talked[npcName] = true;                // remember we've spoken to them
    this.progress("talk", npcName);
  }
  onReach(locationId) {
    this.visited[locationId] = true;            // remember we've been here
    this.progress("reach", locationId);
  }

  // Add 1 to any matching, unfinished objective in any started quest.
  progress(type, target) {
    for (const q of Object.values(this.quests)) {
      if (!q.started || q.completed) continue;
      for (const o of q.objectives) {
        if (o.type === type && o.target === target && o.current < o.needed) {
          o.current += 1;
        }
      }
      q.checkComplete();
    }
  }

  // The quests we should show on the HUD (started but maybe done).
  activeQuests() {
    return Object.values(this.quests).filter(q => q.started);
  }

  toggleHud() { this.hudVisible = !this.hudVisible; }
}
