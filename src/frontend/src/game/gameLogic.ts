import {
  DIRS,
  ENEMY_DIR_CHANGE_INTERVAL,
  TILE,
  TILE_BREAKABLE,
  TILE_EMPTY,
  TILE_SOLID,
  randomDir,
  tileCenter,
} from "./constants";
import type { Bomb, EnemyType, GameState, PowerUpType } from "./types";

// ─── Walkability ───────────────────────────────────────────────────────────────
export function isWalkable(
  map: number[][],
  cols: number,
  rows: number,
  tx: number,
  ty: number,
  canPassBreakable = false,
): boolean {
  if (tx < 0 || tx >= cols || ty < 0 || ty >= rows) return false;
  const t = map[ty][tx];
  if (t === TILE_SOLID) return false;
  if (t === TILE_BREAKABLE && !canPassBreakable) return false;
  return true;
}

// ─── Drop Power-Up ─────────────────────────────────────────────────────────────
export function dropPowerUp(gs: GameState, tx: number, ty: number) {
  if (Math.random() >= 0.7) return;
  const { challengeFlags } = gs;
  const hasCurseOnly = challengeFlags.includes("curseOnly");
  const noFireUp = challengeFlags.includes("noFireUp");
  const noBombUp = challengeFlags.includes("noBombUp");

  let type: PowerUpType;
  const roll = Math.random();

  if (hasCurseOnly) {
    if (roll < 0.6) {
      type = "Curse";
    } else {
      const r2 = Math.random();
      if (r2 < 0.3) type = "SpeedUp";
      else if (r2 < 0.6) type = "Shield";
      else type = "Life";
    }
  } else {
    if (roll < 0.1) {
      type = "Curse";
    } else if (roll < 0.18) {
      type = "SpeedDown";
    } else if (roll < 0.36 && !noFireUp) {
      type = "FireUp";
    } else if (roll < 0.5 && !noBombUp) {
      type = "BombUp";
    } else if (roll < 0.65) {
      type = "SpeedUp";
    } else if (roll < 0.8) {
      type = "Shield";
    } else if (roll < 0.85) {
      type = "FuseUp";
    } else if (roll < 0.95) {
      type = "FuseDown";
    } else {
      if (noFireUp && noBombUp) {
        const choices: PowerUpType[] = ["SpeedUp", "Shield", "Life", "Curse"];
        type = choices[Math.floor(Math.random() * choices.length)];
      } else if (noFireUp) {
        const choices: PowerUpType[] = ["BombUp", "SpeedUp", "Shield", "Life"];
        type = choices[Math.floor(Math.random() * choices.length)];
      } else if (noBombUp) {
        const choices: PowerUpType[] = ["FireUp", "SpeedUp", "Shield", "Life"];
        type = choices[Math.floor(Math.random() * choices.length)];
      } else {
        type = "Life";
      }
    }
  }

  const existingIdx = gs.powerUps.findIndex((p) => p.tx === tx && p.ty === ty);
  if (existingIdx === -1) {
    gs.powerUps.push({
      id: gs.powerUpIdCounter++,
      tx,
      ty,
      type,
      droppedAt: Date.now(),
    });
  } else {
    gs.powerUps[existingIdx].droppedAt = Date.now();
  }
}

