import { Button } from "@/components/ui/button";
import { useActor } from "@/hooks/useActor";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const COLS = 13;
const ROWS = 11;
const TILE = 48;
const CANVAS_W = COLS * TILE;
const CANVAS_H = ROWS * TILE;

const TILE_EMPTY = 0;
const TILE_SOLID = 1;
const TILE_BREAKABLE = 2;

const BASE_PLAYER_SPEED = 4;
const ENEMY_SPEED = 2;
const BOMB_FUSE = 2000;
const EXPLOSION_DURATION = 500;
const BASE_EXPLOSION_RANGE = 2;
const ENEMY_DIR_CHANGE_INTERVAL = 1500;

const POWERUP_DROP_CHANCE = 0.3;

const C = {
  floor: "#0d1117",
  floorAlt: "#0f1520",
  solid: "#1a2a1a",
  solidEdge: "#2d4a2d",
  breakable: "#3a2a0d",
  breakableEdge: "#8a5a20",
  player: "#7fffb0",
  playerDark: "#1a5530",
  enemy: "#ff4d6d",
  enemyDark: "#5c0e1e",
  bomb: "#e8e8e8",
  bombFuse: "#ff9500",
  explosionCore: "#ffffff",
  explosionMid: "#ffcc00",
  explosionOuter: "#ff4500",
  overlay: "rgba(5,8,15,0.82)",
  winText: "#7fffb0",
  loseText: "#ff4d6d",
  uiText: "#c8e6c9",
  grid: "rgba(255,255,255,0.025)",
  powerupFireUp: "#ff6b35",
  powerupBombUp: "#c084fc",
  powerupSpeedUp: "#38bdf8",
};

// ─── Types ────────────────────────────────────────────────────────────────────
type GameStatus = "playing" | "gameover" | "win";
type PowerUpType = "FireUp" | "BombUp" | "SpeedUp";

interface Vec2 {
  x: number;
  y: number;
}

interface Player {
  tx: number;
  ty: number;
  px: number;
  py: number;
  moving: boolean;
  moveProgress: number;
  fromPx: number;
  fromPy: number;
  alive: boolean;
  // power-up stats
  maxBombs: number;
  explosionRange: number;
  speedMultiplier: number;
}

interface Enemy {
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
}

interface Bomb {
  id: number;
  tx: number;
  ty: number;
  placedAt: number;
  range: number;
}

interface Explosion {
  id: number;
  cells: Vec2[];
  startedAt: number;
}

interface PowerUp {
  id: number;
  tx: number;
  ty: number;
  type: PowerUpType;
}

interface GameState {
  map: number[][];
  player: Player;
  enemies: Enemy[];
  bombs: Bomb[];
  explosions: Explosion[];
  powerUps: PowerUp[];
  score: number;
  status: GameStatus;
  bombIdCounter: number;
  explosionIdCounter: number;
  powerUpIdCounter: number;
  lastTime: number;
}

