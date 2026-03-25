import type { ChallengeFlag, EnemyType, LevelModifier } from "./types";

// ─── Level Config ─────────────────────────────────────────────────────────────
export interface LevelConfig {
  enemyCount: number;
  enemyTypes: EnemyType[];
  themeName: string;
}

export function getLevelConfig(level: number): LevelConfig {
  if (level === 1)
    return {
      enemyCount: 2,
      enemyTypes: ["patrol", "patrol"],
      themeName: "grasslands",
    };
  if (level === 2)
    return {
      enemyCount: 3,
      enemyTypes: ["fast", "fast", "patrol"],
      themeName: "desert",
    };
  if (level === 3)
    return {
      enemyCount: 4,
      enemyTypes: ["chaser", "chaser", "fast", "patrol"],
      themeName: "ice",
    };
  if (level === 4)
    return {
      enemyCount: 5,
      enemyTypes: ["wallpasser", "wallpasser", "chaser", "fast", "patrol"],
      themeName: "lava",
    };
  const extra = level - 5;
  const types: EnemyType[] =
    level >= 11
      ? ["splitter", "splitter2", "shooter", "chaser", "wallpasser", "fast"]
      : ["shooter", "chaser", "wallpasser", "fast"];
  const count = 6 + extra;
  const enemyTypes: EnemyType[] = [];
  for (let i = 0; i < count; i++) enemyTypes.push(types[i % types.length]);
  if (level % 10 === 0) {
    enemyTypes.push("bomber");
  }
  const finalCount = enemyTypes.length;
  return { enemyCount: finalCount, enemyTypes, themeName: "space" };
}

export function enemySpeed(type: EnemyType): number {
  switch (type) {
    case "patrol":
      return 2.0;
    case "fast":
      return 3.5;
    case "chaser":
      return 2.5;
    case "wallpasser":
      return 2.0;
    case "splitter":
      return 1.8;
    case "shooter":
      return 1.5;
    case "bomber":
      return 1.5;
    case "splitter2":
      return 2.2;
  }
}

export function getTimerForLevel(level: number): number | null {
  if (level % 3 !== 0) return null;
  const cycle = Math.floor(level / 3);
  return Math.max(20000, 60000 - (cycle - 1) * 3000);
}

export function assignLevelModifier(level: number): LevelModifier {
  if (level <= 4) return null;

  // Build weighted pool based on level
  const pool: LevelModifier[] = [null, null, null]; // base nulls for weight

  // Classic modifiers (reduced frequency ~40%)
  if (level >= 5) {
    pool.push(null); // extra null weight
    pool.push("windy");
    if (Math.random() < 0.6) pool.push("fogOfWar");
    if (Math.random() < 0.6) pool.push("dark");
  }

  // New modifiers unlock at different levels
  if (level >= 5) pool.push("trapTiles");
  if (level >= 8) pool.push("conveyorBelts");
  if (level >= 10) pool.push("stickyFloor");
  if (level >= 12) {
    pool.push("gravityZones");
    pool.push("mirrorTiles");
  }
  if (level >= 18) pool.push("shrinkingArena");
  if (level >= 20) pool.push("cursedBomb");

  return pool[Math.floor(Math.random() * pool.length)];
}

export function assignChallengeFlags(level: number): ChallengeFlag[] {
  if (level < 7) return [];
  const isTimed = getTimerForLevel(level) !== null;
  const all: ChallengeFlag[] = isTimed
    ? ["noBombUp", "noFireUp"]
    : ["noBombUp", "noFireUp", "curseOnly"];
  const shuffled = [...all].sort(() => Math.random() - 0.5);
  if (level >= 10) return shuffled.slice(0, 2);
  return shuffled.slice(0, 1);
}
