# Bomberman Game — Co-op Bug Fixes

## Current State
Local co-op mode exists with P1 (arrows+RCtrl) and P2 (WASD+Tab). The previous build attempted to fix 4 bugs but none were resolved.

## Requested Changes (Diff)

### Add
- P2 teleportation when P2's bomb detonates under `cursedBomb` level modifier (currently only P1 is teleported)
- P2 handling for conveyor belt push and gravity zone pull (currently these only affect P1)
- P2 handling for trap tile triggering (currently only P1 triggers traps)

### Modify
1. **Game over logic**: When P1 dies (lives=0, alive=false) in co-op, game must NOT end if P2 still has lives. Every single `setGameStatus("gameover")` / `gs.status = "gameover"` call related to P1 death must check `!gs.isMultiplayer || !gs.player2?.alive`. If P1 is dead and P2 is alive, continue game.

2. **Tab/P2 bomb placement**: The Tab key handler calls `placeP2Bomb(gs)` which places bomb at `p2.tx, p2.ty` using P2 stats. Verify this works — ensure `gs.player2` is not null/undefined when Tab is pressed, the bomb uses P2.explosionRange, P2.bombFuseLevel, P2.bombType, and `placedByP2: true`.

3. **HUD bomb type text**: In co-op HUD, both P1 and P2 panels should show the current bomb type as TEXT for ALL bomb types:
   - Normal: show nothing (or "⬜ Normal")
   - Lava: "🔴 Lava Bomb"
   - Freeze: "🔵 Freeze Bomb"
   - Kick: "🟡 Kick Bomb"
   - Portal: "🟣 Portal Bomb"
   - Surprise: "❓ Random Bomb"
   The text must be VISIBLE — check that `displayBombType` and `displayBombTypeP2` state are being updated every tick.

4. **Curses affect both players**: 
   - `cursedBomb` modifier: when ANY bomb (P1 or P2) detonates, the OWNER of that bomb (P1 or P2) gets teleported with 20% chance, not just P1
   - Curse item pickup by P2: already handled, verify it works
   - SpeedDown item pickup by P2: already handled, verify it works

### Remove
- Nothing removed

## Implementation Plan

1. **Audit all P1 death → game over paths in App.tsx**: Find every `gs.status = "gameover"` that is triggered by P1 taking damage. Add the check: `if (!gs.isMultiplayer || !gs.player2?.alive)` before each gameover set. The exact pattern to look for and fix:
   - Any block where `player.lives -= 1` leads to `player.alive = false` then immediately to `gs.status = "gameover"` without checking P2 alive state
   - Make the guard consistent: always use `if (!gs.isMultiplayer || !gs.player2?.alive)` before setting gameover for P1 death

2. **Tab bomb fix**: In `placeP2Bomb`, add defensive check — if `gs.player2` is null or `gs.isMultiplayer` is false, return early. Ensure bomb is placed at `gs.player2.tx, gs.player2.ty`. Add explicit `placedByP2: true` and verify bomb count filter works.

3. **HUD text fix**: Find the co-op HUD render (P1 panel left, P2 panel right). Make bomb type text always visible when type is not "normal". Ensure the text shows the full label like "Lava Bomb" not just an emoji dot. Also ensure `setDisplayBombType` and `setDisplayBombTypeP2` are called every tick in the `// Update display` section.

4. **Cursed bomb P2**: After the existing `wasPlayerBombs` cursed bomb block for P1, add a parallel block for P2:
   - `const wasP2Bombs = readyBombs.filter(b => b.placedByP2)`
   - If `gs.cursedBombActive && wasP2Bombs.length > 0 && gs.player2?.alive && Math.random() < 0.2` → teleport P2 to random open tile

5. **Conveyor belts P2**: Inside the `conveyorBelts` modifier block, after pushing P1, add a block to push P2 if `gs.isMultiplayer && gs.player2?.alive && !gs.player2.moving`.

6. **Gravity zones P2**: Inside the `gravityZones` modifier block, after pulling P1, add a block to pull P2 if `gs.isMultiplayer && gs.player2?.alive && !gs.player2.moving`.

7. **Trap tiles P2**: Inside trap tile block, after checking P1 stepping on trap, add check for P2 stepping on trap. Also apply P2 damage on trap explosion.
