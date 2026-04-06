import type { Vec2 } from "./constants";

export type PowerUpType =
  | "FireUp"
  | "BombUp"
  | "SpeedUp"
  | "Shield"
  | "Life"
  | "Curse"
  | "FuseUp"
  | "FuseDown"
  | "BombType"
  | "SpeedDown";
export type BombType =
  | "normal"
  | "lava"
  | "freeze"
  | "kick"
  | "portal"
  | "surprise";
export type EnemyType =
  | "patrol"
  | "fast"
  | "chaser"
  | "wallpasser"
  | "splitter"
  | "shooter"
  | "bomber"
  | "splitter2";
export type GameStatus = "playing" | "gameover" | "levelcomplete" | "win";
export type Screen = "picker" | "game";
export type LevelModifier =
  | "fogOfWar"
  | "windy"
  | "dark"
  | "trapTiles"
  | "conveyorBelts"
  | "gravityZones"
  | "mirrorTiles"
  | "stickyFloor"
  | "shrinkingArena"
  | "cursedBomb"
  | "teleportPads"
  | null;
export type ChallengeFlag = "noBombUp" | "noFireUp" | "curseOnly";

export interface TrapTile {
  id: number;
  tx: number;
  ty: number;
  triggered: boolean;
  triggeredAt: number;
}

export interface ConveyorTile {
  tx: number;
  ty: number;
  dir: Vec2;
}

export interface GravityZone {
  tx: number;
  ty: number;
}

export interface MirrorTile {
  tx: number;
  ty: number;
}

export interface StickyTile {
  tx: number;
  ty: number;
}

export interface Player {
  tx: number;
  ty: number;
  px: number;
  py: number;
  moving: boolean;
  moveProgress: number;
  fromPx: number;
  fromPy: number;
  alive: boolean;
  lives: number;
  maxBombs: number;
  explosionRange: number;
  speedMultiplier: number;
  shieldActive: boolean;
  shieldTimer: number;
  invincible: boolean;
  invincibleTimer: number;
  bombFuseLevel: number;
  bombType: BombType;
  mirrorUntil: number;
}

export interface Enemy {
  id: number;
  tx: number;
  ty: number;
  px: number;
  py: number;
  moving: boolean;
  moveProgress: number;
  fromPx: number;
  fromPy: number;
  dx: number;
  dy: number;
  alive: boolean;
  dirChangeTimer: number;
  type: EnemyType;
  shootTimer: number;
  canPassWalls: boolean;
  generation: number;
  speed: number;
  bombTimer: number;
  ownBombIds: number[];
  invincibleUntil?: number;
  bombRange?: number;
  bombInterval?: number;
}

export interface Bomb {
  id: number;
  tx: number;
  ty: number;
  placedAt: number;
  range: number;
  hasDrifted: boolean;
  fuseMs: number;
  bombType: BombType;
  placedByP2?: boolean;
  // Kick bomb sliding
  sliding?: boolean;
  slideDx?: number;
  slideDy?: number;
  slideProgress?: number;
  slideFromTx?: number;
  slideFromTy?: number;
}

export interface Explosion {
  id: number;
  cells: Vec2[];
  startedAt: number;
  bombType: BombType;
}

export interface PowerUp {
  id: number;
  tx: number;
  ty: number;
  type: PowerUpType;
  droppedAt: number;
}

export interface Portal {
  tx: number;
  ty: number;
  visible: boolean;
}

/** Teleport pads (level modifier) */
export interface TeleportPad {
  id: number;
  tx: number;
  ty: number;
  pairId: number;
}

/** Teleport portal left by portal bombs (different from the level-exit Portal) */
export interface TeleportPortal {
  id: number;
  tx: number;
  ty: number;
  createdAt: number;
}

export interface Projectile {
  id: number;
  px: number;
  py: number;
  dx: number;
  dy: number;
  speed: number;
  alive: boolean;
}

export interface Spawner {
  id: number;
  tx: number;
  ty: number;
  nextSpawnAt: number;
  alive: boolean;
}

export interface LavaFire {
  id: number;
  tx: number;
  ty: number;
  spawnedAt: number;
}

export interface IcePatch {
  id: number;
  tx: number;
  ty: number;
  spawnedAt: number;
}

export interface GameState {
  cols: number;
  rows: number;
  map: number[][];
  player: Player;
  player2: Player | null;
  sharedLives: number;
  isMultiplayer: boolean;
  enemies: Enemy[];
  bombs: Bomb[];
  explosions: Explosion[];
  powerUps: PowerUp[];
  portal: Portal | null;
  portalTilePos: Vec2 | null;
  projectiles: Projectile[];
  score: number;
  level: number;
  status: GameStatus;
  bombIdCounter: number;
  explosionIdCounter: number;
  powerUpIdCounter: number;
  projectileIdCounter: number;
  enemyIdCounter: number;
  lastTime: number;
  levelModifier: LevelModifier;
  challengeFlags: ChallengeFlag[];
  timerMs: number | null;
  timerActive: boolean;
  fillPhase: number;
  fillTimer: number;
  windDir: Vec2 | null;
  lavaTiles: Set<string>;
  spawners: Spawner[];
  lavaFires: LavaFire[];
  icePatches: IcePatch[];
  lavaFireIdCounter: number;
  icePatchIdCounter: number;
  lavaDamageCooldown: Map<string, number>;
  bombTypeItemPlaced: boolean;
  // Modifier fields
  trapTiles: TrapTile[];
  trapTileIdCounter: number;
  conveyorTiles: ConveyorTile[];
  gravityZones: GravityZone[];
  gravityPullTimer: number;
  mirrorTiles: MirrorTile[];
  stickyTiles: StickyTile[];
  lastShrinkAt: number;
  shrinkCount: number;
  cursedBombActive: boolean;
  teleportFlashUntil: number;
  p2TeleportFlashUntil: number;
  hostClockOffset: number;
  // Portal bomb teleport portals
  teleportPortals: TeleportPortal[];
  teleportPortalIdCounter: number;
  // Teleport pads (level modifier)
  teleportPads: TeleportPad[];
  teleportPadIdCounter: number;
}
