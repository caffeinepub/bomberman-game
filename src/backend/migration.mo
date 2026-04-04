import Map "mo:core/Map";
import Text "mo:core/Text";
import Principal "mo:core/Principal";

module {
  // Old room record definition without signaling fields
  type OldRoomRecord = {
    id : Text;
    hostId : Principal;
    guestId : ?Principal;
    gameState : Text;
    p2Inputs : [Text];
    lastBeat : Int;
    active : Bool;
  };

  type OldActor = {
    rooms : [OldRoomRecord];
    roomCounter : Nat;
    highScore : Nat;
  };

  // New room record with signaling support and persistent storage
  type NewRoomRecord = {
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

  type NewActor = {
    roomStore : Map.Map<Text, NewRoomRecord>;
    roomCounter : Nat;
    highScore : Nat;
  };

  public func run(old : OldActor) : NewActor {
    let newRoomStore = Map.fromIter<Text, NewRoomRecord>(
      old.rooms.values().map(
        func(oldRoom) {
          (
            oldRoom.id,
            {
              id = oldRoom.id;
              hostPrincipal = oldRoom.hostId;
              guestPrincipal = oldRoom.guestId;
              roomName = "";
              hostName = "";
              gridSize = "";
              gameState = oldRoom.gameState;
              p2Inputs = oldRoom.p2Inputs;
              hostOffer = "";
              guestAnswer = "";
              hostIce = [];
              guestIce = [];
              gameStarted = false;
              lastBeat = oldRoom.lastBeat;
              active = oldRoom.active;
            },
          );
        }
      )
    );
    {
      roomStore = newRoomStore;
      roomCounter = old.roomCounter;
      highScore = old.highScore;
    };
  };
};
