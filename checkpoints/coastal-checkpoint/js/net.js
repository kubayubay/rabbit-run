// =====================================================================
//  net.js - simple online multiplayer (sec. 20)
// =====================================================================
//
//  THE BIG IDEA
//  ------------
//  Two computers, two bunnies, one shared adventure. To keep it simple we
//  use a "host and guest" setup (also called client/server):
//
//    * The HOST runs the real game - it owns the "truth": where both
//      bunnies are, what the enemies are doing, which quests are done.
//    * The GUEST does NOT run the game logic. Every frame it just:
//        1. sends the keys it is holding to the host, and
//        2. draws the latest "snapshot" the host sends back.
//
//  That way the two computers can never disagree about what is happening,
//  because only ONE of them (the host) decides. This is the same idea big
//  online games use, just stripped down to the essentials.
//
//  HOW THE TWO COMPUTERS FIND EACH OTHER
//  -------------------------------------
//  We use a small free library called PeerJS. When you click HOST, PeerJS
//  gives you a short code (your "peer id"). You read that code to your
//  friend. They type it in and click JOIN, and PeerJS connects the two
//  browsers directly. No server of our own required.
//
//  WHAT TRAVELS OVER THE WIRE
//  --------------------------
//  guest -> host : { t: "input", keys: { up, down, left, right, attack, dash } }
//  host  -> guest: { t: "state", ...a snapshot of everything to draw... }
//
//  Keeping the messages tiny and simple is what makes this understandable.
// =====================================================================

// PeerJS is loaded as a plain <script> in index.html, so it shows up as a
// global called "Peer". We grab it here.
const Peer = window.Peer;

// A virtual "input source". The real keyboard Input has isDown()/wasPressed();
// we make an object with the SAME shape so a Player can read from the network
// instead of the keyboard WITHOUT any other change to Player code. This mirror
// trick is the heart of how the remote bunny is controlled.
export class NetInputSource {
  constructor(keymap) {
    this.keymap = keymap;  // the SAME keymap the remote Player reads (e.g. KEYMAP_P2)
    this.held = {};      // key codes currently held by the remote player
    this.prev = {};      // last frame's held set (to detect "just pressed")
    this.pressed = {};   // key codes that went down THIS frame
  }
  // Called by the host each time a fresh input message arrives from the guest.
  // We translate the guest's six action booleans into the key CODES THIS player's
  // keymap expects, so Player.update() needs zero changes. Using the player's own
  // keymap is what makes the remote (WASD) bunny respond correctly.
  apply(keys) {
    const k = this.keymap;
    const want = {
      [k.up]: !!keys.up, [k.down]: !!keys.down,
      [k.left]: !!keys.left, [k.right]: !!keys.right,
      [k.attack]: !!keys.attack, [k.dash]: !!keys.dash,
    };
    const nowHeld = {};
    for (const code in want) if (want[code]) nowHeld[code] = true;
    // figure out which keys are newly pressed this frame
    this.pressed = {};
    for (const code in nowHeld) {
      if (!this.held[code]) this.pressed[code] = true;
    }
    this.held = nowHeld;
  }
  isDown(code)     { return this.held[code] === true; }
  wasPressed(code) { return this.pressed[code] === true; }
  // The host calls this once per frame AFTER updating the remote player, so a
  // "just pressed" only counts for a single frame (same as the keyboard).
  clearFrame() { this.pressed = {}; }
}

// Reads the LOCAL keyboard and boils it down to the six booleans we send to
// the host. We read through the game's normal Input so it respects the same
// keys the host's player 1 uses (arrows + Space + Shift).
export function sampleLocalInput(Input) {
  return {
    up:     Input.isDown("ArrowUp")    || Input.isDown("KeyW"),
    down:   Input.isDown("ArrowDown")  || Input.isDown("KeyS"),
    left:   Input.isDown("ArrowLeft")  || Input.isDown("KeyA"),
    right:  Input.isDown("ArrowRight") || Input.isDown("KeyD"),
    attack: Input.isDown("Space")      || Input.isDown("KeyF"),
    dash:   Input.isDown("ShiftLeft")  || Input.isDown("KeyG"),
    // On the WIN/GAME OVER screen, either player can press Enter/Space to restart
    // for the whole team. We send it as its own flag so the host can act on it.
    restart: Input.isDown("Enter")     || Input.isDown("Space"),
  };
}