// ─── Map helpers ──────────────────────────────────────────────────────────────
function tileCenter(tx: number, ty: number): Vec2 {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

function buildMap(): number[][] {
  const map: number[][] = [];
  for (let row = 0; row < ROWS; row++) {
    map[row] = [];
    for (let col = 0; col < COLS; col++) {
      if (row === 0 || row === ROWS - 1 || col === 0 || col === COLS - 1) {
        map[row][col] = TILE_SOLID;
      } else if (row % 2 === 0 && col % 2 === 0) {
        map[row][col] = TILE_SOLID;
      } else {
        map[row][col] = TILE_EMPTY;
      }
    }
  }
  for (let row = 1; row < ROWS - 1; row++) {
    for (let col = 1; col < COLS - 1; col++) {
      if (map[row][col] === TILE_EMPTY && Math.random() < 0.4) {
        map[row][col] = TILE_BREAKABLE;
      }
    }
  }
  const safeZones: [number, number][] = [
    [1, 1],
    [2, 1],
    [1, 2],
    [11, 9],
    [10, 9],
    [11, 8],
    [11, 1],
    [10, 1],
    [11, 2],
    [1, 9],
    [2, 9],
    [1, 8],
    [9, 7],
    [8, 7],
    [9, 6],
  ];
  for (const [col, row] of safeZones) {
    if (col >= 0 && col < COLS && row >= 0 && row < ROWS)
      map[row][col] = TILE_EMPTY;
  }
  return map;
}

function makePlayer(): Player {
  const { x, y } = tileCenter(1, 1);
  return {
    tx: 1,
    ty: 1,
    px: x,
    py: y,
    moving: false,
    moveProgress: 0,
    fromPx: x,
    fromPy: y,
    alive: true,
    maxBombs: 1,
    explosionRange: BASE_EXPLOSION_RANGE,
    speedMultiplier: 1,
  };
}

const ENEMY_STARTS: [number, number][] = [
  [11, 9],
  [11, 1],
  [1, 9],
  [9, 7],
];
const DIRS: Vec2[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
];

function randomDir(): Vec2 {
  return DIRS[Math.floor(Math.random() * 4)];
}

function makeEnemies(): Enemy[] {
  return ENEMY_STARTS.map(([ex, ey], i) => {
    const { x, y } = tileCenter(ex, ey);
    const d = randomDir();
    return {
      id: i,
      tx: ex,
      ty: ey,
      px: x,
      py: y,
      moving: false,
      moveProgress: 0,
      fromPx: x,
      fromPy: y,
      dx: d.x,
      dy: d.y,
      alive: true,
      dirChangeTimer: ENEMY_DIR_CHANGE_INTERVAL * (0.5 + Math.random()),
    };
  });
}

function initGameState(): GameState {
  return {
    map: buildMap(),
    player: makePlayer(),
    enemies: makeEnemies(),
    bombs: [],
    explosions: [],
    powerUps: [],
    score: 0,
    status: "playing",
    bombIdCounter: 0,
    explosionIdCounter: 0,
    powerUpIdCounter: 0,
    lastTime: 0,
  };
}

// ─── Game Logic ───────────────────────────────────────────────────────────────
function isWalkable(map: number[][], tx: number, ty: number): boolean {
  if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return false;
  return map[ty][tx] === TILE_EMPTY;
}

function computeExplosionCells(
  map: number[][],
  btx: number,
  bty: number,
  range: number,
): { cells: Vec2[]; destroyed: Vec2[] } {
  const cells: Vec2[] = [{ x: btx, y: bty }];
  const destroyed: Vec2[] = [];
  for (const dir of DIRS) {
    for (let r = 1; r <= range; r++) {
      const cx = btx + dir.x * r;
      const cy = bty + dir.y * r;
      if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) break;
      const t = map[cy][cx];
      if (t === TILE_SOLID) break;
      cells.push({ x: cx, y: cy });
      if (t === TILE_BREAKABLE) {
        destroyed.push({ x: cx, y: cy });
        break;
      }
    }
  }
  return { cells, destroyed };
}

