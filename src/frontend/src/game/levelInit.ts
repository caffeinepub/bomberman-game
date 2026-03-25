import { DIRS, TILE_BREAKABLE, TILE_EMPTY, tileCenter } from "./constants";
import type { Vec2 } from "./constants";
import { randomDir } from "./constants";
import {
  assignChallengeFlags,
  assignLevelModifier,
  getLevelConfig,
  getTimerForLevel,
} from "./levelConfig";
import { buildMap, makeEnemies } from "./mapBuilder";
import type {
  ConveyorTile,
  GameState,
  GravityZone,
  MirrorTile,
  Player,
  PowerUp,
  Spawner,
  StickyTile,
  TrapTile,
} from "./types";

// ─── Init / Level ─────────────────────────────────────────────────────────────
export function makePlayer(prevPlayer?: Player): Player {
  const c = tileCenter(1, 1);
  return {
    tx: 1,
    ty: 1,
    px: c.x,
    py: c.y,
    moving: false,
    moveProgress: 0,
    fromPx: c.x,
    fromPy: c.y,
    alive: true,
    lives: prevPlayer ? prevPlayer.lives : 3,
    maxBombs: 1,
    explosionRange: 2,
    speedMultiplier: 1,
    shieldActive: false,
    shieldTimer: 0,
    invincible: false,
    invincibleTimer: 0,
    bombFuseLevel: 0,
    bombType: prevPlayer ? prevPlayer.bombType : "normal",
    mirrorUntil: 0,
  };
}

