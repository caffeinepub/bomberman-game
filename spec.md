# Bomberman Game - WebRTC Online Co-op (Steps 1 & 2)

## Current State
- Local co-op works on same keyboard (P1: arrows+RCtrl, P2: WASD+Shift)
- Backend has room relay methods: createRoom, listRooms, joinRoom, leaveRoom, keepAlive, pushGameState, getGameState, submitP2Input, getAndClearP2Inputs
- No WebRTC signaling methods exist yet
- No online multiplayer lobby UI exists

## Requested Changes (Diff)

### Add
- Backend signaling methods: pushOffer, pushAnswer, pushHostIce, pushGuestIce, getOffer, getAnswer, getHostIce, getGuestIce
- Backend room metadata: roomName, hostName, gridSize fields on RoomRecord
- Updated createRoom signature: createRoom(roomName, hostName, gridSize) -> Text
- Updated listRooms to return roomName, hostName, gridSize, playerCount
- Online Co-op button on main menu
- Name entry screen (before host/join selection)
- Host flow: enter room name + pick grid size -> create room -> waiting screen -> Start button activates when P2 DataChannel is open
- Joiner flow: available rooms list with refresh -> join -> WebRTC handshake -> waiting for host screen
- WebRTC DataChannel establishment (STUN: stun.l.google.com:19302)
- webrtcManager.ts utility module for WebRTC connection logic
- OnlineMultiplayerScreen component in App.tsx

### Modify
- backend.d.ts: add new signaling method signatures, update createRoom/listRooms signatures
- backend.did.js: add new IDL entries for signaling methods
- App.tsx: add Online Co-op screen state, wire OnlineMultiplayerScreen component
- Main menu: add Online Co-op button alongside Local Co-op

### Remove
- Nothing removed from existing local co-op or single player

## Implementation Plan
1. Extend Motoko backend with signaling fields (offer, answer, hostIceCandidates, guestIceCandidates arrays) on RoomRecord and add push/get methods
2. Update createRoom to accept roomName, hostName, gridSize parameters
3. Update listRooms RoomInfo to include roomName, hostName, gridSize
4. Update backend.d.ts and backend.did.js to match new backend
5. Create src/frontend/src/game/webrtcManager.ts with WebRTC connection logic (createOffer, handleAnswer, addIceCandidate, DataChannel open/send/receive)
6. Add OnlineMultiplayerScreen to App.tsx covering: name entry, host vs join choice, host setup form, host waiting room, joiner room list, joiner waiting room
7. Wire Online Co-op button on main menu
8. Steps 3 & 4 (game state sync + input relay over DataChannel) are NOT in this build -- game launches for host only as placeholder after DataChannel opens
