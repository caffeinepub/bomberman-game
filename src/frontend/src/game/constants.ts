// ─── Game Constants ───────────────────────────────────────────────────────────
export const TILE = 44;
export const BOMB_FUSE = 2000;
export const EXPLOSION_DURATION = 280;
export const ENEMY_DIR_CHANGE_INTERVAL = 1500;
export const PROJECTILE_SPEED = 200;

export const TILE_EMPTY = 0;
export const TILE_SOLID = 1;
export const TILE_BREAKABLE = 2;

export type Vec2 = { x: number; y: number };

export const DIRS: Vec2[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
];

export function randomDir(): Vec2 {
  return DIRS[Math.floor(Math.random() * 4)];
}

export function tileCenter(tx: number, ty: number): Vec2 {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}