export function initLevel(
  cols: number,
  rows: number,
  level: number,
  prevPlayer?: Player,
): GameState {
  const config = getLevelConfig(level);
  const { map, portalTilePos } = buildMap(cols, rows, level);
  const player = makePlayer(prevPlayer);
  const enemies = makeEnemies(cols, rows, config, 0);
  const levelModifier = assignLevelModifier(level);
  const challengeFlags = assignChallengeFlags(level);
  const timerMs = getTimerForLevel(level);
  const windDir = levelModifier === "windy" ? randomDir() : null;

  const spawners: Spawner[] = [];
  if (level >= 15 && (level - 5) % 10 === 0) {
    const candidates: Vec2[] = [];
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        if (map[ty][tx] !== TILE_BREAKABLE) continue;
        if (portalTilePos && portalTilePos.x === tx && portalTilePos.y === ty)
          continue;
        if (tx <= 2 && ty <= 2) continue;
        candidates.push({ x: tx, y: ty });
      }
    }
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      map[pick.y][pick.x] = TILE_EMPTY;
      spawners.push({
        id: 0,
        tx: pick.x,
        ty: pick.y,
        nextSpawnAt: performance.now() + 30000,
        alive: true,
      });
    }
  }

  const spawnerPos =
    spawners.length > 0 ? { x: spawners[0].tx, y: spawners[0].ty } : null;
  const bombTypeBreakables: Vec2[] = [];
  for (let bty = 1; bty < rows - 1; bty++) {
    for (let btx = 1; btx < cols - 1; btx++) {
      if (map[bty][btx] !== TILE_BREAKABLE) continue;
      if (portalTilePos && portalTilePos.x === btx && portalTilePos.y === bty)
        continue;
      if (spawnerPos && spawnerPos.x === btx && spawnerPos.y === bty) continue;
      bombTypeBreakables.push({ x: btx, y: bty });
    }
  }
  let bombTypeTilePos: Vec2 | null = null;
  if (bombTypeBreakables.length > 0) {
    bombTypeTilePos =
      bombTypeBreakables[Math.floor(Math.random() * bombTypeBreakables.length)];
  }

  let powerUpIdStart = 0;
  const initialPowerUps: PowerUp[] = [];
  if (bombTypeTilePos) {
    initialPowerUps.push({
      id: powerUpIdStart++,
      tx: bombTypeTilePos.x,
      ty: bombTypeTilePos.y,
      type: "BombType",
      droppedAt: Date.now(),
    });
  }

  // Collect empty floor tiles for modifier placement
  const emptyTiles: Vec2[] = [];
  for (let ty = 1; ty < rows - 1; ty++) {
    for (let tx = 1; tx < cols - 1; tx++) {
      if (map[ty][tx] !== TILE_EMPTY) continue;
      if (tx <= 2 && ty <= 2) continue; // avoid player start area
      emptyTiles.push({ x: tx, y: ty });
    }
  }
  const shuffleEmpty = [...emptyTiles].sort(() => Math.random() - 0.5);

  // Trap Tiles
  const trapTiles: TrapTile[] = [];
  let trapTileIdCounter = 0;
  if (levelModifier === "trapTiles") {
    const count = 3 + Math.floor(Math.random() * 3); // 3-5
    for (let i = 0; i < count && i < shuffleEmpty.length; i++) {
      trapTiles.push({
        id: trapTileIdCounter++,
        tx: shuffleEmpty[i].x,
        ty: shuffleEmpty[i].y,
        triggered: false,
        triggeredAt: 0,
      });
    }
  }

  // Conveyor Tiles (~5% of empty tiles)
  const conveyorTiles: ConveyorTile[] = [];
  if (levelModifier === "conveyorBelts") {
    const count = Math.max(3, Math.floor(emptyTiles.length * 0.05));
    const conveyorShuffle = [...emptyTiles].sort(() => Math.random() - 0.5);
    for (let i = 0; i < count && i < conveyorShuffle.length; i++) {
      conveyorTiles.push({
        tx: conveyorShuffle[i].x,
        ty: conveyorShuffle[i].y,
        dir: DIRS[Math.floor(Math.random() * 4)],
      });
    }
  }

  // Gravity Zones (2-3)
  const gravityZones: GravityZone[] = [];
  if (levelModifier === "gravityZones") {
    const count = 2 + Math.floor(Math.random() * 2);
    const gravityShuffle = [...emptyTiles].sort(() => Math.random() - 0.5);
    for (let i = 0; i < count && i < gravityShuffle.length; i++) {
      gravityZones.push({
        tx: gravityShuffle[i].x,
        ty: gravityShuffle[i].y,
      });
    }
  }

  // Mirror Tiles (3-4)
  const mirrorTiles: MirrorTile[] = [];
  if (levelModifier === "mirrorTiles") {
    const count = 3 + Math.floor(Math.random() * 2);
    const mirrorShuffle = [...emptyTiles].sort(() => Math.random() - 0.5);
    for (let i = 0; i < count && i < mirrorShuffle.length; i++) {
      mirrorTiles.push({
        tx: mirrorShuffle[i].x,
        ty: mirrorShuffle[i].y,
      });
    }
  }

  // Sticky Tiles (~8%)
  const stickyTiles: StickyTile[] = [];
  if (levelModifier === "stickyFloor") {
    const count = Math.max(3, Math.floor(emptyTiles.length * 0.08));
    const stickyShuffle = [...emptyTiles].sort(() => Math.random() - 0.5);
    for (let i = 0; i < count && i < stickyShuffle.length; i++) {
      stickyTiles.push({
        tx: stickyShuffle[i].x,
        ty: stickyShuffle[i].y,
      });
    }
  }

  return {
    cols,
    rows,
    map,
    player,
    enemies,
    bombs: [],
    explosions: [],
    powerUps: initialPowerUps,
    portal: null,
    portalTilePos,
    projectiles: [],
    score: 0,
    level,
    status: "playing",
    bombIdCounter: 0,
    explosionIdCounter: 0,
    powerUpIdCounter: powerUpIdStart,
    projectileIdCounter: 0,
    enemyIdCounter: enemies.length,
    lastTime: 0,
    levelModifier,
    challengeFlags,
    timerMs,
    timerActive: timerMs !== null,
    fillPhase: 0,
    fillTimer: 0,
    windDir,
    lavaTiles: new Set<string>(),
    spawners,
    lavaFires: [],
    icePatches: [],
    lavaFireIdCounter: 0,
    icePatchIdCounter: 0,
    lavaDamageCooldown: new Map<string, number>(),
    bombTypeItemPlaced: bombTypeTilePos !== null,
    // New modifier fields
    trapTiles,
    trapTileIdCounter,
    conveyorTiles,
    gravityZones,
    gravityPullTimer: 2000,
    mirrorTiles,
    stickyTiles,
    lastShrinkAt: performance.now(),
    shrinkCount: 0,
    cursedBombActive: levelModifier === "cursedBomb",
    teleportFlashUntil: 0,
    teleportPortals: [],
    teleportPortalIdCounter: 0,
  };
}
