import Array "mo:core/Array";
import Int "mo:core/Int";
import Iter "mo:core/Iter";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Map "mo:core/Map";



actor {
  // ── Legacy high score ────────────────────────────────────────────────
  stable var highScore : Nat = 0;

  public shared func submitScore(score : Nat) : async Nat {
    if (score > highScore) { highScore := score };
    highScore;
  };

  public query func getHighScore() : async Nat { highScore };

  // ── Types ────────────────────────────────────────────────────────────
  // Enhanced room record with signaling support.
  type RoomRecord = {
    id : Text;
    hostPrincipal : Principal;
    guestPrincipal : ?Principal;
    roomName : Text;
    hostName : Text;
    gridSize : Text;
    gameState : Text;
    p2Inputs : [Text];
    hostOffer : Text;
    guestAnswer : Text;
    hostIce : [Text];
    guestIce : [Text];
    gameStarted : Bool;
    lastBeat : Int;
    active : Bool;
  };

  type RoomInfo = {
    id : Text;
    roomName : Text;
    hostName : Text;
    gridSize : Text;
    playerCount : Nat;
    gameStarted : Bool;
  };

  // ── Stable state ─────────────────────────────────────────────────────
  let roomStore = Map.empty<Text, RoomRecord>();
  stable var roomCounter : Nat = 0;

  // ── Helpers ──────────────────────────────────────────────────────────
  func nowMs() : Int { Time.now() / 1_000_000 };

  func genId() : Text {
    roomCounter += 1;
    let n = roomCounter;
    let ch = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var id = "";
    var v = n;
    var i = 0;
    while (i < 4) {
      let idx = v % 32;
      v := v / 32;
      var j : Nat = 0;
      label findChar for (c in ch.toIter()) {
        if (j == idx) { id := id # Text.fromChar(c); break findChar };
        j += 1;
      };
      i += 1;
    };
    id;
  };

  func cleanup() {
    let stale = nowMs() - 30_000; // 30s timeout
    for ((id, room) in roomStore.entries()) {
      if (room.active and room.lastBeat < stale) {
        roomStore.add(id, { room with active = false });
      };
    };
  };

  func findActiveRoom(roomId : Text) : ?RoomRecord {
    roomStore.get(roomId);
  };

  // ── Room management ──────────────────────────────────────────────────
  public shared ({ caller }) func createRoom(roomName : Text, hostName : Text, gridSize : Text) : async Text {
    cleanup();
    let id = genId();
    let room : RoomRecord = {
      id;
      hostPrincipal = caller;
      guestPrincipal = null;
      roomName;
      hostName;
      gridSize;
      gameState = "";
      p2Inputs = [];
      hostOffer = "";
      guestAnswer = "";
      hostIce = [];
      guestIce = [];
      gameStarted = false;
      lastBeat = nowMs();
      active = true;
    };
    roomStore.add(id, room);
    id;
  };

  public query func listRooms() : async [RoomInfo] {
    let roomsArray = roomStore.values().toArray();
    // Show active rooms that haven't started yet, OR active rooms waiting for a second player
    let visibleRooms = roomsArray.filter(func(r) {
      r.active and not r.gameStarted
    });
    visibleRooms.map(
      func(r) {
        let pc : Nat = switch (r.guestPrincipal) { case (null) { 1 }; case (_) { 2 } };
        {
          id = r.id;
          roomName = r.roomName;
          hostName = r.hostName;
          gridSize = r.gridSize;
          playerCount = pc;
          gameStarted = r.gameStarted;
        };
      }
    );
  };

  // Join a room -- works even if game has started as long as guest slot is empty
  public shared ({ caller }) func joinRoom(roomId : Text) : async Bool {
    cleanup();
    switch (findActiveRoom(roomId)) {
      case (null) { false };
      case (?room) {
        switch (room.guestPrincipal) {
          case (?_) { false }; // slot taken
          case (null) {
            roomStore.add(roomId, {
              room with
              guestPrincipal = ?caller;
              lastBeat = nowMs();
              // Reset signaling fields for new guest
              guestAnswer = "";
              guestIce = [];
            });
            true;
          };
        };
      };
    };
  };

  // Guest leaving:
  //   - If game has NOT started yet (lobby phase): clear guest slot so a new
  //     player can join from the room list.
  //   - If game has already started (mid-game): close the room entirely so it
  //     disappears from the list and no new joiners can take over.
  public shared ({ caller }) func leaveRoomAsGuest(roomId : Text) : async () {
    switch (findActiveRoom(roomId)) {
      case (null) {};
      case (?room) {
        switch (room.guestPrincipal) {
          case (?p) {
            if (Principal.equal(caller, p)) {
              if (room.gameStarted) {
                // Mid-game leave: close the room entirely
                roomStore.add(roomId, { room with active = false });
              } else {
                // Lobby leave: free the slot for another joiner
                roomStore.add(roomId, {
                  room with
                  guestPrincipal = null;
                  // Reset signaling for next guest
                  guestAnswer = "";
                  guestIce = [];
                });
              };
            };
          };
          case (null) {};
        };
      };
    };
  };

  // Host leaving: marks room inactive, removes it from listings
  public shared ({ caller }) func leaveRoomAsHost(roomId : Text) : async () {
    switch (findActiveRoom(roomId)) {
      case (null) {};
      case (?room) {
        if (Principal.equal(caller, room.hostPrincipal)) {
          roomStore.add(roomId, { room with active = false });
        };
      };
    };
  };

  // Legacy leaveRoom -- kept for backwards compat, behaves as host leave
  public shared ({ caller }) func leaveRoom(roomId : Text) : async () {
    switch (findActiveRoom(roomId)) {
      case (null) {};
      case (?room) {
        if (Principal.equal(caller, room.hostPrincipal)) {
          roomStore.add(roomId, { room with active = false });
        } else {
          // Guest leaving
          switch (room.guestPrincipal) {
            case (?p) {
              if (Principal.equal(caller, p)) {
                if (room.gameStarted) {
                  // Mid-game: close room entirely
                  roomStore.add(roomId, { room with active = false });
                } else {
                  // Lobby: free guest slot
                  roomStore.add(roomId, {
                    room with
                    guestPrincipal = null;
                    guestAnswer = "";
                    guestIce = [];
                  });
                };
              };
            };
            case (null) {};
          };
        };
      };
    };
  };

  // Query whether a room currently has an active guest
  public query func hasGuest(roomId : Text) : async Bool {
    switch (findActiveRoom(roomId)) {
      case (null) { false };
      case (?room) {
        switch (room.guestPrincipal) {
          case (null) { false };
          case (?_) { true };
        };
      };
    };
  };

  public shared func keepAlive(roomId : Text) : async () {
    switch (findActiveRoom(roomId)) {
      case (null) {};
      case (?room) {
        roomStore.add(roomId, { room with lastBeat = nowMs() });
      };
    };
  };

  // ── State relay ──────────────────────────────────────────────────────
  public shared ({ caller }) func pushGameState(roomId : Text, stateJson : Text) : async () {
    switch (findActiveRoom(roomId)) {
      case (null) {};
      case (?room) {
        if (Principal.equal(caller, room.hostPrincipal)) {
          roomStore.add(roomId, { room with gameState = stateJson });
        };
      };
    };
  };

  public query func getGameState(roomId : Text) : async ?Text {
    switch (findActiveRoom(roomId)) {
      case (null) { null };
      case (?room) { if (room.gameState.size() > 0) { ?room.gameState } else { null } };
    };
  };

  // ── Input relay ──────────────────────────────────────────────────────
  public shared func submitP2Input(roomId : Text, inputJson : Text) : async () {
    switch (findActiveRoom(roomId)) {
      case (null) {};
      case (?room) {
        let newInputs = room.p2Inputs.concat([inputJson]);
        roomStore.add(roomId, { room with p2Inputs = newInputs });
      };
    };
  };

  public shared ({ caller }) func getAndClearP2Inputs(roomId : Text) : async [Text] {
    switch (findActiveRoom(roomId)) {
      case (null) { [] };
      case (?room) {
        if (not Principal.equal(caller, room.hostPrincipal)) { return [] };
        let out = room.p2Inputs;
        roomStore.add(roomId, { room with p2Inputs = [] });
        out;
      };
    };
  };

  // ── WebRTC signaling support ─────────────────────────────────────────
  public shared ({ caller }) func pushOffer(roomId : Text, offer : Text) : async () {
    switch (findActiveRoom(roomId)) {
      case (null) {};
      case (?room) {
        if (Principal.equal(caller, room.hostPrincipal)) {
          roomStore.add(roomId, { room with hostOffer = offer });
        };
      };
    };
  };

  public shared ({ caller }) func pushAnswer(roomId : Text, answer : Text) : async () {
    switch (findActiveRoom(roomId)) {
      case (null) {};
      case (?room) {
        switch (room.guestPrincipal) {
          case (?p) {
            if (Principal.equal(caller, p)) {
              roomStore.add(roomId, { room with guestAnswer = answer });
            };
          };
          case (null) {};
        };
      };
    };
  };

  public shared ({ caller }) func pushHostIce(roomId : Text, candidate : Text) : async () {
    switch (findActiveRoom(roomId)) {
      case (null) {};
      case (?room) {
        if (Principal.equal(caller, room.hostPrincipal)) {
          let newIce = room.hostIce.concat([candidate]);
          roomStore.add(roomId, { room with hostIce = newIce });
        };
      };
    };
  };

  public shared ({ caller }) func pushGuestIce(roomId : Text, candidate : Text) : async () {
    switch (findActiveRoom(roomId)) {
      case (null) {};
      case (?room) {
        switch (room.guestPrincipal) {
          case (?p) {
            if (Principal.equal(caller, p)) {
              let newIce = room.guestIce.concat([candidate]);
              roomStore.add(roomId, { room with guestIce = newIce });
            };
          };
          case (null) {};
        };
      };
    };
  };

  public query func getOffer(roomId : Text) : async ?Text {
    switch (findActiveRoom(roomId)) {
      case (null) { null };
      case (?room) {
        if (room.hostOffer.size() > 0) {
          ?room.hostOffer;
        } else {
          null;
        };
      };
    };
  };

  public query func getAnswer(roomId : Text) : async ?Text {
    switch (findActiveRoom(roomId)) {
      case (null) { null };
      case (?room) {
        if (room.guestAnswer.size() > 0) {
          ?room.guestAnswer;
        } else {
          null;
        };
      };
    };
  };

  public query func getHostIce(roomId : Text) : async [Text] {
    switch (findActiveRoom(roomId)) {
      case (null) { [] };
      case (?room) { room.hostIce };
    };
  };

  public query func getGuestIce(roomId : Text) : async [Text] {
    switch (findActiveRoom(roomId)) {
      case (null) { [] };
      case (?room) { room.guestIce };
    };
  };

  public shared ({ caller }) func startGame(roomId : Text) : async () {
    switch (findActiveRoom(roomId)) {
      case (null) {};
      case (?room) {
        if (Principal.equal(caller, room.hostPrincipal)) {
          roomStore.add(roomId, { room with gameStarted = true });
        };
      };
    };
  };

  public query func isGameStarted(roomId : Text) : async Bool {
    switch (findActiveRoom(roomId)) {
      case (null) { false };
      case (?room) { room.gameStarted };
    };
  };
};