// Recursive bomb detonation with visited set to avoid infinite loops
function detonateBomb(
  gs: GameState,
  bomb: Bomb,
  now: number,
  visitedBombIds: Set<number>,
  endGame: (status: "gameover" | "win", score: number) => void,
) {
  if (visitedBombIds.has(bomb.id)) return;
  visitedBombIds.add(bomb.id);

  // Remove this bomb from active list
  gs.bombs = gs.bombs.filter((b) => b.id !== bomb.id);

  const { cells, destroyed } = computeExplosionCells(
    gs.map,
    bomb.tx,
    bomb.ty,
    bomb.range,
  );

  // Destroy breakable tiles and maybe drop power-ups
  for (const d of destroyed) {
    gs.map[d.y][d.x] = TILE_EMPTY;
    gs.score += 10;
    if (Math.random() < POWERUP_DROP_CHANCE) {
      const types: PowerUpType[] = ["FireUp", "BombUp", "SpeedUp"];
      const type = types[Math.floor(Math.random() * types.length)];
      // Only place if no power-up already there
      const already = gs.powerUps.some((p) => p.tx === d.x && p.ty === d.y);
      if (!already) {
        gs.powerUps.push({ id: gs.powerUpIdCounter++, tx: d.x, ty: d.y, type });
      }
    }
  }

  gs.explosions.push({ id: gs.explosionIdCounter++, cells, startedAt: now });

  // Kill player in blast
  if (gs.player.alive) {
    const inBlast = cells.some(
      (c) => c.x === gs.player.tx && c.y === gs.player.ty,
    );
    if (inBlast) {
      gs.player.alive = false;
      setTimeout(() => endGame("gameover", gs.score), 200);
    }
  }

  // Kill enemies in blast
  for (const enemy of gs.enemies) {
    if (!enemy.alive) continue;
    const inBlast = cells.some((c) => c.x === enemy.tx && c.y === enemy.ty);
    if (inBlast) {
      enemy.alive = false;
      gs.score += 50;
    }
  }

  // Destroy power-ups caught in explosion
  gs.powerUps = gs.powerUps.filter(
    (p) => !cells.some((c) => c.x === p.tx && c.y === p.ty),
  );

  // Chain reaction: any bomb whose tile is in this explosion detonates now
  const chainBombs = [...gs.bombs].filter((b) =>
    cells.some((c) => c.x === b.tx && c.y === b.ty),
  );
  for (const cb of chainBombs) {
    detonateBomb(gs, cb, now, visitedBombIds, endGame);
  }

  // Check win
  const aliveEnemies = gs.enemies.filter((e) => e.alive);
  if (aliveEnemies.length === 0 && gs.player.alive) {
    setTimeout(() => endGame("win", gs.score), 300);
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef = useRef<GameState>(initGameState());
  const keysRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number>(0);
  const scoreRef = useRef<number>(0);
  const { actor } = useActor();

  const [displayScore, setDisplayScore] = useState(0);
  const [highScore, setHighScore] = useState<number>(0);
  const [gameStatus, setGameStatus] = useState<GameStatus>("playing");
  const [finalScore, setFinalScore] = useState(0);
  const [playerStats, setPlayerStats] = useState({
    maxBombs: 1,
    range: 2,
    speed: 1,
  });

  useEffect(() => {
    if (actor) {
      actor
        .getHighScore()
        .then((hs) => setHighScore(Number(hs)))
        .catch(() => {});
    }
  }, [actor]);

  const endGame = useCallback(
    async (status: "gameover" | "win", score: number) => {
      const gs = gsRef.current;
      if (gs.status !== "playing") return;
      gs.status = status;
      setGameStatus(status);
      setFinalScore(score);
      if (actor) {
        try {
          await actor.submitScore(BigInt(score));
          const hs = await actor.getHighScore();
          setHighScore(Number(hs));
        } catch (_) {}
      }
    },
    [actor],
  );

  const restart = useCallback(() => {
    gsRef.current = initGameState();
    scoreRef.current = 0;
    setDisplayScore(0);
    setGameStatus("playing");
    setFinalScore(0);
    setPlayerStats({ maxBombs: 1, range: 2, speed: 1 });
  }, []);

  // ─── Game loop ──────────────────────────────────────────────────────────────
  const tick = useCallback(
    (now: number) => {
      const gs = gsRef.current;
      if (gs.status !== "playing") return;

      const dt =
        gs.lastTime === 0 ? 0 : Math.min((now - gs.lastTime) / 1000, 0.1);
      gs.lastTime = now;

      const { map, player, enemies } = gs;
      const playerSpeed = BASE_PLAYER_SPEED * player.speedMultiplier;

      // ── Explode ready bombs ────────────────────────────────────────────────
      const readyBombs = gs.bombs.filter((b) => now - b.placedAt >= BOMB_FUSE);
      if (readyBombs.length > 0) {
        const visited = new Set<number>();
        for (const bomb of readyBombs) {
          detonateBomb(gs, bomb, now, visited, endGame);
        }
      }

      // ── Remove expired explosions ──────────────────────────────────────────
      gs.explosions = gs.explosions.filter(
        (e) => now - e.startedAt < EXPLOSION_DURATION,
      );

      // ── Player movement ────────────────────────────────────────────────────
      if (player.alive) {
        if (player.moving) {
          player.moveProgress += dt * playerSpeed;
          if (player.moveProgress >= 1) {
            player.moveProgress = 1;
            const tc = tileCenter(player.tx, player.ty);
            player.px = tc.x;
            player.py = tc.y;
            player.moving = false;
          } else {
            const tc = tileCenter(player.tx, player.ty);
            player.px =
              player.fromPx + (tc.x - player.fromPx) * player.moveProgress;
            player.py =
              player.fromPy + (tc.y - player.fromPy) * player.moveProgress;
          }
        }

        if (!player.moving) {
          let ndx = 0;
          let ndy = 0;
          if (keysRef.current.has("ArrowUp")) ndy = -1;
          else if (keysRef.current.has("ArrowDown")) ndy = 1;
          else if (keysRef.current.has("ArrowLeft")) ndx = -1;
          else if (keysRef.current.has("ArrowRight")) ndx = 1;

          if (ndx !== 0 || ndy !== 0) {
            const ntx = player.tx + ndx;
            const nty = player.ty + ndy;
            if (isWalkable(map, ntx, nty)) {
              player.fromPx = player.px;
              player.fromPy = player.py;
              player.tx = ntx;
              player.ty = nty;
              player.moving = true;
              player.moveProgress = 0;
            }
          }
        }

        // ── Power-up pickup ──────────────────────────────────────────────────
        const pickedUp = gs.powerUps.filter(
          (p) => p.tx === player.tx && p.ty === player.ty,
        );
        for (const pu of pickedUp) {
          gs.powerUps = gs.powerUps.filter((p) => p.id !== pu.id);
          if (pu.type === "BombUp") {
            player.maxBombs = Math.min(player.maxBombs + 1, 8);
            gs.score += 20;
          } else if (pu.type === "FireUp") {
            player.explosionRange = Math.min(player.explosionRange + 1, 6);
            gs.score += 20;
          } else if (pu.type === "SpeedUp") {
            player.speedMultiplier = Math.min(
              player.speedMultiplier + 0.3,
              2.5,
            );
            gs.score += 20;
          }
          setPlayerStats({
            maxBombs: player.maxBombs,
            range: player.explosionRange,
            speed: player.speedMultiplier,
          });
        }

        // ── Check explosion hits on player ───────────────────────────────────
        if (player.alive) {
          for (const exp of gs.explosions) {
            const inBlast = exp.cells.some(
              (c) => c.x === player.tx && c.y === player.ty,
            );
            if (inBlast) {
              player.alive = false;
              setTimeout(() => endGame("gameover", gs.score), 200);
              break;
            }
          }
        }

        // ── Enemy collision ──────────────────────────────────────────────────
        for (const enemy of enemies) {
          if (!enemy.alive) continue;
          const dist = Math.hypot(enemy.px - player.px, enemy.py - player.py);
          if (dist < TILE * 0.65) {
            player.alive = false;
            setTimeout(() => endGame("gameover", gs.score), 100);
          }
        }
      }

      // ── Enemy AI ───────────────────────────────────────────────────────────
      for (const enemy of enemies) {
        if (!enemy.alive) continue;

        enemy.dirChangeTimer -= dt * 1000;
        if (enemy.dirChangeTimer <= 0) {
          const d = randomDir();
          enemy.dx = d.x;
          enemy.dy = d.y;
          enemy.dirChangeTimer =
            ENEMY_DIR_CHANGE_INTERVAL * (0.5 + Math.random());
        }

        if (enemy.moving) {
          enemy.moveProgress += dt * ENEMY_SPEED;
          if (enemy.moveProgress >= 1) {
            enemy.moveProgress = 1;
            const tc = tileCenter(enemy.tx, enemy.ty);
            enemy.px = tc.x;
            enemy.py = tc.y;
            enemy.moving = false;
          } else {
            const tc = tileCenter(enemy.tx, enemy.ty);
            enemy.px =
              enemy.fromPx + (tc.x - enemy.fromPx) * enemy.moveProgress;
            enemy.py =
              enemy.fromPy + (tc.y - enemy.fromPy) * enemy.moveProgress;
          }
        }

        if (!enemy.moving) {
          const ntx = enemy.tx + enemy.dx;
          const nty = enemy.ty + enemy.dy;
          if (isWalkable(map, ntx, nty)) {
            enemy.fromPx = enemy.px;
            enemy.fromPy = enemy.py;
            enemy.tx = ntx;
            enemy.ty = nty;
            enemy.moving = true;
            enemy.moveProgress = 0;
          } else {
            const shuffled = [...DIRS].sort(() => Math.random() - 0.5);
            let moved = false;
            for (const d of shuffled) {
              const nx2 = enemy.tx + d.x;
              const ny2 = enemy.ty + d.y;
              if (isWalkable(map, nx2, ny2)) {
                enemy.dx = d.x;
                enemy.dy = d.y;
                enemy.fromPx = enemy.px;
                enemy.fromPy = enemy.py;
                enemy.tx = nx2;
                enemy.ty = ny2;
                enemy.moving = true;
                enemy.moveProgress = 0;
                moved = true;
                break;
              }
            }
            if (!moved) {
              enemy.dx = randomDir().x;
              enemy.dy = randomDir().y;
            }
          }
        }

        if (player.alive) {
          const dist = Math.hypot(enemy.px - player.px, enemy.py - player.py);
          if (dist < TILE * 0.65) {
            player.alive = false;
            setTimeout(() => endGame("gameover", gs.score), 100);
          }
        }
      }

      // ── Update score display ───────────────────────────────────────────────
      if (gs.score !== scoreRef.current) {
        scoreRef.current = gs.score;
        setDisplayScore(gs.score);
      }

      // ── Draw ───────────────────────────────────────────────────────────────
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      draw(ctx, gs, now);
    },
    [endGame],
  );

  // ── RAF loop ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const loop = (now: number) => {
      tick(now);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tick]);

  // ── Key handlers ────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);
      if (e.key === " ") {
        e.preventDefault();
        const gs = gsRef.current;
        if (gs.status !== "playing" || !gs.player.alive) return;
        const { tx, ty } = gs.player;
        const alreadyOnTile = gs.bombs.some((b) => b.tx === tx && b.ty === ty);
        if (!alreadyOnTile && gs.bombs.length < gs.player.maxBombs) {
          gs.bombs.push({
            id: gs.bombIdCounter++,
            tx,
            ty,
            placedAt: Date.now(),
            range: gs.player.explosionRange,
          });
        }
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 gap-4">
      {/* Header */}
      <div className="text-center space-y-1">
        <h1
          className="font-display text-3xl font-black tracking-widest uppercase score-glow"
          style={{ color: "#7fffb0" }}
        >
          BOMBERMAN
        </h1>
        <p
          className="text-xs tracking-[0.3em] uppercase"
          style={{ color: "#4a7a5a" }}
        >
          Classic Arcade
        </p>
      </div>

      {/* Score + Stats panel */}
      <div className="flex gap-6 items-start">
        {/* Scores */}
        <div
          data-ocid="game.score.panel"
          className="flex gap-6 font-mono text-sm tracking-widest uppercase"
        >
          <div className="flex flex-col items-center gap-1">
            <span style={{ color: "#4a7a5a" }}>Score</span>
            <span
              className="text-2xl font-bold score-glow"
              style={{ color: "#7fffb0" }}
            >
              {displayScore.toString().padStart(5, "0")}
            </span>
          </div>
          <div className="w-px" style={{ background: "#1a3a2a" }} />
          <div className="flex flex-col items-center gap-1">
            <span style={{ color: "#4a7a5a" }}>Best</span>
            <span
              className="text-2xl font-bold accent-glow"
              style={{ color: "#ffcc55" }}
            >
              {highScore.toString().padStart(5, "0")}
            </span>
          </div>
        </div>

        <div className="w-px self-stretch" style={{ background: "#1a3a2a" }} />

        {/* Power-up stats */}
        <div className="flex gap-4 font-mono text-xs tracking-widest uppercase">
          <div className="flex flex-col items-center gap-1">
            <span style={{ color: "#ff6b35" }}>🔥 Fire</span>
            <span className="font-bold" style={{ color: "#ff6b35" }}>
              {playerStats.range}
            </span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span style={{ color: "#c084fc" }}>💣 Bombs</span>
            <span className="font-bold" style={{ color: "#c084fc" }}>
              {playerStats.maxBombs}
            </span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span style={{ color: "#38bdf8" }}>⚡ Speed</span>
            <span className="font-bold" style={{ color: "#38bdf8" }}>
              {playerStats.speed.toFixed(1)}x
            </span>
          </div>
        </div>
      </div>

      {/* Canvas wrapper */}
      <div className="relative game-glow rounded-sm overflow-hidden">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          data-ocid="game.canvas_target"
          className="block"
          style={{ imageRendering: "pixelated" }}
        />
        <div className="scanlines" />

        {gameStatus !== "playing" && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-6"
            style={{ background: C.overlay }}
          >
            <div className="text-center space-y-2">
              <p
                className="font-display text-5xl font-black tracking-widest uppercase"
                style={{
                  color: gameStatus === "win" ? C.winText : C.loseText,
                  textShadow:
                    gameStatus === "win"
                      ? "0 0 20px #7fffb0, 0 0 60px #7fffb066"
                      : "0 0 20px #ff4d6d, 0 0 60px #ff4d6d66",
                }}
              >
                {gameStatus === "win" ? "YOU WIN!" : "GAME OVER"}
              </p>
              <p
                className="font-mono text-sm tracking-widest"
                style={{ color: "#6a9a7a" }}
              >
                {gameStatus === "win"
                  ? "ALL ENEMIES DESTROYED"
                  : "PLAYER ELIMINATED"}
              </p>
            </div>
            <div className="flex flex-col items-center gap-1 font-mono">
              <span
                className="text-xs tracking-widest uppercase"
                style={{ color: "#4a7a5a" }}
              >
                Final Score
              </span>
              <span
                className="text-3xl font-bold score-glow"
                style={{ color: "#7fffb0" }}
              >
                {finalScore.toString().padStart(5, "0")}
              </span>
            </div>
            <Button
              data-ocid="game.restart_button"
              onClick={restart}
              className="font-mono font-bold tracking-widest uppercase px-10 py-3 text-sm border"
              style={{
                background: "transparent",
                borderColor: gameStatus === "win" ? "#7fffb0" : "#ff4d6d",
                color: gameStatus === "win" ? "#7fffb0" : "#ff4d6d",
                boxShadow:
                  gameStatus === "win"
                    ? "0 0 15px #7fffb055, inset 0 0 15px #7fffb011"
                    : "0 0 15px #ff4d6d55, inset 0 0 15px #ff4d6d11",
              }}
            >
              ▶ PLAY AGAIN
            </Button>
          </div>
        )}
      </div>

      {/* Controls hint */}
      <div
        className="font-mono text-xs tracking-widest text-center space-y-1"
        style={{ color: "#2a4a3a" }}
      >
        <p>ARROW KEYS — MOVE &nbsp;|&nbsp; SPACEBAR — BOMB</p>
        <p style={{ color: "#3a5a3a" }}>
          🔥 Fire Up &nbsp;|&nbsp; 💣 Bomb Up &nbsp;|&nbsp; ⚡ Speed Up
        </p>
      </div>

      <footer
        className="font-mono text-xs tracking-wide"
        style={{ color: "#2a3a2a" }}
      >
        © {new Date().getFullYear()}.{" "}
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#3a5a3a" }}
        >
          Built with ♥ using caffeine.ai
        </a>
      </footer>
    </div>
  );
}

