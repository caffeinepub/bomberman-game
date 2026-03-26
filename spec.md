# Bomberman Game

## Current State
Modularized Bomberman game with bomb types: normal, lava, freeze, kick, portal. Level modifiers include conveyorBelts (with a bug: directions can point at walls). Portal bomb player teleport is buggy (player must stand still, enemies work at movement end).

## Requested Changes (Diff)

### Add
- **Surprise bomb type**: New `BombType` value `'surprise'`. When placed, immediately resolves to a random type (normal/lava/freeze/kick/portal) and the bomb visual updates instantly to that resolved type. Player sees it as soon as it's placed.
- **Teleport pads level modifier** (`'teleportPads'`): Colored pad pairs built into the level. Scale: 1 pair at level 16-20, 2 pairs at 21-29, 3 pairs at 30+. Each pair shares a unique color (e.g., cyan/green/orange). Both player and enemies teleport instantly when stepping on a pad. Works identically to portal bomb teleport logic.

### Modify
- **Portal bomb player fix**: Move the player teleport portal check inside the movement completion block (same as enemy logic), so it fires the moment the player arrives on a portal tile -- not just when standing still.
- **Conveyor belt direction fix**: During level generation, each conveyor belt tile must only be assigned a direction that points to an empty tile or a breakable wall tile -- never toward a solid wall or map border.

### Remove
- Nothing removed.

## Implementation Plan

1. **types.ts**: Add `'surprise'` to `BombType`. Add `'teleportPads'` to `LevelModifier`. Add `TeleportPad` interface `{ id, tx, ty, pairId }`. Add `teleportPads: TeleportPad[]` and `teleportPadIdCounter: number` to `GameState`.

2. **levelConfig.ts**: Add `'teleportPads'` to the modifier pool starting from level 16.

3. **levelInit.ts**: 
   - When modifier is `'teleportPads'`, generate 1-3 pairs of pads on empty tiles (avoid player start area). Each pair gets a pairId (0,1,2).
   - Fix conveyor belt tile placement: only accept directions where `(tx+dir.x, ty+dir.y)` is `TILE_EMPTY` or `TILE_BREAKABLE` (not TILE_SOLID and not out of bounds). Try all 4 directions until one works; skip tile if none work.
   - Initialize `teleportPads: []` and `teleportPadIdCounter: 0` in returned state.

4. **App.tsx**:
   - Bomb placement: if `player.bombType === 'surprise'`, pick a random type from `['normal','lava','freeze','kick','portal']` and assign that to the bomb's `bombType` field (not the player's type).
   - Portal bomb player fix: inside `if (player.moving)` block after `player.moving = false`, add the teleport portal check (identical logic to enemy teleport).
   - Teleport pads: after player finishes moving to a tile, check if that tile has a teleport pad; if so, instantly warp to the partner pad. Same check for enemies after their movement completes.

5. **renderer.ts**: 
   - Draw teleport pads as colored circles on floor (pairId 0=cyan, 1=lime, 2=orange), with a subtle glow/ring.
   - Surprise bomb: the bomb is drawn using its resolved type color (since it resolves immediately on placement, it always shows the resolved type).
