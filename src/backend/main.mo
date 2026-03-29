import Array "mo:base/Array";
import Int "mo:base/Int";
import Nat "mo:base/Nat";
import Principal "mo:base/Principal";
import Text "mo:base/Text";
import Time "mo:base/Time";

actor {
  // ── Legacy high score ────────────────────────────────────────────────
  stable var highScore : Nat = 0;

  public shared func submitScore(score : Nat) : async Nat {
    if (score > highScore) { highScore := score };
    highScore;
  };

  public query func getHighScore() : async Nat { highScore };

  // ── Types ─────────────────────────────────────────────────────────────
  type RoomRecord = {
    id          : Text;
    hostId      : Principal;
    guestId     : ?Principal;
    gameState   : Text;
    p2Inputs    : [Text];
    lastBeat    : Int;
    active      : Bool;
  };

  type RoomInfo = {
    id          : Text;
    hostId      : Principal;
    playerCount : Nat;
  };

  // ── Stable state ──────────────────────────────────────────────────────
  stable var rooms       : [RoomRecord] = [];
  stable var roomCounter : Nat          = 0;

  // ── Helpers ───────────────────────────────────────────────────────────
  func nowMs() : Int { Time.now() / 1_000_000 };

  func genId() : Text {
    roomCounter += 1;
    let n  = roomCounter;
    let ch = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var id = "";
    var v  = n;
    var i  = 0;
    while (i < 4) {
      let idx = v % 32;
      v := v / 32;
      var j : Nat = 0;
      label findChar for (c in Text.toIter(ch)) {
        if (j == idx) { id := id # Text.fromChar(c); break findChar };
        j += 1;
      };
      i += 1;
    };
    id;
  };

  func cleanup() {
    let stale = nowMs() - 30_000;
    rooms := Array.filter<RoomRecord>(rooms, func(r) { r.active and r.lastBeat >= stale });
  };

  func updateRoom(roomId : Text, f : RoomRecord -> RoomRecord) {
    rooms := Array.map<RoomRecord, RoomRecord>(rooms, func(r) {
      if (r.id == roomId) f(r) else r
    });
  };

  func findRoom(roomId : Text) : ?RoomRecord {
    Array.find<RoomRecord>(rooms, func(r) { r.id == roomId and r.active });
  };

  // ── Room management ───────────────────────────────────────────────────
  public shared ({ caller }) func createRoom() : async Text {
    cleanup();
    let id = genId();
    let r : RoomRecord = {
      id        = id;
      hostId    = caller;
      guestId   = null;
      gameState = "";
      p2Inputs  = [];
      lastBeat  = nowMs();
      active    = true;
    };
    rooms := Array.append<RoomRecord>(rooms, [r]);
    id;
  };

  public query func listRooms() : async [RoomInfo] {
    Array.map<RoomRecord, RoomInfo>(
      Array.filter<RoomRecord>(rooms, func(r) { r.active }),
      func(r) {
        let pc : Nat = switch (r.guestId) { case null 1; case _ 2 };
        { id = r.id; hostId = r.hostId; playerCount = pc };
      },
    );
  };

  public shared ({ caller }) func joinRoom(roomId : Text) : async Bool {
    cleanup();
    switch (findRoom(roomId)) {
      case null false;
      case (?r) {
        switch (r.guestId) {
          case (?_) false;
          case null {
            updateRoom(roomId, func(old) {
              { id = old.id; hostId = old.hostId; guestId = ?caller;
                gameState = old.gameState; p2Inputs = old.p2Inputs;
                lastBeat = nowMs(); active = old.active };
            });
            true;
          };
        };
      };
    };
  };

  public shared func leaveRoom(roomId : Text) : async () {
    rooms := Array.filter<RoomRecord>(rooms, func(r) { r.id != roomId });
  };

  public shared func keepAlive(roomId : Text) : async () {
    updateRoom(roomId, func(old) {
      { id = old.id; hostId = old.hostId; guestId = old.guestId;
        gameState = old.gameState; p2Inputs = old.p2Inputs;
        lastBeat = nowMs(); active = old.active };
    });
  };

  // ── State relay ───────────────────────────────────────────────────────
  public shared ({ caller }) func pushGameState(roomId : Text, stateJson : Text) : async () {
    switch (findRoom(roomId)) {
      case null ();
      case (?r) {
        if (Principal.equal(caller, r.hostId)) {
          updateRoom(roomId, func(old) {
            { id = old.id; hostId = old.hostId; guestId = old.guestId;
              gameState = stateJson; p2Inputs = old.p2Inputs;
              lastBeat = nowMs(); active = old.active };
          });
        };
      };
    };
  };

  public query func getGameState(roomId : Text) : async ?Text {
    switch (findRoom(roomId)) {
      case null null;
      case (?r) { if (Text.size(r.gameState) > 0) ?r.gameState else null };
    };
  };

  // ── Input relay ───────────────────────────────────────────────────────
  public shared func submitP2Input(roomId : Text, inputJson : Text) : async () {
    updateRoom(roomId, func(old) {
      { id = old.id; hostId = old.hostId; guestId = old.guestId;
        gameState = old.gameState;
        p2Inputs = Array.append<Text>(old.p2Inputs, [inputJson]);
        lastBeat = nowMs(); active = old.active };
    });
  };

  public shared ({ caller }) func getAndClearP2Inputs(roomId : Text) : async [Text] {
    switch (findRoom(roomId)) {
      case null [];
      case (?r) {
        if (not Principal.equal(caller, r.hostId)) return [];
        let out = r.p2Inputs;
        updateRoom(roomId, func(old) {
          { id = old.id; hostId = old.hostId; guestId = old.guestId;
            gameState = old.gameState; p2Inputs = [];
            lastBeat = old.lastBeat; active = old.active };
        });
        out;
      };
    };
  };
};