// ─── Renderer ─────────────────────────────────────────────────────────────────
function draw(ctx: CanvasRenderingContext2D, gs: GameState, now: number) {
  const { map, player, enemies, bombs, explosions, powerUps } = gs;

  ctx.fillStyle = C.floor;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  for (let col = 0; col <= COLS; col++) {
    ctx.beginPath();
    ctx.moveTo(col * TILE, 0);
    ctx.lineTo(col * TILE, CANVAS_H);
    ctx.stroke();
  }
  for (let row = 0; row <= ROWS; row++) {
    ctx.beginPath();
    ctx.moveTo(0, row * TILE);
    ctx.lineTo(CANVAS_W, row * TILE);
    ctx.stroke();
  }

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const t = map[row][col];
      const x = col * TILE;
      const y = row * TILE;
      if (t === TILE_SOLID) drawSolidTile(ctx, x, y);
      else if (t === TILE_BREAKABLE) drawBreakableTile(ctx, x, y);
    }
  }

  for (const pu of powerUps) drawPowerUp(ctx, pu, now);

  for (const exp of explosions) {
    const progress = (now - exp.startedAt) / EXPLOSION_DURATION;
    drawExplosion(ctx, exp.cells, progress);
  }

  for (const bomb of bombs) {
    const elapsed = now - bomb.placedAt;
    const fuseProgress = elapsed / BOMB_FUSE;
    drawBomb(ctx, bomb.tx, bomb.ty, fuseProgress);
  }

  for (const enemy of enemies) {
    if (enemy.alive) drawEnemy(ctx, enemy);
  }

  if (player.alive) drawPlayer(ctx, player);
}

