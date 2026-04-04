# Bomberman Game - Online Co-op Step 3 & 4

## Current State

Steps 1 & 2 are complete:
- Backend (Motoko) has full signaling: createRoom, joinRoom, listRooms, pushOffer/Answer, pushHostIce/GuestIce, startGame, isGameStarted, pushGameState, getGameState, submitP2Input, getAndClearP2Inputs.
- Frontend has full lobby UI: name entry, host setup (room name + grid size), host waiting screen, joiner room list, joiner waiting screen.
- WebRTC handshake completes (offer/answer/ICE via ICP canister) and the DataChannel is established.
- When host presses Start: sends `"START"` over DataChannel, calls `actor.startGame(roomId)`.
- When guest receives `"START"`: lobby clears. But neither host nor guest actually starts the game loop -- both placeholders have comment `// Placeholder: Online game sync coming in Steps 3 & 4`.

Key structural gaps:
- `rtcManager` is React state -- not accessible inside `tick`. Needs a `rtcManagerRef`.
- `_onlineRole` (prefixed with `_`) is stored but never read back into gameplay. Needs `onlineRoleRef`.
- `tick()` has no online co-op branching -- doesn't know whether to run the full simulation (host) or apply received state (guest).
- `GameState` has no JSON serialization/deserialization.
- Guest never calls `startGame()` after receiving START signal.
- Grid size from room is not parsed for guest.
- `isOnlineCoop`, `isOnlineHost`, `isOnlineGuest` flags don't exist yet.

## Requested Changes (Diff)

### Add
- **`rtcManagerRef`** (useRef) alongside `rtcManager` state -- gives `tick` access to the DataChannel without stale closure issues
- **`onlineRoleRef`** (useRef) that mirrors `_onlineRole` -- gives `tick` access to host/guest identity
- **`isOnlineCoopRef`** (useRef boolean) -- tells `tick` whether we're in online co-op mode
- **`onlineRoomIdRef`** (useRef string) -- used inside tick for keepAlive and input relay
- **`gameStateSerializer`**: function to serialize `GameState` to JSON, handling non-serializable types (Set, Map) by converting to arrays/objects. Located in `src/frontend/src/game/types.ts` or a new `src/frontend/src/game/serializer.ts`.
- **`gameStateDeserializer`**: reverse of above -- JSON string to `GameState`, reconstructing Set/Map from arrays.
- **Host game loop additions inside `tick`**:
  - After computing the new frame, if `isOnlineCoopRef.current && onlineRoleRef.current === 'host'` AND DataChannel is open: serialize `GameState` and `sendData` ~every 100ms (use a `lastStatePushRef` timestamp to throttle).
  - Read `getAndClearP2Inputs` from canister periodically (every 150ms via `setInterval`, not inside RAF loop) -- parse each input JSON and apply to `p2KeyOrderRef` and trigger `placeP2BombOnline()`.
  - Alternatively, route P2 inputs entirely via WebRTC DataChannel for lower latency: guest sends `{type:"input", key:"...", bomb:true/false}` messages; host applies them inside `tick`.
- **Guest game loop additions inside `tick`**:
  - If `isOnlineCoopRef.current && onlineRoleRef.current === 'guest'`: skip ALL game simulation (movement, enemies, bombs, physics). Instead, apply received state snapshots from the DataChannel.
  - Guest receives state JSON via `rtcManager.onMessage`, stores it in a `latestRemoteState` ref, and `tick` applies it each frame (or on receipt).
  - Guest sends local keypresses to host over DataChannel: `{type:"input", code:"ArrowUp", pressed:true}` and bomb `{type:"bomb"}`.