// ─── Detonate Bomb ─────────────────────────────────────────────────────────────
export function detonateBomb(
  gs: GameState,
  bomb: Bomb,
  now: number,
  visitedIds: Set<number>,
  onLifeLost: () => void,
  onLevelComplete: () => void,
) {
  if (visitedIds.has(bomb.id)) return;
  visitedIds.add(bomb.id);

  gs.bombs = gs.bombs.filter((b) => b.id !== bomb.id);

  const { cols, rows, map } = gs;
  const cells = [{ x: bomb.tx, y: bomb.ty }];

  for (const dir of DIRS) {
    for (let r = 1; r <= bomb.range; r++) {
      const cx = bomb.tx + dir.x * r;
      const cy = bomb.ty + dir.y * r;
      if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) break;
      const t = map[cy][cx];
      if (t === TILE_SOLID) break;
      cells.push({ x: cx, y: cy });
      if (t === TILE_BREAKABLE) {
        map[cy][cx] = TILE_EMPTY;
        gs.score += 10;
        if (
          gs.portalTilePos &&
          gs.portalTilePos.x === cx &&
          gs.portalTilePos.y === cy
        ) {
          gs.portal = { tx: cx, ty: cy, visible: false };
        } else {
          dropPowerUp(gs, cx, cy);
        }
        break;
      }
    }
  }

  gs.explosions.push({
    id: gs.explosionIdCounter++,
    cells,
    startedAt: now,
    bombType: bomb.bombType,
  });

  // Kill/damage player
  const playerInBlast = cells.some(
    (c) => c.x === gs.player.tx && c.y === gs.player.ty,
  );
  if (playerInBlast && gs.player.alive && !gs.player.invincible) {
    if (gs.player.shieldActive) {
      gs.player.shieldActive = false;
      gs.player.shieldTimer = 0;
      gs.player.invincible = true;
      gs.player.invincibleTimer = 3000;
    } else {
      gs.player.lives -= 1;
      if (gs.player.lives <= 0) {
        gs.player.alive = false;
        if (!gs.isMultiplayer || !gs.player2?.alive) {
          gs.status = "gameover";
        }
      } else {
        gs.player.invincible = true;
        gs.player.invincibleTimer = 3000;
        const c = tileCenter(1, 1);
        gs.player.tx = 1;
        gs.player.ty = 1;
        gs.player.px = c.x;
        gs.player.py = c.y;
        gs.player.fromPx = c.x;
        gs.player.fromPy = c.y;
        gs.player.moving = false;
        onLifeLost();
      }
    }
  }

  // Kill enemies
  for (const enemy of gs.enemies) {
    if (!enemy.alive) continue;
    if (
      enemy.type === "bomber" &&
      enemy.ownBombIds &&
      enemy.ownBombIds.includes(bomb.id)
    )
      continue;
    if (enemy.invincibleUntil && enemy.invincibleUntil > now) continue;
    if (cells.some((c) => c.x === enemy.tx && c.y === enemy.ty)) {
      enemy.alive = false;
      gs.score += 50;
      if (gs.timerActive && gs.timerMs !== null) {
        gs.timerMs += 30000;
      }
      // Splitter spawns 2 children
      if (enemy.type === "splitter" && enemy.generation === 0) {
        for (let s = 0; s < 2; s++) {
          const c = tileCenter(enemy.tx, enemy.ty);
          const d = randomDir();
          gs.enemies.push({
            id: gs.enemyIdCounter++,
            tx: enemy.tx,
            ty: enemy.ty,
            px: c.x,
            py: c.y,
            moving: false,
            moveProgress: 0,
            fromPx: c.x,
            fromPy: c.y,
            dx: d.x,
            dy: d.y,
            alive: true,
            dirChangeTimer: ENEMY_DIR_CHANGE_INTERVAL * Math.random(),
            type: "patrol",
            shootTimer: 3000,
            canPassWalls: false,
            generation: 1,
            speed: 2.5,
            bombTimer: 5000,
            ownBombIds: [],
            invincibleUntil: performance.now() + 2500,
          });
        }
      }
      // Splitter2 splits into 2 fast patrol enemies
      if (enemy.type === "splitter2") {
        for (let s = 0; s < 2; s++) {
          const c = tileCenter(enemy.tx, enemy.ty);
          const d = randomDir();
          gs.enemies.push({
            id: gs.enemyIdCounter++,
            tx: enemy.tx + (s === 0 ? 0 : 1),
            ty: enemy.ty,
            px: c.x + (s === 0 ? 0 : TILE),
            py: c.y,
            moving: false,
            moveProgress: 0,
            fromPx: c.x,
            fromPy: c.y,
            dx: d.x,
            dy: d.y,
            alive: true,
            dirChangeTimer: ENEMY_DIR_CHANGE_INTERVAL * Math.random(),
            type: "patrol" as EnemyType,
            shootTimer: 3000,
            canPassWalls: false,
            generation: 1,
            speed: 2.5,
            bombTimer: 5000,
            ownBombIds: [],
            invincibleUntil: performance.now() + 2500,
          });
        }
      }
    }
  }

  // Destroy projectiles in blast
  for (const proj of gs.projectiles) {
    if (
      cells.some((c) => {
        const ptx = Math.floor(proj.px / TILE);
        const pty = Math.floor(proj.py / TILE);
        return c.x === ptx && c.y === pty;
      })
    ) {
      proj.alive = false;
    }
  }

  // Destroy spawners in blast
  for (const spawner of gs.spawners) {
    if (
      spawner.alive &&
      cells.some((c) => c.x === spawner.tx && c.y === spawner.ty)
    ) {
      spawner.alive = false;
      gs.score += 200;
    }
  }

  // Destroy items in blast (500ms protection window)
  gs.powerUps = gs.powerUps.filter((pu) => {
    const inBlast = cells.some((c) => c.x === pu.tx && c.y === pu.ty);
    if (!inBlast) return true;
    const age = Date.now() - (pu.droppedAt ?? 0);
    return age < 500;
  });

  // Chain reaction
  const chainBombs = [...gs.bombs].filter((b) =>
    cells.some((c) => c.x === b.tx && c.y === b.ty),
  );
  for (const cb of chainBombs) {
    detonateBomb(gs, cb, now, visitedIds, onLifeLost, onLevelComplete);
  }

  // Spawn lava fire or ice patches based on bomb type
  const bType = bomb.bombType ?? "normal";
  if (bType === "lava") {
    for (const cell of cells) {
      if (!gs.lavaFires.some((lf) => lf.tx === cell.x && lf.ty === cell.y)) {
        gs.lavaFires.push({
          id: gs.lavaFireIdCounter++,
          tx: cell.x,
          ty: cell.y,
          spawnedAt: now,
        });
      }
    }
  } else if (bType === "freeze") {
    for (const cell of cells) {
      if (!gs.icePatches.some((ip) => ip.tx === cell.x && ip.ty === cell.y)) {
        gs.icePatches.push({
          id: gs.icePatchIdCounter++,
          tx: cell.x,
          ty: cell.y,
          spawnedAt: now,
        });
      }
    }
  }

  // Portal bomb: create teleport portal at bomb origin
  if (bType === "portal") {
    gs.teleportPortals.push({
      id: gs.teleportPortalIdCounter++,
      tx: bomb.tx,
      ty: bomb.ty,
      createdAt: now,
    });
    // Keep only latest 2 portals
    if (gs.teleportPortals.length > 2) {
      gs.teleportPortals.shift();
    }
  }

  // Check if all enemies dead -> show portal
  const alive = gs.enemies.filter((e) => e.alive);
  if (alive.length === 0 && gs.portal) {
    gs.portal.visible = true;
  }
}

// ─── Enemy color by type ──────────────────────────────────────────────────────
export function enemyColor(type: EnemyType): string {
  switch (type) {
    case "patrol":
      return "#ff4d6d";
    case "fast":
      return "#ff8c00";
    case "chaser":
      return "#ff00ff";
    case "wallpasser":
      return "#8b0000";
    case "splitter":
      return "#00ff7f";
    case "shooter":
      return "#9400d3";
    case "bomber":
      return "#cc44ff";
    case "splitter2":
      return "#ff6633";
  }
}
