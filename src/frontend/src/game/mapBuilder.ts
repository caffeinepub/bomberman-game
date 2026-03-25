import {
  ENEMY_DIR_CHANGE_INTERVAL,
  TILE_BREAKABLE,
  TILE_EMPTY,
  TILE_SOLID,
  randomDir,
  tileCenter,
} from "./constants";
import type { Vec2 } from "./constants";
import type { LevelConfig } from "./levelConfig";
import { enemySpeed } from "./levelConfig";
import type { Enemy } from "./types";

// ─── Map Building ─────────────────────────────────────────────────────────────
export function buildMap(
  cols: number,
  rows: number,
  level: number,
): { map: number[][]; portalTilePos: Vec2 | null } {
  const density = Math.min(0.35 + (level - 1) * 0.04, 0.7);
  const map: number[][] = [];

  for (let row = 0; row < rows; row++) {
    map[row] = [];
    for (let col = 0; col < cols; col++) {
      if (row === 0 || row === rows - 1 || col === 0 || col === cols - 1) {
        map[row][col] = TILE_SOLID;
      } else if (row % 2 === 0 && col % 2 === 0) {
        map[row][col] = TILE_SOLID;
      } else {
        map[row][col] = Math.random() < density ? TILE_BREAKABLE : TILE_EMPTY;
      }
    }
  }

  const safeZones: Vec2[] = [
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 1, y: 2 },
    { x: 3, y: 1 },
    { x: 1, y: 3 },
    { x: cols - 2, y: rows - 2 },
    { x: cols - 3, y: rows - 2 },
    { x: cols - 2, y: rows - 3 },
    { x: cols - 2, y: 1 },
    { x: cols - 3, y: 1 },
    { x: cols - 2, y: 2 },
    { x: 1, y: rows - 2 },
    { x: 2, y: rows - 2 },
    { x: 1, y: rows - 3 },
  ];
  for (const { x, y } of safeZones) {
    if (x >= 0 && x < cols && y >= 0 && y < rows) map[y][x] = TILE_EMPTY;
  }

  const breakables: Vec2[] = [];
  for (let row = 1; row < rows - 1; row++) {
    for (let col = 1; col < cols - 1; col++) {
      if (map[row][col] === TILE_BREAKABLE) {
        const isSafe = safeZones.some((s) => s.x === col && s.y === row);
        if (!isSafe) breakables.push({ x: col, y: row });
      }
    }
  }

  let portalTilePos: Vec2 | null = null;
  if (breakables.length > 0) {
    portalTilePos = breakables[Math.floor(Math.random() * breakables.length)];
  }

  return { map, portalTilePos };
}

// ─── Enemy Spawning ───────────────────────────────────────────────────────────
export function makeEnemies(
  cols: number,
  rows: number,
  config: LevelConfig,
  startId: number,
): Enemy[] {
  const positions: Vec2[] = [
    { x: cols - 2, y: rows - 2 },
    { x: cols - 2, y: 1 },
    { x: 1, y: rows - 2 },
    { x: Math.floor(cols / 2), y: Math.floor(rows / 2) },
    { x: cols - 4, y: 3 },
    { x: 3, y: rows - 4 },
    { x: Math.floor(cols / 3), y: 3 },
    { x: cols - 4, y: rows - 4 },
  ];

  const enemies: Enemy[] = [];
  for (let i = 0; i < config.enemyCount; i++) {
    const pos = positions[i % positions.length];
    const type = config.enemyTypes[i % config.enemyTypes.length];
    const c = tileCenter(pos.x, pos.y);
    const d = randomDir();
    enemies.push({
      id: startId + i,
      tx: pos.x,
      ty: pos.y,
      px: c.x,
      py: c.y,
      moving: false,
      moveProgress: 0,
      fromPx: c.x,
      fromPy: c.y,
      dx: d.x,
      dy: d.y,
      alive: true,
      dirChangeTimer: ENEMY_DIR_CHANGE_INTERVAL * (0.5 + Math.random()),
      type,
      shootTimer: 3000 * (0.5 + Math.random()),
      canPassWalls: type === "wallpasser",
      generation: 0,
      speed: enemySpeed(type),
      bombTimer: 5000,
      ownBombIds: [],
      bombRange: type === "bomber" ? 2 : undefined,
      bombInterval: type === "bomber" ? 5000 : undefined,
    });
  }
  return enemies;
}
