# Bomberman Game

## Current State

A browser-based Bomberman game with single-player, local co-op (P1: Arrows+RCtrl, P2: WASD+Shift), and online co-op (WebRTC, host/guest). Three active bugs reported.

## Requested Changes (Diff)

### Add
- `p2TeleportFlashUntil: number` field to `GameState` (types.ts) alongside existing `teleportFlashUntil`
- A "Back to Lobby" button on the gameover screen when online co-op is active and the time ran out (timed level)

### Modify
- **Portal flash bug (Bug 1)**: `teleportFlashUntil` is a single value on `GameState`. When P1 teleports via portal bomb, it triggers a full-screen pink flash on P2's canvas too. Fix: split into two separate fields `teleportFlashUntil` (P1 only) and `p2TeleportFlashUntil` (P2 only). In `App.tsx`, set `gs.teleportFlashUntil` only when P1 teleports and set `gs.p2TeleportFlashUntil` only when P2 teleports. In `renderer.ts`, move the full-screen flash to fire only when `teleportFlashUntil` is active (P1's flash), and add a separate localized flash (or omit P2 flash entirely since it happens on P1's screen). For local co-op this means P2 teleporting should NOT cause a full-screen pink overlay on the shared canvas - only P1's teleport causes the flash.
- **P2 bomb animation bug (Bug 2)**: In `drawBomb()` in `renderer.ts`, the fuse progress is calculated as `(now - bomb.placedAt) / bomb.fuseMs`. For the online co-op guest, `bomb.placedAt` is a `performance.now()` timestamp from the host machine and `now` is the guest's local `performance.now()`. These clocks are not synchronized, so the fuse animation looks wrong/different for the guest. Fix: when serializing game state, add a `serverTime: performance.now()` field to the packet. When the guest deserializes, compute a `clockOffset = guestNow - serverTime` and store it on the deserialized gs as `hostClockOffset`. In `renderer.ts`, when calculating fuse for drawBomb, use `(now - hostClockOffset - bomb.placedAt) / bomb.fuseMs` to compensate. For local co-op mode (non-online), `hostClockOffset` is 0 so it works unchanged.
- **Gameover back button (Bug 3)**: In the gameover screen overlay in `App.tsx` (around line 4494), when `isOnlineCoopRef.current === true`, add a "Back to Lobby" button that calls `cleanupOnline()` then sets screen back to the online coop join screen (specifically back to the "join" tab showing available rooms). The MENU button currently goes to `setScreen("picker")` which is fine for single-player, but online coop guests need to return to the lobby.
- In `levelInit.ts`, initialize `p2TeleportFlashUntil: 0` alongside `teleportFlashUntil: 0`

### Remove
- Nothing removed

## Implementation Plan

1. **types.ts**: Add `p2TeleportFlashUntil: number` and `hostClockOffset?: number` to `GameState` interface
2. **levelInit.ts**: Initialize both `teleportFlashUntil: 0` and `p2TeleportFlashUntil: 0` and `hostClockOffset: 0`
3. **App.tsx (portal flash fix)**: 
   - All places that set `gs.teleportFlashUntil = now + 300` when P1 teleports → keep as is
   - All places that set `gs.teleportFlashUntil = now + 300` when P2 teleports → change to `gs.p2TeleportFlashUntil = now + 300`
   - P2 teleport logic is around lines 1271 and 1293 in App.tsx
4. **renderer.ts (portal flash fix)**: The existing full-screen flash block (`if (now < gs.teleportFlashUntil)`) stays for P1. Remove P2 flash OR make it localized to P2's position rather than full-screen.
5. **webrtcManager or App.tsx (clock offset fix)**: When host pushes state via `serializeGameState`, inject `hostClockOffset: 0` (host's offset is 0). Actually, in App.tsx where host sends state: add `gs.hostClockOffset = 0` before serializing. When guest receives: deserialize, then compute `gs.hostClockOffset = now - (parsed packet's serverNow)`. Add `serverNow: performance.now()` to the serialized packet metadata.
   - Simpler approach: In `App.tsx` host send loop, set `gs.hostSentAt = performance.now()` before serializing. On guest receive, set `gsRef.current.hostClockOffset = now - gs.hostSentAt`. Then in `drawBomb`, use `(now - (gs.hostClockOffset ?? 0) - bomb.placedAt)` for fuse calc.
6. **App.tsx (gameover back button)**: In the gameover screen JSX, add a conditional "Back to Lobby" button when `isOnlineCoopRef.current === true` that calls cleanup and navigates back to online coop lobby screen