function drawSolidTile(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const p = 2;
  ctx.fillStyle = C.solid;
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = C.solidEdge;
  ctx.fillRect(x + p, y + p, TILE - p * 2, TILE - p * 2);
  ctx.fillStyle = C.solid;
  ctx.fillRect(x + TILE / 2 - 2, y + p + 2, 4, TILE - p * 2 - 4);
  ctx.fillRect(x + p + 2, y + TILE / 2 - 2, TILE - p * 2 - 4, 4);
}

function drawBreakableTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
) {
  const p = 2;
  ctx.fillStyle = C.breakable;
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = C.breakableEdge;
  ctx.fillRect(x + p, y + p, TILE - p * 2, p);
  ctx.fillRect(x + p, y + p, p, TILE - p * 2);
  ctx.fillStyle = "#5a3a10";
  ctx.fillRect(x + p, y + TILE - p * 2, TILE - p * 2, p);
  ctx.fillRect(x + TILE - p * 2, y + p, p, TILE - p * 2);
  ctx.fillStyle = "#2a1a06";
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(x + 8 + i * 14, y + 6, 2, TILE - 12);
  }
}

function drawPowerUp(ctx: CanvasRenderingContext2D, pu: PowerUp, now: number) {
  const cx = pu.tx * TILE + TILE / 2;
  const cy = pu.ty * TILE + TILE / 2;
  const bob = Math.sin(now / 300 + pu.id) * 3;
  const r = TILE * 0.28;

  const color =
    pu.type === "FireUp"
      ? C.powerupFireUp
      : pu.type === "BombUp"
        ? C.powerupBombUp
        : C.powerupSpeedUp;

  // Glow
  const grad = ctx.createRadialGradient(cx, cy + bob, 0, cx, cy + bob, r * 2);
  grad.addColorStop(0, `${color}55`);
  grad.addColorStop(1, "transparent");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy + bob, r * 2, 0, Math.PI * 2);
  ctx.fill();

  // Circle
  ctx.fillStyle = "#0d1117";
  ctx.beginPath();
  ctx.arc(cx, cy + bob, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy + bob, r, 0, Math.PI * 2);
  ctx.stroke();

  // Icon text
  ctx.font = `${TILE * 0.3}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  const icon = pu.type === "FireUp" ? "F" : pu.type === "BombUp" ? "B" : "S";
  ctx.fillText(icon, cx, cy + bob);
}

function drawPlayer(ctx: CanvasRenderingContext2D, player: Player) {
  const { px, py } = player;
  const r = TILE * 0.36;
  const grad = ctx.createRadialGradient(px, py, 0, px, py, r * 1.8);
  grad.addColorStop(0, "rgba(127,255,176,0.35)");
  grad.addColorStop(1, "rgba(127,255,176,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(px, py, r * 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.playerDark;
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.player;
  ctx.beginPath();
  ctx.arc(px - r * 0.15, py - r * 0.15, r * 0.65, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.playerDark;
  ctx.beginPath();
  ctx.arc(px - r * 0.3, py - r * 0.1, r * 0.12, 0, Math.PI * 2);
  ctx.arc(px + r * 0.3, py - r * 0.1, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
}

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy) {
  const { px, py } = enemy;
  const r = TILE * 0.36;
  const grad = ctx.createRadialGradient(px, py, 0, px, py, r * 1.8);
  grad.addColorStop(0, "rgba(255,77,109,0.3)");
  grad.addColorStop(1, "rgba(255,77,109,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(px, py, r * 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.enemyDark;
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.enemy;
  ctx.beginPath();
  ctx.arc(px - r * 0.15, py - r * 0.15, r * 0.65, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(px - r * 0.3, py - r * 0.1, r * 0.14, 0, Math.PI * 2);
  ctx.arc(px + r * 0.3, py - r * 0.1, r * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.enemyDark;
  ctx.beginPath();
  ctx.arc(px - r * 0.28, py - r * 0.08, r * 0.07, 0, Math.PI * 2);
  ctx.arc(px + r * 0.32, py - r * 0.08, r * 0.07, 0, Math.PI * 2);
  ctx.fill();
}

function drawBomb(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  fuseProgress: number,
) {
  const cx = tx * TILE + TILE / 2;
  const cy = ty * TILE + TILE / 2;
  const pulse = 0.85 + Math.sin(fuseProgress * Math.PI * 8) * 0.15;
  const r = TILE * 0.3 * pulse;

  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.8, r * 0.7, r * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.beginPath();
  ctx.arc(cx - r * 0.2, cy - r * 0.3, r * 0.3, 0, Math.PI * 2);
  ctx.fill();

  const sparkAlpha = 0.5 + Math.sin(Date.now() / 80) * 0.5;
  ctx.fillStyle = `rgba(255,149,0,${sparkAlpha})`;
  ctx.beginPath();
  ctx.arc(cx + r * 0.4, cy - r * 0.7, r * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255,255,100,${sparkAlpha})`;
  ctx.beginPath();
  ctx.arc(cx + r * 0.4, cy - r * 0.7, r * 0.07, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#8b6914";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx + r * 0.3, cy - r * 1.1, cx + r * 0.4, cy - r * 0.7);
  ctx.stroke();
}

function drawExplosion(
  ctx: CanvasRenderingContext2D,
  cells: Vec2[],
  progress: number,
) {
  const alpha = progress < 0.3 ? progress / 0.3 : 1 - (progress - 0.3) / 0.7;
  for (const cell of cells) {
    const x = cell.x * TILE;
    const y = cell.y * TILE;
    const cx = x + TILE / 2;
    const cy = y + TILE / 2;
    ctx.fillStyle = `rgba(255,69,0,${alpha * 0.9})`;
    ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
    const mid = TILE * 0.25;
    ctx.fillStyle = `rgba(255,204,0,${alpha * 0.95})`;
    ctx.fillRect(x + mid, y + mid, TILE - mid * 2, TILE - mid * 2);
    const core = TILE * 0.4;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, core);
    grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
    grad.addColorStop(0.5, `rgba(255,220,0,${alpha * 0.9})`);
    grad.addColorStop(1, "rgba(255,69,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, core, 0, Math.PI * 2);
    ctx.fill();
  }
}
