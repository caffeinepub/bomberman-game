# Bomberman Game

## Current State
Online co-op is implemented via WebRTC DataChannel. Host runs the game simulation and pushes full game state to guest at ~10Hz. Guest is a pure renderer -- it applies received state directly and does client-side interpolation for px/py positions. Three bugs are active:

1. Guest movement is laggy (~200ms+ felt latency) because state only pushes at 10Hz and guest inputs travel: keyboard → sendData → host receives → processes → pushes back state → guest sees result (2+ round-trips)
2. Guest gets stuck on old level because `setGameStatus('playing')` is never called in the guest tick block when the host's state transitions back to `status: "playing"` after a level advance
3. After a guest quits and tries to rejoin, the room is not visible because `cleanupOnline()` uses the React state `onlineRoomId` (possibly stale) instead of the ref `onlineRoomIdRef.current`, so `leaveRoom` gets an empty string and never clears `guestPrincipal` on the backend -- so `listRooms` keeps hiding that room

## Requested Changes (Diff)

### Add
- Auto-refresh rooms list when user navigates to the join screen (after returning from a session)

### Modify
- Increase host state push rate from every 100ms to every 33ms (~30Hz) for smoother guest rendering
- Fix guest tick block to call `setGameStatus('playing')` when the received state `status` is `"playing"` (fixes stuck level overlay)
- Fix `cleanupOnline()` to use `onlineRoomIdRef.current` instead of the React state `onlineRoomId` so the `leaveRoom` backend call always uses the correct room ID
- Also call `leaveRoomAsGuest` (not the legacy `leaveRoom`) from the guest path so the backend correctly clears `guestPrincipal` and the room reappears in `listRooms`
- Fix `onlineRoomIdRef` assignment -- currently it is set to the state variable `onlineRoomId` but should be set to the actual `roomId` parameter immediately in `handleGuestJoin` and `handleHostCreate` so the ref is always current

### Remove
- Nothing removed

## Implementation Plan
1. In the host's game tick, change `100` to `33` in the `lastStatePushRef.current > 100` check so state pushes at ~30Hz
2. In the guest tick block (around lines 446–451), add `else if (latestGs.status === 'playing') { setGameStatus('playing'); }` so the level-complete overlay clears when the host advances
3. In `cleanupOnline()`, replace `rid = roomId ?? onlineRoomId` with `rid = roomId ?? onlineRoomIdRef.current` and ensure the guest path calls the specific guest leave function
4. In `handleGuestJoin` and wherever `onlineRoomId` state is set, also immediately assign `onlineRoomIdRef.current = roomId` so the ref is always current
5. When the user opens the join screen (navigates to `onlineScreen === 'join'`), trigger `loadOnlineRooms()` automatically