// =====================================================================
//  Net - one small object that manages the connection for either role.
// =====================================================================
export const Net = {
  role: "off",          // "off" | "host" | "guest"
  peer: null,           // our PeerJS object
  conn: null,           // the open connection to the other player
  myId: null,           // our peer id (the host shares this as the room code)
  connected: false,
  status: "",           // a short message we can show on screen

  // These get filled in by game.js so the network can hand data to the game.
  onGuestInput: null,   // host: called with the guest's input message
  onState: null,        // guest: called with a snapshot from the host
  onConnected: null,    // both: called once the link is live
  onChat: null,         // both: called with an incoming chat message {from, text}
  onGuestTalk: null,    // host: called when the guest talked to an NPC (npc name)
  onGuestBuy: null,     // host: called when the guest bought a shop item (item index)

  // ---- HOST: open a room and wait for a guest ----
  host() {
    this.role = "host";
    this.status = "Starting host...";
    this.peer = new Peer();                     // ask PeerJS for an id
    this.peer.on("open", (id) => {
      this.myId = id;
      this.status = "Share this code: " + id;
      this.copyCode();                          // auto-copy so the host can just paste it
    });
    this.peer.on("connection", (conn) => {       // a guest is joining
      this.conn = conn;
      this._wire(conn);
    });
    this.peer.on("error", (e) => { this.status = "Error: " + e.type; });
  },

  // Copy the host's room code to the clipboard so the host can paste it straight
  // into a chat/text to their friend. We remember whether it worked so the HUD can
  // show "Code copied!" (and offer a re-copy key if the browser blocked it).
  copyCode() {
    if (!this.myId || !navigator.clipboard) { this.copied = false; return; }
    navigator.clipboard.writeText(this.myId)
      .then(() => { this.copied = true; })
      .catch(() => { this.copied = false; });   // some browsers block clipboard without a click
  },

  // ---- GUEST: join a room using the host's code ----
  join(hostId) {
    this.role = "guest";
    this.status = "Connecting...";
    this._lastHostId = hostId;             // remember it so we can reconnect later
    this.peer = new Peer();
    this.peer.on("open", () => {
      this.conn = this.peer.connect(hostId, { reliable: false });
      this._wire(this.conn);
    });
    this.peer.on("error", (e) => { this.status = "Error: " + e.type; });
  },

  // Shared setup once we have a connection object (host or guest).
  _wire(conn) {
    conn.on("open", () => {
      this.connected = true;
      this._wasConnected = true;             // remember we've been linked at least once
      this.status = "Connected!";
      if (this.onConnected) this.onConnected();
    });
    conn.on("data", (msg) => {
      if (msg.t === "chat") {
        // A chat line arrived. Show it on our own screen...
        if (this.onChat) this.onChat(msg);
        // ...and if we're the HOST, relay the guest's line back out so BOTH
        // players see every message (the host is the message hub).
        if (this.role === "host") this.conn.send(msg);
        return;
      }
      if (this.role === "host" && msg.t === "talk" && this.onGuestTalk) {
        // The guest talked to an NPC on their screen. The host owns quest truth,
        // so it credits the "talked to X" tally and the next snapshot syncs it.
        this.onGuestTalk(msg.npc);
        return;
      }
      if (this.role === "host" && msg.t === "buy" && this.onGuestBuy) {
        // The guest bought from the shop. The host owns the gold, so it spends
        // the guest's coins and applies the item to the guest's bunny.
        this.onGuestBuy(msg.index);
        return;
      }
      if (this.role === "host" && msg.t === "input" && this.onGuestInput) {
        this.onGuestInput(msg.keys);
      } else if (this.role === "guest" && msg.t === "state" && this.onState) {
        this.onState(msg);
      }
    });
    conn.on("close", () => {
      this.connected = false;
      this.status = "Disconnected - press R to reconnect";
    });
  },

  // GUEST: try to rejoin the same host after a dropped link. The host's id doesn't
  // change, so we just reconnect to it. (The host keeps running, so the guest can
  // pop back in right where the action is.)
  reconnect() {
    if (this.role !== "guest" || !this._lastHostId) return;
    this.status = "Reconnecting...";
    const dial = () => {
      this.conn = this.peer.connect(this._lastHostId, { reliable: false });
      this._wire(this.conn);
    };
    if (!this.peer || this.peer.destroyed) {
      // our Peer object itself died - spin up a fresh one, then dial when ready
      this.peer = new Peer();
      this.peer.on("open", () => dial());
      this.peer.on("error", (e) => { this.status = "Error: " + e.type; });
    } else {
      dial();
    }
  },

  // ---- send helpers (do nothing until we're really connected) ----
  sendInput(keys) {
    if (this.connected && this.conn && this.role === "guest") this.conn.send({ t: "input", keys });
  },
  // GUEST: tell the host we talked to an NPC, so the host can credit the quest.
  sendTalk(npc) {
    if (this.connected && this.conn && this.role === "guest") this.conn.send({ t: "talk", npc });
  },
  // GUEST: tell the host we pressed buy in the shop (by item index). The host
  // spends OUR gold and applies the item to our bunny (player 2).
  sendBuy(index) {
    if (this.connected && this.conn && this.role === "guest") this.conn.send({ t: "buy", index });
  },
  sendState(snapshot) {
    if (this.connected && this.conn && this.role === "host") this.conn.send(snapshot);
  },
  // Send a chat line. Both roles can chat. The host also shows its own line
  // locally right away (it won't get a relay of its own message).
  sendChat(from, text) {
    if (!this.connected || !this.conn) return;
    const msg = { t: "chat", from, text };
    this.conn.send(msg);
    if (this.role === "host" && this.onChat) this.onChat(msg);  // show our own line
  },

  isHost()  { return this.role === "host"; },
  isGuest() { return this.role === "guest"; },
  isOnline(){ return this.role !== "off"; },

  // A simple status for the on-screen banner: are we connected, still waiting for
  // the other player, or did the link drop?
  phase() {
    if (this.connected) return "connected";
    if (this._wasConnected) return "disconnected";   // we were linked and lost it
    return "waiting";                                 // hosting/joining, not linked yet
  },
};
