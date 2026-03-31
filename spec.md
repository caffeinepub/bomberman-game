# Bomberman Game

## Current State
Local co-op mode is functional with two players on the same keyboard. P1 uses Arrow keys + Right Ctrl, P2 uses WASD + Tab. Each has separate HUD, 3 lives, and separate item pickups.

## Requested Changes (Diff)

### Add
- Text labels for bomb types in both P1 and P2 HUDs (alongside the colored dot emojis)
- Curse item effect handling in P2 pickup switch case
- Mirror tile effect applied to P2

### Modify
- All P1 death paths that call `gs.status = "gameover"` must check `gs.isMultiplayer && gs.player2?.alive` -- if P2 is still alive in co-op, do NOT set gameover; just mark P1 dead
- Tab key handler must ensure bomb is placed at P2's position, not P1's (verify placeP2Bomb uses p2.tx/p2.ty correctly and that Tab does not accidentally trigger P1 bomb)
- HUD bomb type display: currently shows only emoji dot (🔴🔵🟡❓🟣); change to also show text label like "Lava", "Freeze", "Kick", "Random", "Portal" next to the dot
- P2 pickup switch: add `case "Curse"` that reduces P2 speedMultiplier and explosionRange, same as P1
- Mirror tiles: apply `p2.mirrorUntil` when P2 steps on a mirror tile (P2 movement input uses p2KeyOrderRef, needs mirroring too)

### Remove
- Nothing removed

## Implementation Plan

1. **Fix game-over in co-op**: Search all places where `gs.status = "gameover"` is set for the `player` (P1) object (there are ~13 such spots). In each, add a guard: `if (gs.isMultiplayer && gs.player2?.alive) { /* just leave player dead, don't set gameover */ } else { gs.status = "gameover"; setGameStatus("gameover"); ... }`. The player should just have `player.alive = false` set and the game should continue with P2.

2. **Tab bomb fix**: The `placeP2Bomb` function already uses `gs.player2.tx/ty`, so this should be correct. However ensure `e.code === "Tab"` does NOT also fall into any P1 bomb logic. The Tab key's `e.key` is `"Tab"`, not `" "` or `"Control"`, so P1 bomb shouldn't trigger. Double-check by looking at key handlers. The actual issue may be that `p2.tx/p2.ty` defaults to same as P1 (both start at 1,1) at level start -- verify levelInit sets both at tile (1,1) and that positions diverge correctly during play.

3. **HUD bomb type text**: In both P1 and P2 HUD sections, the bomb type display currently renders only an emoji (🔴/🔵/🟡/❓/🟣). Change it to also render a text label: "Lava" / "Freeze" / "Kick" / "Random" / "Portal" in the same colored span. The single-player HUD (bottom section) also needs this fix.

4. **P2 curse item**: In the P2 pickup switch (around line 957), add:
```
case "Curse":
  p2.speedMultiplier = Math.max(p2.speedMultiplier - 0.3, 0.5);
  p2.explosionRange = Math.max(p2.explosionRange - 1, 1);
  gs.score = Math.max(gs.score - 10, 0);
  setDisplayCurseFlash(true);
  setTimeout(() => setDisplayCurseFlash(false), 1500);
  break;
case "SpeedDown":
  p2.speedMultiplier = Math.max(p2.speedMultiplier - 0.3, 0.3);
  setDisplayCurseFlash(true);
  setTimeout(() => setDisplayCurseFlash(false), 1500);
  break;
```
(Note SpeedDown may already be there but Curse is missing)

5. **P2 mirror tiles**: In the mirror tiles section (around line 1711), add a check for P2:
```
if (gs.isMultiplayer && gs.player2?.alive) {
  if (gs.player2.tx === mt.tx && gs.player2.ty === mt.ty && now > gs.player2.mirrorUntil) {
    gs.player2.mirrorUntil = now + 3000;
  }
}
```
Then in P2 movement input (around line 888 where p2ActiveKey is used), apply mirror logic:
```
const p2Mirrored = now < p2.mirrorUntil;
// For KeyA/KeyD, swap if mirrored:
const p2DirMap: Record<string, { dx: number; dy: number }> = {
  KeyW: { dx: 0, dy: -1 },
  KeyS: { dx: 0, dy: 1 },
  KeyA: p2Mirrored ? { dx: 1, dy: 0 } : { dx: -1, dy: 0 },
  KeyD: p2Mirrored ? { dx: -1, dy: 0 } : { dx: 1, dy: 0 },
};
```