- **Guest `startGame` call**: when guest receives `"START"` message, parse grid size from `onlineRoomNameDisplay`/room record, call `startGame(cols, rows, true)` with `isOnlineGuest = true` flag, then set screen to `"game"`.
- **Host `startGame` call**: when host presses Start button, after sending `"START"`, call `startGame(cols, rows, true)` with `isOnlineHost = true` flag, then set screen to `"game"`.
- **Input relay via DataChannel (preferred over canister relay for speed)**:
  - Guest keydown/keyup events: send `{type:"input",code:"...",pressed:boolean}` to host via DataChannel.
  - Guest bomb button: send `{type:"bomb"}` to host.
  - Host receives these in `onMessage`, updates a `p2InputQueueRef`, which `tick` drains each frame.
- **State snapshot apply on guest**: `onMessage` on guest side stores the latest `GameState` JSON in `latestRemoteStateRef`. At the top of `tick` (guest path), deserialize and set `gsRef.current` to the snapshot before drawing.
- **keepAlive**: both host and guest call `actor.keepAlive(roomId)` every 10s during active game to keep room alive on canister.
- **Disconnection handling**: if DataChannel closes during game, show a "Disconnected" overlay and return to main menu.

### Modify
- **`handleHostStart`**: After `sendData(rtcManager, "START")`, call `startGame(cols, rows, true)` with host flags set, set `screen` to `"game"`.
- **`handleGuestJoin` onMessage handler**: When receiving `"START"`, parse grid size, call `startGame(cols, rows, true)` with guest flags, set `screen` to `"game"`.
- **`_onlineRole`**: Remove underscore prefix, add mirroring ref `onlineRoleRef`.
- **`rtcManager` state**: Add parallel `rtcManagerRef` that is kept in sync whenever `rtcManager` is set.
- **`tick`**: Add online co-op branching at the top:
  ```
  if (isOnlineCoopRef.current && onlineRoleRef.current === 'guest') {
    // Apply latest remote state snapshot, then draw, then send local inputs
    // Skip all simulation
  }
  // Otherwise: normal host/singleplayer simulation path
  ```
- **P2 input on local co-op**: unchanged -- keyboard Shift for bomb, WASD for movement.
- **P2 input on online co-op (guest side)**: Guest arrow keys + Right Ctrl send DataChannel messages instead of directly manipulating refs (since guest's `tick` skips simulation).

### Remove
- The two `// Placeholder: Online game sync coming in Steps 3 & 4` comment blocks (replace with real logic).
- `_onlineRole` prefix (rename to `onlineRole` and add ref).

## Implementation Plan

1. Add `serializer.ts` with `serializeGameState(gs: GameState): string` and `deserializeGameState(json: string): GameState` -- handle Set/Map/non-serializable fields.
2. Add refs: `rtcManagerRef`, `onlineRoleRef`, `isOnlineCoopRef`, `onlineRoomIdRef`, `lastStatePushRef`, `latestRemoteStateRef`, `p2InputQueueRef`.
3. Whenever `setRtcManager(mgr)` is called, also set `rtcManagerRef.current = mgr`.
4. Whenever `setOnlineRole(role)` is called, also set `onlineRoleRef.current = role`.
5. Modify `handleHostStart`: call `startGame()` for host, set `isOnlineCoopRef.current = true`, `onlineRoleRef.current = 'host'`, set up `rtcManager.onMessage` for receiving guest inputs from DataChannel.
6. Modify `handleGuestJoin` onMessage: when `data === 'START'`, parse grid size from room, call `startGame()` for guest, set `isOnlineCoopRef.current = true`, `onlineRoleRef.current = 'guest'`, set up sending inputs via DataChannel.
7. Modify `tick` to branch at top for guest: apply `latestRemoteStateRef.current` snapshot, draw, skip simulation. For host: add state push throttle after simulation.
8. Add input sending from guest's keydown handler to DataChannel (instead of manipulating refs directly when in online guest mode).
9. Add host `onMessage` handler to drain `p2InputQueueRef` -- feed into `p2KeyOrderRef` and `placeP2Bomb`.
10. Add keepAlive interval (every 10s) during active game for both host and guest.
11. Add disconnection overlay if DataChannel closes mid-game.
12. Grid size mapping: `"S" -> 11x11`, `"M" -> 15x15`, `"L" -> 19x19`. Custom not available for online (default to M if encountered).
