import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActor } from "@/hooks/useActor";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomInfo } from "./backend";
import { deserializeGameState, serializeGameState } from "./game/serializer";
import {
  addIceCandidate,
  closeConnection,
  createWebRTCManager,
  guestReceiveOffer,
  hostCreateOffer,
  hostReceiveAnswer,
  sendData,
} from "./game/webrtcManager";
import type { WebRTCManager } from "./game/webrtcManager";

import {
  DIRS,
  ENEMY_DIR_CHANGE_INTERVAL,
  PROJECTILE_SPEED,
  TILE,
  randomDir,
  tileCenter,
} from "./game/constants";
import { detonateBomb, isWalkable } from "./game/gameLogic";
import { getLevelConfig } from "./game/levelConfig";
import { initLevel } from "./game/levelInit";
import { drawGame } from "./game/renderer";
import { getTheme } from "./game/themes";
import type {
  BombType,
  ChallengeFlag,
  GameState,
  GameStatus,
  LevelModifier,
  Player,
  Screen,
} from "./game/types";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef = useRef<GameState | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const keyOrderRef = useRef<string[]>([]);
  const rafRef = useRef<number>(0);
  const { actor } = useActor();

  // ─── Co-op state ──────────────────────────────────────────────────────────
  const [displayLivesP2, setDisplayLivesP2] = useState(3);
  const [displayIsMultiplayer, setDisplayIsMultiplayer] = useState(false);
  const [displayStatsP2, setDisplayStatsP2] = useState({
    maxBombs: 1,
    range: 2,
    speed: 1,
  });
  const [displayBombTypeP2, setDisplayBombTypeP2] =
    useState<BombType>("normal");
  const [displayShieldP2, setDisplayShieldP2] = useState(0);
  const p2KeyOrderRef = useRef<string[]>([]);

  const [screen, setScreen] = useState<Screen>("picker");
  const [customCols, setCustomCols] = useState("17");
  const [customRows, setCustomRows] = useState("13");
  const [showCustom, setShowCustom] = useState(false);
  const [showCoOpPicker, setShowCoOpPicker] = useState(false);
  const [coOpCustomCols, setCoOpCustomCols] = useState("17");
  const [coOpCustomRows, setCoOpCustomRows] = useState("13");
  const [showCoOpCustom, setShowCoOpCustom] = useState(false);
  // ─── Online Co-op state ──────────────────────────────────────────────────
  const [onlineScreen, setOnlineScreen] = useState<
    | "none"
    | "name"
    | "choice"
    | "hostSetup"
    | "hostWaiting"
    | "joinList"
    | "joinWaiting"
  >("none");
  const [onlineName, setOnlineName] = useState("");
  const [onlineRoomName, setOnlineRoomName] = useState("");
  const [onlineGridSize, setOnlineGridSize] = useState<"S" | "M" | "L">("M");
  const [onlineRoomId, setOnlineRoomId] = useState("");
  const [onlineRooms, setOnlineRooms] = useState<RoomInfo[]>([]);
  const onlineRoleRef = useRef<"host" | "guest" | null>(null);
  const rtcManagerRef = useRef<WebRTCManager | null>(null);
  const isOnlineCoopRef = useRef(false);
  const onlineRoomIdRef = useRef("");
  const lastStatePushRef = useRef(0);
  const latestRemoteStateRef = useRef<string | null>(null);
  const p2InputQueueRef = useRef<
    { code: string; pressed: boolean; bomb?: boolean }[]
  >([]);
  const [onlineDisconnected, setOnlineDisconnected] = useState(false);
  const [rtcManager, setRtcManager] = useState<WebRTCManager | null>(null);
  const [rtcConnected, setRtcConnected] = useState(false);
  const [onlineError, setOnlineError] = useState("");
  const [onlinePlayerCount, setOnlinePlayerCount] = useState(1);
  const [onlineRoomNameDisplay, setOnlineRoomNameDisplay] = useState("");
  const onlineIntervalsRef = useRef<number[]>([]);
  const onlineGuestActiveRef = useRef(false);
  // Online co-op guest interpolation refs
  const hasReceivedFirstPacketRef = useRef(false);
  const prevRemoteStateRef = useRef<GameState | null>(null);
  const lastPacketTimeRef = useRef<number>(0);
  const currentPacketTimeRef = useRef<number>(0);
  const [p2LeftMessage, setP2LeftMessage] = useState("");
  const [displayScore, setDisplayScore] = useState(0);
  const [displayLives, setDisplayLives] = useState(3);
  const [displayLevel, setDisplayLevel] = useState(1);
  const [displayShield, setDisplayShield] = useState(0);
  const [displayStats, setDisplayStats] = useState({
    maxBombs: 1,
    range: 2,
    speed: 1,
  });
  const [gameStatus, setGameStatus] = useState<GameStatus>("playing");
  const [highScore, setHighScore] = useState(0);
  const [bestLevel, setBestLevel] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [gameCols, setGameCols] = useState(13);
  const [gameRows, setGameRows] = useState(11);
  const [displayTimer, setDisplayTimer] = useState<number | null>(null);
  const [displayModifier, setDisplayModifier] = useState<LevelModifier>(null);
  const [displayChallenge, setDisplayChallenge] = useState<ChallengeFlag[]>([]);
  const [displayCurseFlash, setDisplayCurseFlash] = useState(false);
  const [displayBombType, setDisplayBombType] = useState<BombType>("normal");

  useEffect(() => {
    const savedBest = localStorage.getItem("bomberman_best_score");
    const savedBestLevel = localStorage.getItem("bomberman_best_level");
    if (savedBest) setHighScore(Number.parseInt(savedBest, 10));
    if (savedBestLevel) setBestLevel(Number.parseInt(savedBestLevel, 10));
    if (actor) {
      actor
        .getHighScore()
        .then((hs) => {
          const actorScore = Number(hs);
          const localScore = Number.parseInt(
            localStorage.getItem("bomberman_best_score") || "0",
            10,
          );
          if (actorScore > localScore) setHighScore(actorScore);
        })
        .catch(() => {});
    }
  }, [actor]);

  const startGame = useCallback((cols: number, rows: number, mp = false) => {
    const gs = initLevel(cols, rows, 1, undefined, mp);
    gsRef.current = gs;
    p2KeyOrderRef.current = [];
    setGameCols(cols);
    setGameRows(rows);
    setScreen("game");
    setDisplayScore(0);
    setDisplayLives(3);
    setDisplayLevel(1);
    setDisplayShield(0);
    setDisplayStats({ maxBombs: 1, range: 2, speed: 1 });
    setGameStatus("playing");
    setFinalScore(0);
    setDisplayTimer(gs.timerMs);
    setDisplayModifier(gs.levelModifier);
    setDisplayChallenge(gs.challengeFlags);
    setDisplayIsMultiplayer(mp);
    if (mp) {
      setDisplayLivesP2(3);
      setDisplayStatsP2({ maxBombs: 1, range: 2, speed: 1 });
      setDisplayBombTypeP2("normal");
      setDisplayShieldP2(0);
    }
  }, []);

  const restartGame = useCallback(() => {
    const gs = gsRef.current;
    if (!gs) return;
    const newGs = initLevel(gs.cols, gs.rows, 1, undefined, gs.isMultiplayer);
    gsRef.current = newGs;
    setDisplayScore(0);
    setDisplayLives(3);
    setDisplayLevel(1);
    setDisplayShield(0);
    setDisplayStats({ maxBombs: 1, range: 2, speed: 1 });
    setGameStatus("playing");
    setFinalScore(0);
    setDisplayTimer(newGs.timerMs);
    setDisplayModifier(newGs.levelModifier);
    setDisplayChallenge(newGs.challengeFlags);
    if (gs.isMultiplayer) {
      p2KeyOrderRef.current = [];
      setDisplayLivesP2(3);
      setDisplayStatsP2({ maxBombs: 1, range: 2, speed: 1 });
      setDisplayBombTypeP2("normal");
      setDisplayShieldP2(0);
      setDisplayIsMultiplayer(true);
    }
  }, []);

  const advanceLevel = useCallback(() => {
    const gs = gsRef.current;
    if (!gs) return;
    const nextLevel = gs.level + 1;
    const newGs = initLevel(
      gs.cols,
      gs.rows,
      nextLevel,
      gs.player,
      gs.isMultiplayer,
    );
    newGs.score = gs.score;
    // Multiplayer: carry over per-player lives/bombType, respawn dead players
    if (gs.isMultiplayer && gs.player2) {
      const prevP2BombType = gs.player2.bombType;
      if (newGs.player2) {
        // Revive dead P2 with 1 life (they died last level)
        if (!gs.player2.alive || gs.player2.lives <= 0) {
          newGs.player2.alive = true;
          newGs.player2.lives = 1;
        } else {
          newGs.player2.lives = gs.player2.lives;
        }
        newGs.player2.bombType = prevP2BombType;
      }
      // Revive dead P1 too
      if (!gs.player.alive || gs.player.lives <= 0) {
        newGs.player.alive = true;
        newGs.player.lives = 1;
      }
      p2KeyOrderRef.current = [];
    }
    gsRef.current = newGs;
    setDisplayLevel(nextLevel);
    setGameStatus("playing");
    setDisplayTimer(newGs.timerMs);
    setDisplayModifier(newGs.levelModifier);
    setDisplayChallenge(newGs.challengeFlags);
    if (gs.isMultiplayer) {
      p2KeyOrderRef.current = [];
      setDisplayLivesP2(3);
      setDisplayStatsP2({ maxBombs: 1, range: 2, speed: 1 });
      setDisplayBombTypeP2("normal");
      setDisplayShieldP2(0);
      setDisplayIsMultiplayer(true);
    }
    setDisplayStats({ maxBombs: 1, range: 2, speed: 1 });
    setDisplayShield(0);
    if (gs.isMultiplayer && newGs.player2) {
      setDisplayLivesP2(newGs.player2.lives);
      setDisplayStatsP2({ maxBombs: 1, range: 2, speed: 1 });
      setDisplayShieldP2(0);
    }
  }, []);

  const onGameOver = useCallback(
    async (score: number) => {
      setGameStatus("gameover");
      setFinalScore(score);
      const prevBest = Number.parseInt(
        localStorage.getItem("bomberman_best_score") || "0",
        10,
      );
      const prevBestLevel = Number.parseInt(
        localStorage.getItem("bomberman_best_level") || "0",
        10,
      );
      if (score > prevBest) {
        localStorage.setItem("bomberman_best_score", score.toString());
        setHighScore(score);
      }
      const currentLevel = gsRef.current?.level ?? 1;
      if (currentLevel > prevBestLevel) {
        localStorage.setItem("bomberman_best_level", currentLevel.toString());
        setBestLevel(currentLevel);
      }
      if (actor) {
        try {
          await actor.submitScore(BigInt(score));
          const hs = await actor.getHighScore();
          const actorScore = Number(hs);
          const localScore = Number.parseInt(
            localStorage.getItem("bomberman_best_score") || "0",
            10,
          );
          if (actorScore > localScore) setHighScore(actorScore);
        } catch (_) {}
      }
    },
    [actor],
  );

  // ─── Place P2 Bomb (local co-op) ─────────────────────────────────────────
  const placeP2Bomb = useCallback((gs: GameState) => {
    if (!gs.player2 || !gs.player2.alive) return;
    const p2 = gs.player2;
    if (
      gs.bombs.filter((b) => b.placedByP2).length < p2.maxBombs &&
      !gs.bombs.some((b) => b.tx === p2.tx && b.ty === p2.ty)
    ) {
      const newBombType: BombType =
        p2.bombType === "surprise"
          ? (["normal", "lava", "freeze", "kick", "portal"] as BombType[])[
              Math.floor(Math.random() * 5)
            ]
          : p2.bombType;
      gs.bombs.push({
        id: gs.bombIdCounter++,
        tx: p2.tx,
        ty: p2.ty,
        placedAt: performance.now(),
        range: p2.explosionRange,
        hasDrifted: false,
        fuseMs: Math.max(1000, Math.min(4000, 2000 - p2.bombFuseLevel * 500)),
        bombType: newBombType,
        placedByP2: true,
      });
    }
  }, []);

  // ─── Game Loop ───────────────────────────────────────────────────────────────
  const tick = useCallback(
    (now: number) => {
      const gs = gsRef.current;
      if (!gs) return;

      // Online co-op: guest receives state snapshot and renders it, no simulation
      if (isOnlineCoopRef.current && onlineRoleRef.current === "guest") {
        // Consume latest remote packet if available
        if (latestRemoteStateRef.current) {
          const packetJson = latestRemoteStateRef.current;
          latestRemoteStateRef.current = null;
          const rawParsed = JSON.parse(packetJson);
          const hostSentAt = rawParsed._hostSentAt as number | undefined;
          rawParsed._hostSentAt = undefined;
          const newGs = deserializeGameState(JSON.stringify(rawParsed));
          // Compute clock offset so guest can sync bomb fuse animations
          if (hostSentAt !== undefined) {
            newGs.hostClockOffset = now - hostSentAt;
          }
          // Store previous state for interpolation
          prevRemoteStateRef.current = gsRef.current;
          gsRef.current = newGs;
          // Track packet arrival times for interpolation
          lastPacketTimeRef.current = currentPacketTimeRef.current || now;
          currentPacketTimeRef.current = now;
          hasReceivedFirstPacketRef.current = true;
        }

        // Bug 2 fix: don't render until the first real packet arrives
        if (!hasReceivedFirstPacketRef.current) {
          const canvas = canvasRef.current;
          if (canvas) {
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.fillStyle = "#050510";
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.fillStyle = "#7fffa0";
              ctx.font = "bold 20px monospace";
              ctx.textAlign = "center";
              ctx.fillText(
                "Connecting...",
                canvas.width / 2,
                canvas.height / 2,
              );
              ctx.textAlign = "left";
            }
          }
          return;
        }

        const latestGs = gsRef.current!;

        // Bug 3 fix: client-side position interpolation so guest runs at 60fps
        // even though state only arrives at ~10Hz
        const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
        let renderGs = latestGs;
        const prev = prevRemoteStateRef.current;
        const packetInterval =
          currentPacketTimeRef.current - lastPacketTimeRef.current;
        if (prev && packetInterval > 0) {
          const elapsed = now - currentPacketTimeRef.current;
          const t = Math.min(elapsed / packetInterval, 1);
          if (t < 1) {
            // Build a shallow-cloned render state with interpolated pixel positions
            const interpPlayer = {
              ...latestGs.player,
              px: lerp(prev.player.px, latestGs.player.px, t),
              py: lerp(prev.player.py, latestGs.player.py, t),
            };
            let interpPlayer2 = latestGs.player2;
            if (latestGs.player2 && prev.player2) {
              interpPlayer2 = {
                ...latestGs.player2,
                px: lerp(prev.player2.px, latestGs.player2.px, t),
                py: lerp(prev.player2.py, latestGs.player2.py, t),
              };
            }
            const interpEnemies = latestGs.enemies.map((enemy) => {
              const prevEnemy = prev.enemies.find((e) => e.id === enemy.id);
              if (!prevEnemy) return enemy;
              return {
                ...enemy,
                px: lerp(prevEnemy.px, enemy.px, t),
                py: lerp(prevEnemy.py, enemy.py, t),
              };
            });
            renderGs = {
              ...latestGs,
              player: interpPlayer,
              player2: interpPlayer2,
              enemies: interpEnemies,
            };
          }
        }

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        drawGame(ctx, renderGs, now);

        // Bug 1 fix: sync ALL HUD display state from the remote game state
        // P1 (host) = renderGs.player, P2 (guest) = renderGs.player2
        const p1 = latestGs.player;
        const p2g = latestGs.player2;
        setDisplayScore(latestGs.score);
        setDisplayLevel(latestGs.level);
        setDisplayLives(Math.min(p1.lives, 3));
        setDisplayShield(
          p1.shieldActive ? Math.ceil(p1.shieldTimer / 1000) : 0,
        );
        setDisplayStats({
          maxBombs: p1.maxBombs,
          range: p1.explosionRange,
          speed: p1.speedMultiplier,
        });
        setDisplayBombType(p1.bombType);
        if (p2g) {
          setDisplayLivesP2(Math.min(p2g.lives, 3));
          setDisplayStatsP2({
            maxBombs: p2g.maxBombs,
            range: p2g.explosionRange,
            speed: p2g.speedMultiplier,
          });
          setDisplayBombTypeP2(p2g.bombType);
          setDisplayShieldP2(
            p2g.shieldActive ? Math.ceil(p2g.shieldTimer / 1000) : 0,
          );
        }
        setDisplayIsMultiplayer(true);
        setDisplayTimer(latestGs.timerMs);

        if (latestGs.status === "gameover") {
          setGameStatus("gameover");
          setFinalScore(latestGs.score);
        } else if (latestGs.status === "levelcomplete") {
          setGameStatus("levelcomplete");
        } else if (latestGs.status === "playing") {
          setGameStatus("playing");
        }
        return;
      }

      if (gs.status !== "playing") return;

      const dt =
        gs.lastTime === 0 ? 0 : Math.min((now - gs.lastTime) / 1000, 0.1);
      gs.lastTime = now;

      const { map, player, enemies, cols, rows } = gs;
      const playerOnIce = gs.icePatches.some(
        (ip) => ip.tx === player.tx && ip.ty === player.ty,
      );
      const playerOnSticky = gs.stickyTiles.some(
        (st) => st.tx === player.tx && st.ty === player.ty,
      );
      const playerSpeed =
        4 *
        player.speedMultiplier *
        (playerOnIce ? 0.1 : 1) *
        (playerOnSticky ? 0.3 : 1);

      // Timers
      if (player.invincible) {
        player.invincibleTimer -= dt * 1000;
        if (player.invincibleTimer <= 0) {
          player.invincible = false;
          player.invincibleTimer = 0;
        }
      }
      if (player.shieldActive) {
        player.shieldTimer -= dt * 1000;
        if (player.shieldTimer <= 0) {
          player.shieldActive = false;
          player.shieldTimer = 0;
        }
      }

      // Level Timer & Fill
      if (gs.timerActive && gs.timerMs !== null) {
        gs.timerMs -= dt * 1000;
        if (gs.timerMs <= 0) {
          gs.timerMs = 0;
          gs.timerActive = false;
          gs.fillPhase = 1;
          gs.fillTimer = 0;
        }
      }

      if (!gs.timerActive && gs.fillPhase > 0) {
        gs.fillTimer += dt * 1000;
        if (gs.fillTimer >= 500) {
          gs.fillTimer -= 500;
          const wave = gs.fillPhase;
          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
              const distFromBorder = Math.min(
                row,
                rows - 1 - row,
                col,
                cols - 1 - col,
              );
              if (distFromBorder === wave - 1 && map[row][col] !== 1) {
                const key = `${col},${row}`;
                if (!gs.lavaTiles.has(key)) {
                  gs.lavaTiles.add(key);
                  map[row][col] = 1;
                  if (
                    player.alive &&
                    player.tx === col &&
                    player.ty === row &&
                    !player.invincible
                  ) {
                    if (player.shieldActive) {
                      player.shieldActive = false;
                      player.shieldTimer = 0;
                      player.invincible = true;
                      player.invincibleTimer = 3000;
                    } else {
                      player.lives -= 1;
                      player.invincible = true;
                      player.invincibleTimer = 3000;
                      if (player.lives <= 0) {
                        player.alive = false;
                        if (gs.isMultiplayer && gs.player2?.alive) {
                          // P2 still alive, continue
                        } else {
                          gs.status = "gameover";
                          setGameStatus("gameover");
                          setFinalScore(gs.score);
                          onGameOver(gs.score);
                          return;
                        }
                      }
                      const c = tileCenter(1, 1);
                      player.tx = 1;
                      player.ty = 1;
                      player.px = c.x;
                      player.py = c.y;
                      player.fromPx = c.x;
                      player.fromPy = c.y;
                      player.moving = false;
                    }
                  }
                }
              }
            }
          }
          gs.fillPhase++;
          const maxWave = Math.min(Math.floor(cols / 2), Math.floor(rows / 2));
          if (gs.fillPhase > maxWave) {
            player.alive = false;
            if (gs.isMultiplayer && gs.player2?.alive) {
              // P2 still alive, continue
            } else {
              gs.status = "gameover";
              setGameStatus("gameover");
              setFinalScore(gs.score);
              onGameOver(gs.score);
              return;
            }
          }
        }
      }

      // Detonate ready bombs
      const readyBombs = gs.bombs.filter((b) => now - b.placedAt >= b.fuseMs);
      if (readyBombs.length > 0) {
        const visited = new Set<number>();
        const wasPlayerBombs = readyBombs.filter(
          (b) => !gs.enemies.some((e) => e.ownBombIds.includes(b.id)),
        );
        for (const b of readyBombs) {
          detonateBomb(
            gs,
            b,
            now,
            visited,
            () => {},
            () => {},
          );
        }
        // Cursed bomb: 20% chance to teleport player when their bomb detonates
        if (
          gs.cursedBombActive &&
          wasPlayerBombs.length > 0 &&
          player.alive &&
          Math.random() < 0.2
        ) {
          const openTiles: { tx: number; ty: number }[] = [];
          for (let row = 1; row < rows - 1; row++) {
            for (let col = 1; col < cols - 1; col++) {
              if (map[row][col] !== 0) continue;
              if (gs.bombs.some((b) => b.tx === col && b.ty === row)) continue;
              if (gs.lavaFires.some((lf) => lf.tx === col && lf.ty === row))
                continue;
              openTiles.push({ tx: col, ty: row });
            }
          }
          if (openTiles.length > 0) {
            const dest =
              openTiles[Math.floor(Math.random() * openTiles.length)];
            const c = tileCenter(dest.tx, dest.ty);
            player.tx = dest.tx;
            player.ty = dest.ty;
            player.px = c.x;
            player.py = c.y;
            player.fromPx = c.x;
            player.fromPy = c.y;
            player.moving = false;
            gs.teleportFlashUntil = now + 300;
          }
        }
        // Cursed bomb: also apply to P2 in co-op
        if (gs.isMultiplayer && gs.player2?.alive) {
          const wasP2Bombs = readyBombs.filter((b) => b.placedByP2);
          if (
            gs.cursedBombActive &&
            wasP2Bombs.length > 0 &&
            Math.random() < 0.2
          ) {
            const openTilesP2: { tx: number; ty: number }[] = [];
            for (let row = 1; row < rows - 1; row++) {
              for (let col = 1; col < cols - 1; col++) {
                if (map[row][col] !== 0) continue;
                if (gs.bombs.some((b) => b.tx === col && b.ty === row))
                  continue;
                openTilesP2.push({ tx: col, ty: row });
              }
            }
            if (openTilesP2.length > 0) {
              const dest =
                openTilesP2[Math.floor(Math.random() * openTilesP2.length)];
              const c = tileCenter(dest.tx, dest.ty);
              gs.player2.tx = dest.tx;
              gs.player2.ty = dest.ty;
              gs.player2.px = c.x;
              gs.player2.py = c.y;
              gs.player2.fromPx = c.x;
              gs.player2.fromPy = c.y;
              gs.player2.moving = false;
            }
          }
        }
      }

      if ((gs.status as string) === "gameover") {
        setGameStatus("gameover");
        setFinalScore(gs.score);
        onGameOver(gs.score);
        return;
      }

      // Windy bomb drift
      if (gs.levelModifier === "windy" && gs.windDir) {
        for (const bomb of gs.bombs) {
          if (!bomb.hasDrifted && now - bomb.placedAt >= 1000) {
            bomb.hasDrifted = true;
            const ntx = bomb.tx + gs.windDir.x;
            const nty = bomb.ty + gs.windDir.y;
            if (
              isWalkable(map, cols, rows, ntx, nty) &&
              !gs.bombs.some(
                (b) => b.id !== bomb.id && b.tx === ntx && b.ty === nty,
              )
            ) {
              bomb.tx = ntx;
              bomb.ty = nty;
            }
          }
        }
      }

      // Remove expired explosions
      gs.explosions = gs.explosions.filter((e) => now - e.startedAt < 280);
      gs.projectiles = gs.projectiles.filter((p) => p.alive);

      // Lava fire logic
      const LAVA_FIRE_DURATION = 3000;
      gs.lavaFires = gs.lavaFires.filter(
        (lf) => now - lf.spawnedAt < LAVA_FIRE_DURATION,
      );
      for (const lf of gs.lavaFires) {
        if (map[lf.ty]?.[lf.tx] === 2) {
          map[lf.ty][lf.tx] = 0;
          gs.score += 10;
          if (
            gs.portalTilePos &&
            gs.portalTilePos.x === lf.tx &&
            gs.portalTilePos.y === lf.ty
          ) {
            gs.portal = { tx: lf.tx, ty: lf.ty, visible: false };
          } else {
            // Lava fire doesn't destroy items, just dropPowerUp for wall break
            // (dropPowerUp handles item protection separately)
          }
        }
        // Damage player
        if (
          player.alive &&
          !player.invincible &&
          player.tx === lf.tx &&
          player.ty === lf.ty
        ) {
          const key = "player";
          const lastDmg = gs.lavaDamageCooldown.get(key) ?? 0;
          if (now - lastDmg >= 500) {
            gs.lavaDamageCooldown.set(key, now);
            if (player.shieldActive) {
              player.shieldActive = false;
              player.shieldTimer = 0;
              player.invincible = true;
              player.invincibleTimer = 3000;
            } else {
              player.lives -= 1;
              if (player.lives <= 0) {
                player.alive = false;
                if (gs.isMultiplayer && gs.player2?.alive) {
                  // P2 still alive, continue
                } else {
                  gs.status = "gameover";
                  setGameStatus("gameover");
                  setFinalScore(gs.score);
                  onGameOver(gs.score);
                  return;
                }
              }
              player.invincible = true;
              player.invincibleTimer = 3000;
              const c2 = tileCenter(1, 1);
              player.tx = 1;
              player.ty = 1;
              player.px = c2.x;
              player.py = c2.y;
              player.fromPx = c2.x;
              player.fromPy = c2.y;
              player.moving = false;
            }
          }
        }
        // Damage enemies (splitter2 and bomber are immune to lingering lava fire)
        for (const enemy of enemies) {
          if (!enemy.alive) continue;
          if (enemy.type === "splitter2" || enemy.type === "bomber") continue;
          if (enemy.tx !== lf.tx || enemy.ty !== lf.ty) continue;
          if (enemy.invincibleUntil && enemy.invincibleUntil > now) continue;
          const key = `enemy-${enemy.id}`;
          const lastDmg = gs.lavaDamageCooldown.get(key) ?? 0;
          if (now - lastDmg >= 500) {
            gs.lavaDamageCooldown.set(key, now);
            enemy.alive = false;
            gs.score += 50;
            if (gs.timerActive && gs.timerMs !== null) gs.timerMs += 30000;
          }
        }
      }

      // Lava fire damage for P2
      if (gs.isMultiplayer && gs.player2?.alive) {
        const p2lv = gs.player2;
        for (const lf of gs.lavaFires) {
          if (p2lv.invincible || p2lv.tx !== lf.tx || p2lv.ty !== lf.ty)
            continue;
          const keyP2lv = "player2";
          const lastDmgP2lv = gs.lavaDamageCooldown.get(keyP2lv) ?? 0;
          if (now - lastDmgP2lv >= 500) {
            gs.lavaDamageCooldown.set(keyP2lv, now);
            if (p2lv.shieldActive) {
              p2lv.shieldActive = false;
              p2lv.shieldTimer = 0;
              p2lv.invincible = true;
              p2lv.invincibleTimer = 3000;
            } else {
              p2lv.lives -= 1;
              if (p2lv.lives <= 0) {
                p2lv.alive = false;
                if (!gs.player.alive) {
                  gs.status = "gameover";
                  setGameStatus("gameover");
                  setFinalScore(gs.score);
                  onGameOver(gs.score);
                  return;
                }
              } else {
                p2lv.invincible = true;
                p2lv.invincibleTimer = 3000;
                const cp2lv = tileCenter(1, 1);
                p2lv.tx = 1;
                p2lv.ty = 1;
                p2lv.px = cp2lv.x;
                p2lv.py = cp2lv.y;
                p2lv.fromPx = cp2lv.x;
                p2lv.fromPy = cp2lv.y;
                p2lv.moving = false;
              }
            }
            break;
          }
        }
      }

      // Ice patch logic
      gs.icePatches = gs.icePatches.filter((ip) => now - ip.spawnedAt < 3000);

      // Update projectiles
      for (const proj of gs.projectiles) {
        proj.px += proj.dx * proj.speed * dt;
        proj.py += proj.dy * proj.speed * dt;
        const ptx = Math.floor(proj.px / TILE);
        const pty = Math.floor(proj.py / TILE);
        if (ptx < 0 || ptx >= cols || pty < 0 || pty >= rows) {
          proj.alive = false;
          continue;
        }
        const tile = map[pty][ptx];
        if (tile === 1 || tile === 2) {
          proj.alive = false;
          continue;
        }
        if (player.alive && !player.invincible) {
          const dist = Math.hypot(proj.px - player.px, proj.py - player.py);
          if (dist < TILE * 0.4) {
            proj.alive = false;
            if (player.shieldActive) {
              player.shieldActive = false;
              player.shieldTimer = 0;
              player.invincible = true;
              player.invincibleTimer = 3000;
            } else {
              player.lives -= 1;
              if (player.lives <= 0) {
                player.alive = false;
                if (gs.isMultiplayer && gs.player2?.alive) {
                  // P2 still alive, continue
                } else {
                  gs.status = "gameover";
                  setGameStatus("gameover");
                  setFinalScore(gs.score);
                  onGameOver(gs.score);
                  return;
                }
              }
              player.invincible = true;
              player.invincibleTimer = 3000;
              const c = tileCenter(1, 1);
              player.tx = 1;
              player.ty = 1;
              player.px = c.x;
              player.py = c.y;
              player.fromPx = c.x;
              player.fromPy = c.y;
              player.moving = false;
            }
          }
        }
      }

      // Player movement
      if (player.alive) {
        if (player.moving) {
          player.moveProgress += dt * playerSpeed;
          if (player.moveProgress >= 1) {
            player.moveProgress = 1;
            const tc = tileCenter(player.tx, player.ty);
            player.px = tc.x;
            player.py = tc.y;
            player.moving = false;
            // Teleport portal check (portal bomb portals)
            if (gs.teleportPortals.length === 2) {
              const entered = gs.teleportPortals.find(
                (tp) => tp.tx === player.tx && tp.ty === player.ty,
              );
              if (entered) {
                const other = gs.teleportPortals.find(
                  (tp) => tp.id !== entered.id,
                );
                if (other) {
                  const c = tileCenter(other.tx, other.ty);
                  player.tx = other.tx;
                  player.ty = other.ty;
                  player.px = c.x;
                  player.py = c.y;
                  player.fromPx = c.x;
                  player.fromPy = c.y;
                  player.moving = false;
                  gs.teleportFlashUntil = now + 300;
                }
              }
            }
            // Teleport pad check
            if (gs.teleportPads && gs.teleportPads.length > 0) {
              const pad = gs.teleportPads.find(
                (p) => p.tx === player.tx && p.ty === player.ty,
              );
              if (pad) {
                const partner = gs.teleportPads.find(
                  (p) => p.pairId === pad.pairId && p.id !== pad.id,
                );
                if (partner) {
                  const c = tileCenter(partner.tx, partner.ty);
                  player.tx = partner.tx;
                  player.ty = partner.ty;
                  player.px = c.x;
                  player.py = c.y;
                  player.fromPx = c.x;
                  player.fromPy = c.y;
                  player.moving = false;
                  gs.teleportFlashUntil = now + 300;
                }
              }
            }
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
          // Last-key-wins: iterate keyOrder to find most recently pressed arrow key
          const isMirrored = now < player.mirrorUntil;
          for (const key of keyOrderRef.current) {
            if (key === "ArrowUp") {
              ndy = -1;
              break;
            }
            if (key === "ArrowDown") {
              ndy = 1;
              break;
            }
            if (key === (isMirrored ? "ArrowRight" : "ArrowLeft")) {
              ndx = -1;
              break;
            }
            if (key === (isMirrored ? "ArrowLeft" : "ArrowRight")) {
              ndx = 1;
              break;
            }
          }

          if (ndx !== 0 || ndy !== 0) {
            const ntx = player.tx + ndx;
            const nty = player.ty + ndy;
            // Check for kick bomb - if player walks into a kick bomb, slide it
            const kickBomb = gs.bombs.find(
              (b) =>
                b.tx === ntx &&
                b.ty === nty &&
                b.bombType === "kick" &&
                !b.sliding,
            );
            if (kickBomb) {
              // Slide kick bomb until it hits an obstacle
              let destTx = ntx;
              let destTy = nty;
              while (true) {
                const nx2 = destTx + ndx;
                const ny2 = destTy + ndy;
                if (
                  !isWalkable(map, cols, rows, nx2, ny2) ||
                  gs.bombs.some(
                    (b) => b.id !== kickBomb.id && b.tx === nx2 && b.ty === ny2,
                  )
                )
                  break;
                destTx = nx2;
                destTy = ny2;
              }
              kickBomb.sliding = true;
              kickBomb.slideDx = ndx;
              kickBomb.slideDy = ndy;
              kickBomb.slideProgress = 0;
              kickBomb.slideFromTx = ntx;
              kickBomb.slideFromTy = nty;
              // Move bomb to destination immediately (position updated over time in slide loop)
              kickBomb.tx = destTx;
              kickBomb.ty = destTy;
              // Player moves into the old bomb tile
              if (isWalkable(map, cols, rows, ntx, nty)) {
                player.fromPx = player.px;
                player.fromPy = player.py;
                player.tx = ntx;
                player.ty = nty;
                player.moving = true;
                player.moveProgress = 0;
              }
            } else if (
              isWalkable(map, cols, rows, ntx, nty) &&
              !gs.bombs.some((b) => b.tx === ntx && b.ty === nty)
            ) {
              player.fromPx = player.px;
              player.fromPy = player.py;
              player.tx = ntx;
              player.ty = nty;
              player.moving = true;
              player.moveProgress = 0;
            }
          }
        }

        // Collect power-ups
        const pickedUp = gs.powerUps.filter(
          (p) => p.tx === player.tx && p.ty === player.ty,
        );
        for (const pu of pickedUp) {
          gs.powerUps = gs.powerUps.filter((p) => p.id !== pu.id);
          switch (pu.type) {
            case "FireUp":
              player.explosionRange = Math.min(player.explosionRange + 1, 8);
              gs.score += 20;
              break;
            case "BombUp":
              player.maxBombs = Math.min(player.maxBombs + 1, 8);
              gs.score += 20;
              break;
            case "SpeedUp":
              player.speedMultiplier = Math.min(
                player.speedMultiplier + 0.3,
                2.5,
              );
              gs.score += 20;
              break;
            case "Shield":
              player.shieldActive = true;
              player.shieldTimer = 5000;
              gs.score += 30;
              break;
            case "Life":
              player.lives = Math.min(player.lives + 1, 3);
              gs.score += 50;
              break;
            case "FuseUp":
              player.bombFuseLevel = Math.min(player.bombFuseLevel + 1, 2);
              gs.score += 20;
              break;
            case "FuseDown":
              player.bombFuseLevel = Math.max(player.bombFuseLevel - 1, -2);
              gs.score += 20;
              break;
            case "SpeedDown":
              player.speedMultiplier = Math.max(
                player.speedMultiplier - 0.3,
                0.3,
              );
              gs.score += 0;
              setDisplayCurseFlash(true);
              setTimeout(() => setDisplayCurseFlash(false), 1500);
              break;
            case "Curse":
              player.speedMultiplier = Math.max(
                player.speedMultiplier - 0.3,
                0.5,
              );
              player.explosionRange = Math.max(player.explosionRange - 1, 1);
              gs.score = Math.max(gs.score - 10, 0);
              setDisplayCurseFlash(true);
              setTimeout(() => setDisplayCurseFlash(false), 1500);
              break;
            case "BombType": {
              const types: BombType[] = [
                "normal",
                "lava",
                "freeze",
                "kick",
                "portal",
                "surprise",
              ];
              player.bombType = types[Math.floor(Math.random() * types.length)];
              gs.score += 30;
              break;
            }
          }
        }

        // Bomber enemies pick up items
        for (const enemy of gs.enemies) {
          if (enemy.type !== "bomber" || !enemy.alive || enemy.moving) continue;
          const bomberPickups = gs.powerUps.filter(
            (p) => p.tx === enemy.tx && p.ty === enemy.ty,
          );
          for (const pu of bomberPickups) {
            if (pu.type === "Life" || pu.type === "BombType") continue;
            gs.powerUps = gs.powerUps.filter((p) => p.id !== pu.id);
            switch (pu.type) {
              case "FireUp":
                enemy.bombRange = Math.min((enemy.bombRange ?? 2) + 1, 8);
                break;
              case "BombUp":
                enemy.bombRange = Math.min((enemy.bombRange ?? 2) + 1, 8);
                break;
              case "SpeedUp":
                enemy.speed = Math.min(enemy.speed + 0.1, 2.0);
                break;
              case "FuseUp":
                enemy.bombInterval = Math.max(
                  (enemy.bombInterval ?? 5000) - 500,
                  2000,
                );
                break;
              case "FuseDown":
                enemy.bombInterval = Math.min(
                  (enemy.bombInterval ?? 5000) + 500,
                  8000,
                );
                break;
              case "Curse":
                enemy.speed = Math.max(enemy.speed - 0.1, 0.3);
                break;
              default:
                break;
            }
          }
        }

        // Check explosion hits
        if (player.alive && !player.invincible && !player.shieldActive) {
          for (const exp of gs.explosions) {
            if (exp.cells.some((c) => c.x === player.tx && c.y === player.ty)) {
              player.lives -= 1;
              if (player.lives > 0) {
                player.invincible = true;
                player.invincibleTimer = 3000;
                const c = tileCenter(1, 1);
                player.tx = 1;
                player.ty = 1;
                player.px = c.x;
                player.py = c.y;
                player.fromPx = c.x;
                player.fromPy = c.y;
                player.moving = false;
              } else {
                player.alive = false;
                if (!gs.isMultiplayer || !gs.player2?.alive) {
                  gs.status = "gameover";
                  setGameStatus("gameover");
                  setFinalScore(gs.score);
                  onGameOver(gs.score);
                  return;
                }
              }
              break;
            }
          }
        }

        // Enemy collision
        if (player.alive && !player.invincible) {
          for (const enemy of enemies) {
            if (!enemy.alive) continue;
            const dist = Math.hypot(enemy.px - player.px, enemy.py - player.py);
            if (dist < TILE * 0.6) {
              if (player.shieldActive) {
                player.shieldActive = false;
                player.shieldTimer = 0;
                player.invincible = true;
                player.invincibleTimer = 3000;
              } else {
                player.lives -= 1;
                player.invincible = true;
                player.invincibleTimer = 3000;
                if (player.lives <= 0) {
                  player.alive = false;
                  if (!gs.isMultiplayer || !gs.player2?.alive) {
                    gs.status = "gameover";
                    setGameStatus("gameover");
                    setFinalScore(gs.score);
                    onGameOver(gs.score);
                    return;
                  }
                } else {
                  const c = tileCenter(1, 1);
                  player.tx = 1;
                  player.ty = 1;
                  player.px = c.x;
                  player.py = c.y;
                  player.fromPx = c.x;
                  player.fromPy = c.y;
                  player.moving = false;
                }
              }
              break;
            }
          }
        }

        // Portal check
        if (
          gs.portal?.visible &&
          player.tx === gs.portal.tx &&
          player.ty === gs.portal.ty
        ) {
          gs.status = "levelcomplete";
          setGameStatus("levelcomplete");
          return;
        }
      }

      // ─── Player 2 Movement & Logic (multiplayer host) ──────────────────
      if (gs.isMultiplayer && gs.player2) {
        const p2 = gs.player2;
        if (p2.invincible) {
          p2.invincibleTimer -= dt * 1000;
          if (p2.invincibleTimer <= 0) {
            p2.invincible = false;
            p2.invincibleTimer = 0;
          }
        }
        if (p2.shieldActive) {
          p2.shieldTimer -= dt * 1000;
          if (p2.shieldTimer <= 0) {
            p2.shieldActive = false;
            p2.shieldTimer = 0;
          }
        }

        if (p2.alive) {
          const p2OnIce = gs.icePatches.some(
            (ip) => ip.tx === p2.tx && ip.ty === p2.ty,
          );
          const p2OnSticky = gs.stickyTiles.some(
            (st) => st.tx === p2.tx && st.ty === p2.ty,
          );
          const p2Speed =
            4 *
            p2.speedMultiplier *
            (p2OnIce ? 0.1 : 1) *
            (p2OnSticky ? 0.3 : 1);
          if (p2.moving) {
            p2.moveProgress += dt * p2Speed;
            if (p2.moveProgress >= 1) {
              p2.moveProgress = 1;
              const tc2 = tileCenter(p2.tx, p2.ty);
              p2.px = tc2.x;
              p2.py = tc2.y;
              p2.moving = false;
              // Teleport portal check (portal bomb portals)
              if (gs.teleportPortals.length === 2) {
                const enteredP2 = gs.teleportPortals.find(
                  (tp) => tp.tx === p2.tx && tp.ty === p2.ty,
                );
                if (enteredP2) {
                  const otherP2 = gs.teleportPortals.find(
                    (tp) => tp.id !== enteredP2.id,
                  );
                  if (otherP2) {
                    const cp2t = tileCenter(otherP2.tx, otherP2.ty);
                    p2.tx = otherP2.tx;
                    p2.ty = otherP2.ty;
                    p2.px = cp2t.x;
                    p2.py = cp2t.y;
                    p2.fromPx = cp2t.x;
                    p2.fromPy = cp2t.y;
                    p2.moving = false;
                    gs.p2TeleportFlashUntil = now + 300;
                  }
                }
              }
              // Teleport pad check
              if (gs.teleportPads && gs.teleportPads.length > 0) {
                const padP2 = gs.teleportPads.find(
                  (p) => p.tx === p2.tx && p.ty === p2.ty,
                );
                if (padP2) {
                  const partnerP2 = gs.teleportPads.find(
                    (p) => p.pairId === padP2.pairId && p.id !== padP2.id,
                  );
                  if (partnerP2) {
                    const cp2p = tileCenter(partnerP2.tx, partnerP2.ty);
                    p2.tx = partnerP2.tx;
                    p2.ty = partnerP2.ty;
                    p2.px = cp2p.x;
                    p2.py = cp2p.y;
                    p2.fromPx = cp2p.x;
                    p2.fromPy = cp2p.y;
                    p2.moving = false;
                    gs.p2TeleportFlashUntil = now + 300;
                  }
                }
              }
              // Level exit portal check for P2
              if (
                gs.portal?.visible &&
                p2.tx === gs.portal.tx &&
                p2.ty === gs.portal.ty
              ) {
                gs.status = "levelcomplete";
                setGameStatus("levelcomplete");
                return;
              }
            } else {
              const tc2 = tileCenter(p2.tx, p2.ty);
              p2.px = p2.fromPx + (tc2.x - p2.fromPx) * p2.moveProgress;
              p2.py = p2.fromPy + (tc2.y - p2.fromPy) * p2.moveProgress;
            }
          }
          if (!p2.moving) {
            const p2ActiveKey = p2KeyOrderRef.current[0];
            const p2Mirrored = now < p2.mirrorUntil;
            const p2DirMap: Record<string, { dx: number; dy: number }> = {
              KeyW: { dx: 0, dy: p2Mirrored ? 1 : -1 },
              KeyS: { dx: 0, dy: p2Mirrored ? -1 : 1 },
              KeyA: { dx: p2Mirrored ? 1 : -1, dy: 0 },
              KeyD: { dx: p2Mirrored ? -1 : 1, dy: 0 },
              ArrowUp: { dx: 0, dy: p2Mirrored ? 1 : -1 },
              ArrowDown: { dx: 0, dy: p2Mirrored ? -1 : 1 },
              ArrowLeft: { dx: p2Mirrored ? 1 : -1, dy: 0 },
              ArrowRight: { dx: p2Mirrored ? -1 : 1, dy: 0 },
            };
            const p2Dir = p2ActiveKey ? p2DirMap[p2ActiveKey] : null;
            if (p2Dir) {
              const ntx2 = p2.tx + p2Dir.dx;
              const nty2 = p2.ty + p2Dir.dy;
              const kickBombP2 = gs.bombs.find(
                (b) =>
                  b.tx === ntx2 &&
                  b.ty === nty2 &&
                  b.bombType === "kick" &&
                  !b.sliding,
              );
              if (kickBombP2) {
                let destTx2 = ntx2;
                let destTy2 = nty2;
                while (true) {
                  const nx3 = destTx2 + p2Dir.dx;
                  const ny3 = destTy2 + p2Dir.dy;
                  if (
                    !isWalkable(map, cols, rows, nx3, ny3) ||
                    gs.bombs.some(
                      (b) =>
                        b.id !== kickBombP2.id && b.tx === nx3 && b.ty === ny3,
                    )
                  )
                    break;
                  destTx2 = nx3;
                  destTy2 = ny3;
                }
                kickBombP2.sliding = true;
                kickBombP2.slideDx = p2Dir.dx;
                kickBombP2.slideDy = p2Dir.dy;
                kickBombP2.slideProgress = 0;
                kickBombP2.slideFromTx = ntx2;
                kickBombP2.slideFromTy = nty2;
                kickBombP2.tx = destTx2;
                kickBombP2.ty = destTy2;
                if (isWalkable(map, cols, rows, ntx2, nty2)) {
                  p2.fromPx = p2.px;
                  p2.fromPy = p2.py;
                  p2.tx = ntx2;
                  p2.ty = nty2;
                  p2.moving = true;
                  p2.moveProgress = 0;
                }
              } else if (
                isWalkable(map, cols, rows, ntx2, nty2) &&
                !gs.bombs.some((b) => b.tx === ntx2 && b.ty === nty2)
              ) {
                p2.fromPx = p2.px;
                p2.fromPy = p2.py;
                p2.tx = ntx2;
                p2.ty = nty2;
                p2.moving = true;
                p2.moveProgress = 0;
              }
            }
          }

          // P2 power-up collection
          const p2Pickups = gs.powerUps.filter(
            (pu) => pu.tx === p2.tx && pu.ty === p2.ty,
          );
          for (const pu of p2Pickups) {
            gs.powerUps = gs.powerUps.filter((p) => p.id !== pu.id);
            switch (pu.type) {
              case "FireUp":
                p2.explosionRange = Math.min(p2.explosionRange + 1, 8);
                gs.score += 20;
                break;
              case "BombUp":
                p2.maxBombs = Math.min(p2.maxBombs + 1, 8);
                gs.score += 20;
                break;
              case "SpeedUp":
                p2.speedMultiplier = Math.min(p2.speedMultiplier + 0.3, 2.5);
                gs.score += 20;
                break;
              case "Shield":
                p2.shieldActive = true;
                p2.shieldTimer = 5000;
                gs.score += 30;
                break;
              case "Life":
                p2.lives = Math.min(p2.lives + 1, 3);
                gs.score += 50;
                break;
              case "BombType": {
                const types2: BombType[] = [
                  "normal",
                  "lava",
                  "freeze",
                  "kick",
                  "portal",
                  "surprise",
                ];
                p2.bombType = types2[Math.floor(Math.random() * types2.length)];
                gs.score += 30;
                break;
              }
              case "FuseUp":
                p2.bombFuseLevel = Math.min(p2.bombFuseLevel + 1, 2);
                gs.score += 20;
                break;
              case "FuseDown":
                p2.bombFuseLevel = Math.max(p2.bombFuseLevel - 1, -2);
                gs.score += 20;
                break;
              case "SpeedDown":
                p2.speedMultiplier = Math.max(p2.speedMultiplier - 0.3, 0.3);
                setDisplayCurseFlash(true);
                setTimeout(() => setDisplayCurseFlash(false), 1500);
                break;
              case "Curse":
                p2.speedMultiplier = Math.max(p2.speedMultiplier - 0.3, 0.5);
                p2.explosionRange = Math.max(p2.explosionRange - 1, 1);
                gs.score = Math.max(gs.score - 10, 0);
                setDisplayCurseFlash(true);
                setTimeout(() => setDisplayCurseFlash(false), 1500);
                break;
            }
          }

          // P2 explosion hit check
          if (!p2.invincible && !p2.shieldActive) {
            for (const exp of gs.explosions) {
              if (exp.cells.some((c) => c.x === p2.tx && c.y === p2.ty)) {
                if (p2.shieldActive) {
                  p2.shieldActive = false;
                  p2.invincible = true;
                  p2.invincibleTimer = 3000;
                } else {
                  p2.lives -= 1;
                  if (p2.lives > 0) {
                    p2.invincible = true;
                    p2.invincibleTimer = 3000;
                    const cp2 = tileCenter(1, 1);
                    p2.tx = 1;
                    p2.ty = 1;
                    p2.px = cp2.x;
                    p2.py = cp2.y;
                    p2.fromPx = cp2.x;
                    p2.fromPy = cp2.y;
                    p2.moving = false;
                  } else {
                    p2.alive = false;
                    if (!gs.player.alive) {
                      gs.status = "gameover";
                      setGameStatus("gameover");
                      setFinalScore(gs.score);
                      onGameOver(gs.score);
                      return;
                    }
                  }
                }
                break;
              }
            }
          }

          // P2 enemy collision
          if (!p2.invincible) {
            for (const enemy of enemies) {
              if (!enemy.alive) continue;
              const dist2 = Math.hypot(enemy.px - p2.px, enemy.py - p2.py);
              if (dist2 < TILE * 0.6) {
                if (p2.shieldActive) {
                  p2.shieldActive = false;
                  p2.invincible = true;
                  p2.invincibleTimer = 3000;
                } else {
                  p2.lives -= 1;
                  if (p2.lives > 0) {
                    p2.invincible = true;
                    p2.invincibleTimer = 3000;
                    const cp2e = tileCenter(1, 1);
                    p2.tx = 1;
                    p2.ty = 1;
                    p2.px = cp2e.x;
                    p2.py = cp2e.y;
                    p2.fromPx = cp2e.x;
                    p2.fromPy = cp2e.y;
                    p2.moving = false;
                  } else {
                    p2.alive = false;
                    if (!gs.player.alive) {
                      gs.status = "gameover";
                      setGameStatus("gameover");
                      setFinalScore(gs.score);
                      onGameOver(gs.score);
                      return;
                    }
                  }
                }
                break;
              }
            }
          }
        }
      }

      // Enemy AI
      for (const enemy of enemies) {
        if (!enemy.alive) continue;

        if (enemy.type === "shooter") {
          enemy.shootTimer -= dt * 1000;
          if (enemy.shootTimer <= 0) {
            enemy.shootTimer = 3000;
            const d = randomDir();
            gs.projectiles.push({
              id: gs.projectileIdCounter++,
              px: enemy.px,
              py: enemy.py,
              dx: d.x,
              dy: d.y,
              speed: PROJECTILE_SPEED,
              alive: true,
            });
          }
        }

        if (enemy.type === "bomber") {
          enemy.bombTimer -= dt * 1000;
          if (enemy.bombTimer <= 0) {
            enemy.bombTimer = enemy.bombInterval ?? 5000;
            if (!gs.bombs.some((b) => b.tx === enemy.tx && b.ty === enemy.ty)) {
              const bombId = gs.bombIdCounter++;
              enemy.ownBombIds.push(bombId);
              gs.bombs.push({
                id: bombId,
                tx: enemy.tx,
                ty: enemy.ty,
                placedAt: performance.now(),
                range: enemy.bombRange ?? 2,
                hasDrifted: false,
                fuseMs: 2000,
                bombType: "normal",
              });
            }
          }
        }

        enemy.dirChangeTimer -= dt * 1000;

        const enemyOnIce = gs.icePatches.some(
          (ip) => ip.tx === enemy.tx && ip.ty === enemy.ty,
        );
        const enemyOnSticky = gs.stickyTiles.some(
          (st) => st.tx === enemy.tx && st.ty === enemy.ty,
        );
        const effectiveEnemySpeed =
          enemy.speed * (enemyOnIce ? 0.1 : 1) * (enemyOnSticky ? 0.3 : 1);

        if (enemy.moving) {
          enemy.moveProgress += dt * effectiveEnemySpeed;
          if (enemy.moveProgress >= 1) {
            enemy.moveProgress = 1;
            const tc = tileCenter(enemy.tx, enemy.ty);
            enemy.px = tc.x;
            enemy.py = tc.y;
            enemy.moving = false;
            // Enemy teleport portal check
            if (gs.teleportPortals.length === 2) {
              const etp = gs.teleportPortals.find(
                (tp) => tp.tx === enemy.tx && tp.ty === enemy.ty,
              );
              if (etp) {
                const otherTp = gs.teleportPortals.find(
                  (tp) => tp.id !== etp.id,
                );
                if (otherTp) {
                  const c = tileCenter(otherTp.tx, otherTp.ty);
                  enemy.tx = otherTp.tx;
                  enemy.ty = otherTp.ty;
                  enemy.px = c.x;
                  enemy.py = c.y;
                  enemy.fromPx = c.x;
                  enemy.fromPy = c.y;
                }
              }
            }
            // Enemy teleport pad check
            if (gs.teleportPads && gs.teleportPads.length > 0) {
              const pad = gs.teleportPads.find(
                (p) => p.tx === enemy.tx && p.ty === enemy.ty,
              );
              if (pad) {
                const partner = gs.teleportPads.find(
                  (p) => p.pairId === pad.pairId && p.id !== pad.id,
                );
                if (partner) {
                  const c = tileCenter(partner.tx, partner.ty);
                  enemy.tx = partner.tx;
                  enemy.ty = partner.ty;
                  enemy.px = c.x;
                  enemy.py = c.y;
                  enemy.fromPx = c.x;
                  enemy.fromPy = c.y;
                }
              }
            }
          } else {
            const tc = tileCenter(enemy.tx, enemy.ty);
            enemy.px =
              enemy.fromPx + (tc.x - enemy.fromPx) * enemy.moveProgress;
            enemy.py =
              enemy.fromPy + (tc.y - enemy.fromPy) * enemy.moveProgress;
          }
        }

        if (!enemy.moving) {
          if (enemy.dirChangeTimer <= 0) {
            enemy.dirChangeTimer =
              ENEMY_DIR_CHANGE_INTERVAL * (0.5 + Math.random());
            if (enemy.type === "chaser" && Math.random() < 0.75) {
              const dx = player.tx - enemy.tx;
              const dy = player.ty - enemy.ty;
              if (Math.abs(dx) > Math.abs(dy)) {
                enemy.dx = dx > 0 ? 1 : -1;
                enemy.dy = 0;
              } else {
                enemy.dx = 0;
                enemy.dy = dy > 0 ? 1 : -1;
              }
            } else {
              const d = randomDir();
              enemy.dx = d.x;
              enemy.dy = d.y;
            }
          }

          const ntx = enemy.tx + enemy.dx;
          const nty = enemy.ty + enemy.dy;
          if (
            isWalkable(map, cols, rows, ntx, nty, enemy.canPassWalls) &&
            !gs.bombs.some((b) => b.tx === ntx && b.ty === nty)
          ) {
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
              if (
                isWalkable(map, cols, rows, nx2, ny2, enemy.canPassWalls) &&
                !gs.bombs.some((b) => b.tx === nx2 && b.ty === ny2)
              ) {
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
              const d = randomDir();
              enemy.dx = d.x;
              enemy.dy = d.y;
            }
          }
        }
      }

      // Update spawners
      for (const spawner of gs.spawners) {
        if (!spawner.alive) continue;
        if (now >= spawner.nextSpawnAt) {
          const config = getLevelConfig(gs.level);
          const types = config.enemyTypes;
          const spawnType = types[Math.floor(Math.random() * types.length)];
          const c = tileCenter(spawner.tx, spawner.ty);
          const d = randomDir();
          gs.enemies.push({
            id: gs.enemyIdCounter++,
            tx: spawner.tx,
            ty: spawner.ty,
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
            type: spawnType,
            shootTimer: 3000,
            canPassWalls: spawnType === "wallpasser",
            generation: 0,
            speed: 2,
            bombTimer: 5000,
            ownBombIds: [],
          });
          spawner.nextSpawnAt = now + 30000;
        }
      }

      // Portal visibility check
      if (
        gs.portal &&
        !gs.portal.visible &&
        gs.enemies.filter((e) => e.alive).length === 0
      ) {
        gs.portal.visible = true;
      }

      // ── Trap Tiles ──────────────────────────────────────────────────────────
      if (gs.levelModifier === "trapTiles") {
        for (const tt of gs.trapTiles) {
          if (tt.triggered) {
            // Check detonation
            if (now - tt.triggeredAt >= 3000) {
              // Explode in 4 cardinal directions (range 1)
              const cells = [
                { x: tt.tx - 1, y: tt.ty },
                { x: tt.tx + 1, y: tt.ty },
                { x: tt.tx, y: tt.ty - 1 },
                { x: tt.tx, y: tt.ty + 1 },
              ].filter(
                (c) =>
                  c.x >= 0 &&
                  c.x < cols &&
                  c.y >= 0 &&
                  c.y < rows &&
                  map[c.y][c.x] !== 1,
              );
              // Damage player
              if (
                player.alive &&
                !player.invincible &&
                cells.some((c) => c.x === player.tx && c.y === player.ty)
              ) {
                if (player.shieldActive) {
                  player.shieldActive = false;
                  player.shieldTimer = 0;
                  player.invincible = true;
                  player.invincibleTimer = 3000;
                } else {
                  player.lives -= 1;
                  player.invincible = true;
                  player.invincibleTimer = 3000;
                  if (player.lives <= 0) {
                    player.alive = false;
                    if (gs.isMultiplayer && gs.player2?.alive) {
                      // P2 still alive, continue
                    } else {
                      gs.status = "gameover";
                      setGameStatus("gameover");
                      setFinalScore(gs.score);
                      onGameOver(gs.score);
                      return;
                    }
                  }
                  const cpos = tileCenter(1, 1);
                  player.tx = 1;
                  player.ty = 1;
                  player.px = cpos.x;
                  player.py = cpos.y;
                  player.fromPx = cpos.x;
                  player.fromPy = cpos.y;
                  player.moving = false;
                }
              }
              // Damage P2
              if (
                gs.isMultiplayer &&
                gs.player2?.alive &&
                !gs.player2.invincible &&
                cells.some(
                  (c) => c.x === gs.player2!.tx && c.y === gs.player2!.ty,
                )
              ) {
                if (gs.player2.shieldActive) {
                  gs.player2.shieldActive = false;
                  gs.player2.shieldTimer = 0;
                  gs.player2.invincible = true;
                  gs.player2.invincibleTimer = 3000;
                } else {
                  gs.player2.lives -= 1;
                  gs.player2.invincible = true;
                  gs.player2.invincibleTimer = 3000;
                  if (gs.player2.lives <= 0) {
                    gs.player2.alive = false;
                    if (!gs.player.alive) {
                      gs.status = "gameover";
                      setGameStatus("gameover");
                      setFinalScore(gs.score);
                      onGameOver(gs.score);
                      return;
                    }
                  } else {
                    const cp2t = tileCenter(1, 1);
                    gs.player2.tx = 1;
                    gs.player2.ty = 1;
                    gs.player2.px = cp2t.x;
                    gs.player2.py = cp2t.y;
                    gs.player2.fromPx = cp2t.x;
                    gs.player2.fromPy = cp2t.y;
                    gs.player2.moving = false;
                  }
                }
              }
              // Damage enemies
              for (const enemy of enemies) {
                if (!enemy.alive) continue;
                if (enemy.invincibleUntil && enemy.invincibleUntil > now)
                  continue;
                if (cells.some((c) => c.x === enemy.tx && c.y === enemy.ty)) {
                  enemy.alive = false;
                  gs.score += 50;
                  if (gs.timerActive && gs.timerMs !== null)
                    gs.timerMs += 30000;
                }
              }
              // Add visual explosion
              gs.explosions.push({
                id: gs.explosionIdCounter++,
                cells,
                startedAt: now,
                bombType: "normal",
              });
              tt.triggered = false; // mark as dead (filter below)
            }
          } else {
            // Check if player stepped on it
            if (
              player.tx === tt.tx &&
              player.ty === tt.ty &&
              !player.invincible
            ) {
              tt.triggered = true;
              tt.triggeredAt = now;
            }
            // Check if P2 stepped on it
            if (
              gs.isMultiplayer &&
              gs.player2?.alive &&
              gs.player2.tx === tt.tx &&
              gs.player2.ty === tt.ty &&
              !gs.player2.invincible
            ) {
              tt.triggered = true;
              tt.triggeredAt = now;
            }
          }
        }
        gs.trapTiles = gs.trapTiles.filter(
          (tt) => !(tt.triggered && now - tt.triggeredAt >= 3000),
        );
      }

      // ── Conveyor Belts ──────────────────────────────────────────────────────
      if (gs.levelModifier === "conveyorBelts") {
        for (const ct of gs.conveyorTiles) {
          // Push player
          if (!player.moving && player.tx === ct.tx && player.ty === ct.ty) {
            const ntx = player.tx + ct.dir.x;
            const nty = player.ty + ct.dir.y;
            if (
              isWalkable(map, cols, rows, ntx, nty) &&
              !gs.bombs.some((b) => b.tx === ntx && b.ty === nty)
            ) {
              player.fromPx = player.px;
              player.fromPy = player.py;
              player.tx = ntx;
              player.ty = nty;
              player.moving = true;
              player.moveProgress = 0;
            }
          }
          // Push enemies
          for (const enemy of enemies) {
            if (!enemy.alive || enemy.moving) continue;
            if (enemy.tx !== ct.tx || enemy.ty !== ct.ty) continue;
            const ntx = enemy.tx + ct.dir.x;
            const nty = enemy.ty + ct.dir.y;
            if (
              isWalkable(map, cols, rows, ntx, nty, enemy.canPassWalls) &&
              !gs.bombs.some((b) => b.tx === ntx && b.ty === nty)
            ) {
              enemy.fromPx = enemy.px;
              enemy.fromPy = enemy.py;
              enemy.tx = ntx;
              enemy.ty = nty;
              enemy.moving = true;
              enemy.moveProgress = 0;
            }
          }
          // Push bombs
          for (const bomb of gs.bombs) {
            if (bomb.tx !== ct.tx || bomb.ty !== ct.ty) continue;
            const ntx = bomb.tx + ct.dir.x;
            const nty = bomb.ty + ct.dir.y;
            if (
              isWalkable(map, cols, rows, ntx, nty) &&
              !gs.bombs.some(
                (b) => b.id !== bomb.id && b.tx === ntx && b.ty === nty,
              )
            ) {
              bomb.tx = ntx;
              bomb.ty = nty;
            }
          }
          // Push P2
          if (
            gs.isMultiplayer &&
            gs.player2?.alive &&
            !gs.player2.moving &&
            gs.player2.tx === ct.tx &&
            gs.player2.ty === ct.ty
          ) {
            const ntx2 = gs.player2.tx + ct.dir.x;
            const nty2 = gs.player2.ty + ct.dir.y;
            if (
              isWalkable(map, cols, rows, ntx2, nty2) &&
              !gs.bombs.some((b) => b.tx === ntx2 && b.ty === nty2)
            ) {
              gs.player2.fromPx = gs.player2.px;
              gs.player2.fromPy = gs.player2.py;
              gs.player2.tx = ntx2;
              gs.player2.ty = nty2;
              gs.player2.moving = true;
              gs.player2.moveProgress = 0;
            }
          }
        }
      }

      // ── Gravity Zones ───────────────────────────────────────────────────────
      if (gs.levelModifier === "gravityZones") {
        gs.gravityPullTimer -= dt * 1000;
        if (gs.gravityPullTimer <= 0) {
          gs.gravityPullTimer = 2000;
          for (const gz of gs.gravityZones) {
            // Pull player if within 2 tiles
            if (player.alive && !player.moving) {
              const dx = gz.tx - player.tx;
              const dy = gz.ty - player.ty;
              const dist = Math.abs(dx) + Math.abs(dy);
              if (dist > 0 && dist <= 2) {
                const stepX = dx !== 0 ? Math.sign(dx) : 0;
                const stepY = dy !== 0 ? Math.sign(dy) : 0;
                // Prefer axis with larger delta
                const moveX = Math.abs(dx) >= Math.abs(dy) ? stepX : 0;
                const moveY = Math.abs(dx) >= Math.abs(dy) ? 0 : stepY;
                const ntx = player.tx + moveX;
                const nty = player.ty + moveY;
                if (
                  isWalkable(map, cols, rows, ntx, nty) &&
                  !gs.bombs.some((b) => b.tx === ntx && b.ty === nty)
                ) {
                  player.fromPx = player.px;
                  player.fromPy = player.py;
                  player.tx = ntx;
                  player.ty = nty;
                  player.moving = true;
                  player.moveProgress = 0;
                }
              }
            }
            // Pull P2 if within 2 tiles
            if (gs.isMultiplayer && gs.player2?.alive && !gs.player2.moving) {
              const dx2 = gz.tx - gs.player2.tx;
              const dy2 = gz.ty - gs.player2.ty;
              const dist2 = Math.abs(dx2) + Math.abs(dy2);
              if (dist2 > 0 && dist2 <= 2) {
                const moveX2 =
                  Math.abs(dx2) >= Math.abs(dy2) ? Math.sign(dx2) : 0;
                const moveY2 =
                  Math.abs(dx2) >= Math.abs(dy2) ? 0 : Math.sign(dy2);
                const ntx2 = gs.player2.tx + moveX2;
                const nty2 = gs.player2.ty + moveY2;
                if (
                  isWalkable(map, cols, rows, ntx2, nty2) &&
                  !gs.bombs.some((b) => b.tx === ntx2 && b.ty === nty2)
                ) {
                  gs.player2.fromPx = gs.player2.px;
                  gs.player2.fromPy = gs.player2.py;
                  gs.player2.tx = ntx2;
                  gs.player2.ty = nty2;
                  gs.player2.moving = true;
                  gs.player2.moveProgress = 0;
                }
              }
            }
            // Pull enemies
            for (const enemy of enemies) {
              if (!enemy.alive || enemy.moving) continue;
              const dx = gz.tx - enemy.tx;
              const dy = gz.ty - enemy.ty;
              const dist = Math.abs(dx) + Math.abs(dy);
              if (dist > 0 && dist <= 2) {
                const moveX = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0;
                const moveY = Math.abs(dx) >= Math.abs(dy) ? 0 : Math.sign(dy);
                const ntx = enemy.tx + moveX;
                const nty = enemy.ty + moveY;
                if (
                  isWalkable(map, cols, rows, ntx, nty, enemy.canPassWalls) &&
                  !gs.bombs.some((b) => b.tx === ntx && b.ty === nty)
                ) {
                  enemy.fromPx = enemy.px;
                  enemy.fromPy = enemy.py;
                  enemy.tx = ntx;
                  enemy.ty = nty;
                  enemy.moving = true;
                  enemy.moveProgress = 0;
                }
              }
            }
          }
        }
      }

      // ── Mirror Tiles ────────────────────────────────────────────────────────
      if (gs.levelModifier === "mirrorTiles") {
        for (const mt of gs.mirrorTiles) {
          if (
            player.tx === mt.tx &&
            player.ty === mt.ty &&
            now > player.mirrorUntil
          ) {
            player.mirrorUntil = now + 3000;
          }
        }
        if (gs.isMultiplayer && gs.player2?.alive) {
          for (const mt of gs.mirrorTiles) {
            if (
              gs.player2.tx === mt.tx &&
              gs.player2.ty === mt.ty &&
              now > gs.player2.mirrorUntil
            ) {
              gs.player2.mirrorUntil = now + 3000;
            }
          }
        }
      }

      // ── Shrinking Arena ─────────────────────────────────────────────────────
      if (gs.levelModifier === "shrinkingArena") {
        if (now - gs.lastShrinkAt >= 60000) {
          gs.lastShrinkAt = now;
          gs.shrinkCount++;
          // Collapse outermost non-solid tiles (border ring)
          for (let col = 0; col < cols; col++) {
            for (let row of [0, rows - 1]) {
              if (map[row][col] === 0 || map[row][col] === 2) {
                map[row][col] = 1;
                // Kill player if in collapsing tile
                if (
                  player.alive &&
                  !player.invincible &&
                  player.tx === col &&
                  player.ty === row
                ) {
                  player.lives -= 1;
                  player.invincible = true;
                  player.invincibleTimer = 3000;
                  if (player.lives <= 0) {
                    player.alive = false;
                    if (gs.isMultiplayer && gs.player2?.alive) {
                      // P2 still alive, continue
                    } else {
                      gs.status = "gameover";
                      setGameStatus("gameover");
                      setFinalScore(gs.score);
                      onGameOver(gs.score);
                      return;
                    }
                  }
                  const cpos = tileCenter(1, 1);
                  player.tx = 1;
                  player.ty = 1;
                  player.px = cpos.x;
                  player.py = cpos.y;
                  player.fromPx = cpos.x;
                  player.fromPy = cpos.y;
                  player.moving = false;
                }
                // Kill enemies caught in collapsing tile
                for (const enemy of enemies) {
                  if (enemy.alive && enemy.tx === col && enemy.ty === row) {
                    enemy.alive = false;
                    gs.score += 50;
                    if (gs.timerActive && gs.timerMs !== null)
                      gs.timerMs += 30000;
                  }
                }
              }
            }
          }
          for (let row = 1; row < rows - 1; row++) {
            for (let col of [0, cols - 1]) {
              if (map[row][col] === 0 || map[row][col] === 2) {
                map[row][col] = 1;
                if (
                  player.alive &&
                  !player.invincible &&
                  player.tx === col &&
                  player.ty === row
                ) {
                  player.lives -= 1;
                  player.invincible = true;
                  player.invincibleTimer = 3000;
                  if (player.lives <= 0) {
                    player.alive = false;
                    if (gs.isMultiplayer && gs.player2?.alive) {
                      // P2 still alive, continue
                    } else {
                      gs.status = "gameover";
                      setGameStatus("gameover");
                      setFinalScore(gs.score);
                      onGameOver(gs.score);
                      return;
                    }
                  }
                  const cpos = tileCenter(1, 1);
                  player.tx = 1;
                  player.ty = 1;
                  player.px = cpos.x;
                  player.py = cpos.y;
                  player.fromPx = cpos.x;
                  player.fromPy = cpos.y;
                  player.moving = false;
                }
                for (const enemy of enemies) {
                  if (enemy.alive && enemy.tx === col && enemy.ty === row) {
                    enemy.alive = false;
                    gs.score += 50;
                    if (gs.timerActive && gs.timerMs !== null)
                      gs.timerMs += 30000;
                  }
                }
              }
            }
          }
        }
      }

      // Update display
      setDisplayScore(gs.score);
      setDisplayLives(Math.min(player.lives, 3));
      if (gs.isMultiplayer && gs.player2) {
        const p2d = gs.player2;
        setDisplayLivesP2(Math.min(p2d.lives, 3));
        setDisplayStatsP2({
          maxBombs: p2d.maxBombs,
          range: p2d.explosionRange,
          speed: p2d.speedMultiplier,
        });
        setDisplayBombTypeP2(p2d.bombType);
        setDisplayShieldP2(
          p2d.shieldActive ? Math.ceil(p2d.shieldTimer / 1000) : 0,
        );
      }
      setDisplayLevel(gs.level);
      setDisplayShield(
        player.shieldActive ? Math.ceil(player.shieldTimer / 1000) : 0,
      );
      setDisplayStats({
        maxBombs: player.maxBombs,
        range: player.explosionRange,
        speed: player.speedMultiplier,
      });
      setDisplayBombType(player.bombType);
      setDisplayTimer(gs.timerMs);

      // Online co-op: host drains guest input queue and pushes state to guest
      if (isOnlineCoopRef.current && onlineRoleRef.current === "host") {
        const inputs = p2InputQueueRef.current.splice(0);
        for (const inp of inputs) {
          if (inp.bomb) {
            placeP2Bomb(gs);
          } else if (inp.pressed) {
            p2KeyOrderRef.current = [
              inp.code,
              ...p2KeyOrderRef.current.filter((k) => k !== inp.code),
            ];
          } else {
            p2KeyOrderRef.current = p2KeyOrderRef.current.filter(
              (k) => k !== inp.code,
            );
          }
        }
        const mgr = rtcManagerRef.current;
        if (mgr?.isConnected && now - lastStatePushRef.current > 33) {
          lastStatePushRef.current = now;
          gs.hostClockOffset = 0; // will be computed by guest
          const stateJson = serializeGameState(gs);
          // Embed host timestamp so guest can compute clock offset
          const packet = JSON.parse(stateJson);
          packet._hostSentAt = now;
          sendData(mgr, JSON.stringify(packet));
        }
      }

      // Draw
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      drawGame(ctx, gs, now);
    },
    [onGameOver, placeP2Bomb],
  );

  // RAF loop
  useEffect(() => {
    if (screen !== "game") return;
    const loop = (now: number) => {
      tick(now);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tick, screen]);

  // Key handlers
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);
      // Last-key-wins: keep keyOrder with most recent key at front
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        if (isOnlineCoopRef.current && onlineRoleRef.current === "guest") {
          // Guest: send movement input to host via DataChannel instead
          const mgr = rtcManagerRef.current;
          if (mgr)
            sendData(
              mgr,
              JSON.stringify({ type: "input", code: e.key, pressed: true }),
            );
        } else {
          keyOrderRef.current = [
            e.key,
            ...keyOrderRef.current.filter((k) => k !== e.key),
          ];
        }
      }
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          " ",
          "Control",
          "Shift",
        ].includes(e.key)
      ) {
        e.preventDefault();
      }
      if (e.key === " " || (e.key === "Control" && e.location === 2)) {
        // Online guest: send bomb event to host
        if (isOnlineCoopRef.current && onlineRoleRef.current === "guest") {
          const mgr = rtcManagerRef.current;
          if (mgr) sendData(mgr, JSON.stringify({ type: "bomb" }));
          return;
        }
        const gs = gsRef.current;
        if (!gs || gs.status !== "playing" || !gs.player.alive) return;
        const { tx, ty } = gs.player;
        const activeBombs = gs.bombs.filter((b) => b.tx === tx && b.ty === ty);
        if (
          activeBombs.length === 0 &&
          gs.bombs.filter(
            (b) => !gs.enemies.some((e) => e.ownBombIds.includes(b.id)),
          ).length < gs.player.maxBombs
        ) {
          gs.bombs.push({
            id: gs.bombIdCounter++,
            tx,
            ty,
            placedAt: performance.now(),
            range: gs.player.explosionRange,
            hasDrifted: false,
            fuseMs: Math.max(
              1000,
              Math.min(4000, 2000 - gs.player.bombFuseLevel * 500),
            ),
            bombType:
              gs.player.bombType === "surprise"
                ? (
                    ["normal", "lava", "freeze", "kick", "portal"] as BombType[]
                  )[Math.floor(Math.random() * 5)]
                : gs.player.bombType,
          });
        }
      }
      // P2 local co-op controls -- only when NOT online host
      if (["KeyW", "KeyS", "KeyA", "KeyD"].includes(e.code)) {
        if (!(isOnlineCoopRef.current && onlineRoleRef.current === "host")) {
          p2KeyOrderRef.current = [
            e.code,
            ...p2KeyOrderRef.current.filter((k) => k !== e.code),
          ];
        }
      }
      if (e.key === "Shift") {
        e.preventDefault();
        const gs = gsRef.current;
        if (
          gs &&
          gs.status === "playing" &&
          !(isOnlineCoopRef.current && onlineRoleRef.current === "host")
        ) {
          placeP2Bomb(gs);
        }
      }
      if (
        (e.key === " " || e.key === "Enter") &&
        gameStatus === "levelcomplete"
      ) {
        advanceLevel();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        if (isOnlineCoopRef.current && onlineRoleRef.current === "guest") {
          const mgr = rtcManagerRef.current;
          if (mgr)
            sendData(
              mgr,
              JSON.stringify({ type: "input", code: e.key, pressed: false }),
            );
        } else {
          keyOrderRef.current = keyOrderRef.current.filter((k) => k !== e.key);
        }
      }
      if (["KeyW", "KeyS", "KeyA", "KeyD"].includes(e.code)) {
        if (!(isOnlineCoopRef.current && onlineRoleRef.current === "host")) {
          p2KeyOrderRef.current = p2KeyOrderRef.current.filter(
            (k) => k !== e.code,
          );
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [gameStatus, advanceLevel, placeP2Bomb]);

  // ─── Online Co-op keepAlive & disconnect effects ────────────────────────
  useEffect(() => {
    if (screen !== "game" || !isOnlineCoopRef.current) return;
    if (!actor) return;
    const id = window.setInterval(() => {
      if (onlineRoomIdRef.current) {
        actor.keepAlive(onlineRoomIdRef.current).catch(() => {});
      }
    }, 10000);
    return () => clearInterval(id);
  }, [screen, actor]);

  // ─── Online Co-op handlers ───────────────────────────────────────────────

  const cleanupOnlineIntervals = () => {
    for (const id of onlineIntervalsRef.current) {
      clearInterval(id);
    }
    onlineIntervalsRef.current = [];
  };

  const cleanupOnline = async (roomId?: string) => {
    cleanupOnlineIntervals();
    const rid = roomId ?? onlineRoomIdRef.current;
    if (rid && actor) {
      try {
        await actor.leaveRoom(rid);
      } catch (_) {}
    }
    if (rtcManager) {
      closeConnection(rtcManager);
      setRtcManager(null);
    }
    rtcManagerRef.current = null;
    isOnlineCoopRef.current = false;
    onlineRoleRef.current = null;
    onlineRoomIdRef.current = "";
    onlineGuestActiveRef.current = false;
    setOnlineDisconnected(false);
    setP2LeftMessage("");
    setRtcConnected(false);
    setOnlineScreen("none");
    setOnlineRoomId("");
    setOnlineRoomName("");
    setOnlineRoomNameDisplay("");
    setOnlineError("");
    setOnlinePlayerCount(1);
  };

  const loadOnlineRooms = async () => {
    if (!actor) return;
    setOnlineError("");
    try {
      const rooms = await actor.listRooms();
      setOnlineRooms(rooms);
    } catch (_) {
      setOnlineError("Failed to load rooms. Please try again.");
    }
  };

  const handleHostCreate = async () => {
    if (!actor || !onlineRoomName.trim() || !onlineName.trim()) return;
    setOnlineError("");
    try {
      const gridSizeMap = { S: "13x11", M: "17x13", L: "21x15" };
      const roomId = await actor.createRoom(
        onlineRoomName.trim(),
        onlineName.trim(),
        gridSizeMap[onlineGridSize],
      );
      setOnlineRoomId(roomId);
      onlineRoomIdRef.current = roomId;
      setOnlineRoomNameDisplay(onlineRoomName.trim());

      // Create WebRTC manager as host
      const mgr = createWebRTCManager("host");
      mgr.onConnected = () => setRtcConnected(true);
      mgr.onDisconnected = () => setRtcConnected(false);

      // Collect and push ICE candidates to backend
      mgr.pc.onicecandidate = async (e) => {
        if (e.candidate) {
          try {
            await actor.pushHostIce(roomId, JSON.stringify(e.candidate));
          } catch (_) {}
        }
      };

      // Create offer and push to backend
      const offerJson = await hostCreateOffer(mgr);
      await actor.pushOffer(roomId, offerJson);

      setRtcManager(mgr);
      setOnlineScreen("hostWaiting");
      setOnlinePlayerCount(1);

      // Poll for answer and guest ICE candidates
      const pollInterval = window.setInterval(async () => {
        try {
          // Keep room alive
          await actor.keepAlive(roomId);

          // Check for answer
          if (!mgr.isConnected) {
            const answer = await actor.getAnswer(roomId);
            if (answer) {
              try {
                await hostReceiveAnswer(mgr, answer);
              } catch (_) {}
            }
          }

          // Always drain guest ICE candidates
          const iceCandidates = await actor.getGuestIce(roomId);
          for (const c of iceCandidates) {
            try {
              await addIceCandidate(mgr, c);
            } catch (_) {}
          }

          // Update player count
          const started = await actor.isGameStarted(roomId);
          if (started) setOnlinePlayerCount(2);
          const rooms = await actor.listRooms();
          const thisRoom = rooms.find((r) => r.id === roomId);
          if (thisRoom) setOnlinePlayerCount(Number(thisRoom.playerCount));
        } catch (_) {}
      }, 1500);
      onlineIntervalsRef.current.push(pollInterval);
    } catch (_e) {
      setOnlineError("Failed to create room. Please try again.");
    }
  };

  const handleGuestJoin = async (
    roomId: string,
    roomName: string,
    roomGridSize?: string,
  ) => {
    if (!actor || !onlineName.trim()) return;
    setOnlineError("");
    try {
      const joined = await actor.joinRoom(roomId);
      if (!joined) {
        setOnlineError("Room is full or no longer available.");
        return;
      }
      setOnlineRoomId(roomId);
      onlineRoomIdRef.current = roomId;
      setOnlineRoomNameDisplay(roomName);

      // Create WebRTC manager as guest
      const mgr = createWebRTCManager("guest");
      mgr.onConnected = () => setRtcConnected(true);
      mgr.onDisconnected = () => setRtcConnected(false);

      // Collect and push ICE candidates to backend
      mgr.pc.onicecandidate = async (e) => {
        if (e.candidate) {
          try {
            await actor.pushGuestIce(roomId, JSON.stringify(e.candidate));
          } catch (_) {}
        }
      };

      setRtcManager(mgr);
      setOnlineScreen("joinWaiting");

      // Poll for offer, then answer, then host ICE + game start
      const pollInterval = window.setInterval(async () => {
        try {
          // Keep room alive
          await actor.keepAlive(roomId);

          // If we haven't set remote description yet, poll for offer
          if (!mgr.dc && mgr.pc.signalingState === "stable") {
            const offer = await actor.getOffer(roomId);
            if (offer) {
              const answerJson = await guestReceiveOffer(mgr, offer);
              await actor.pushAnswer(roomId, answerJson);
            }
          }

          // Always drain host ICE candidates
          const iceCandidates = await actor.getHostIce(roomId);
          for (const c of iceCandidates) {
            try {
              await addIceCandidate(mgr, c);
            } catch (_) {}
          }

          // Check if game started
          const started = await actor.isGameStarted(roomId);
          if (started || mgr.isConnected) {
            // Also listen for START message via DataChannel
          }
        } catch (_) {}
      }, 1500);
      onlineIntervalsRef.current.push(pollInterval);

      // Listen for START message from host (format: "START:SIZE" e.g. "START:M")
      const joinedGridSize = roomGridSize ?? "M";

      mgr.onMessage = (data: string) => {
        if (data.startsWith("START") || data.startsWith("REJOIN")) {
          cleanupOnlineIntervals();

          // Parse grid size from message
          const parts = data.split(":");
          const gs = parts[1] ?? joinedGridSize;
          const isRejoin = data.startsWith("REJOIN");
          const gridSizeColsRows: Record<string, [number, number]> = {
            S: [13, 11],
            M: [17, 13],
            L: [21, 15],
          };
          const [cols, rows] = gridSizeColsRows[gs] ?? [17, 13];

          // Set up guest to receive state snapshots from host
          rtcManagerRef.current = mgr;
          mgr.onMessage = (stateJson: string) => {
            try {
              // Only accept state messages (JSON objects starting with {)
              if (stateJson.startsWith("{")) {
                latestRemoteStateRef.current = stateJson;
                // Packet timing is updated in the tick loop when the message is consumed
              }
            } catch (_) {}
          };
          mgr.onDisconnected = () => {
            setOnlineDisconnected(true);
          };

          isOnlineCoopRef.current = true;
          onlineRoleRef.current = "guest";
          onlineRoomIdRef.current = onlineRoomId;

          setOnlineScreen("none");
          if (isRejoin) {
            // Rejoining mid-game: start with 1 life, state snapshot from host will sync soon
            startGame(cols, rows, true);
          } else {
            startGame(cols, rows, true);
          }
        } else if (data.startsWith("{")) {
          // Early state push before START acknowledgment -- store it
          latestRemoteStateRef.current = data;
        }
      };
    } catch (_) {
      setOnlineError("Failed to join room. Please try again.");
    }
  };

  const handleRejoinHandshake = async () => {
    if (!actor || !onlineRoomIdRef.current) return;
    const roomId = onlineRoomIdRef.current;

    // Create a fresh WebRTC manager for the new connection
    const newMgr = createWebRTCManager("host");
    newMgr.pc.onicecandidate = async (e) => {
      if (e.candidate) {
        try {
          await actor.pushHostIce(roomId, JSON.stringify(e.candidate));
        } catch (_) {}
      }
    };

    const offerJson = await hostCreateOffer(newMgr);
    await actor.pushOffer(roomId, offerJson);

    rtcManagerRef.current = newMgr;
    setRtcManager(newMgr);

    const rejoinPoll = window.setInterval(async () => {
      try {
        await actor.keepAlive(roomId);
        if (!newMgr.isConnected) {
          const answer = await actor.getAnswer(roomId);
          if (answer) {
            try {
              await hostReceiveAnswer(newMgr, answer);
            } catch (_) {}
          }
        }
        const iceCandidates = await actor.getGuestIce(roomId);
        for (const c of iceCandidates) {
          try {
            await addIceCandidate(newMgr, c);
          } catch (_) {}
        }
        if (newMgr.isConnected) {
          clearInterval(rejoinPoll);
          // Send REJOIN message with grid size
          sendData(newMgr, `REJOIN:${onlineGridSize}`);
          onlineGuestActiveRef.current = true;
          setP2LeftMessage("");
          // Rewire input handler for new guest
          newMgr.onMessage = (data: string) => {
            try {
              const msg = JSON.parse(data) as {
                type: string;
                code?: string;
                pressed?: boolean;
              };
              if (msg.type === "input" && msg.code) {
                p2InputQueueRef.current.push({
                  code: msg.code,
                  pressed: msg.pressed ?? false,
                });
              } else if (msg.type === "bomb") {
                p2InputQueueRef.current.push({
                  code: "",
                  pressed: false,
                  bomb: true,
                });
              }
            } catch (_) {}
          };
          newMgr.onDisconnected = () => {
            onlineGuestActiveRef.current = false;
            p2KeyOrderRef.current = [];
            setP2LeftMessage("Player 2 left — waiting for new player");
          };
        }
      } catch (_) {}
    }, 1500);
    onlineIntervalsRef.current.push(rejoinPoll);
  };

  const handleHostStart = async () => {
    if (!actor || !onlineRoomId || !rtcManager) return;
    try {
      await actor.startGame(onlineRoomId);
      // Encode grid size in START message so guest knows which size to use
      sendData(rtcManager, `START:${onlineGridSize}`);
      cleanupOnlineIntervals();

      // Wire up host to receive guest inputs over DataChannel
      const mgr = rtcManager;
      rtcManagerRef.current = mgr;
      mgr.onMessage = (data: string) => {
        try {
          const msg = JSON.parse(data) as {
            type: string;
            code?: string;
            pressed?: boolean;
          };
          if (msg.type === "input" && msg.code) {
            p2InputQueueRef.current.push({
              code: msg.code,
              pressed: msg.pressed ?? false,
            });
          } else if (msg.type === "bomb") {
            p2InputQueueRef.current.push({
              code: "",
              pressed: false,
              bomb: true,
            });
          }
        } catch (_) {}
      };
      mgr.onDisconnected = () => {
        // Guest disconnected -- host game continues, P2 freezes
        onlineGuestActiveRef.current = false;
        p2KeyOrderRef.current = []; // stop P2 movement
        setP2LeftMessage("Player 2 left — waiting for new player");
        // Poll for a new guest joining (every 3s)
        const rejoinPoll = window.setInterval(async () => {
          if (!isOnlineCoopRef.current || !actor) {
            clearInterval(rejoinPoll);
            return;
          }
          try {
            const rooms = await actor.listRooms();
            const thisRoom = rooms.find(
              (r) => r.id === onlineRoomIdRef.current,
            );
            const guestPresent = thisRoom && Number(thisRoom.playerCount) >= 2;
            if (guestPresent) {
              setP2LeftMessage("");
              clearInterval(rejoinPoll);
              await handleRejoinHandshake();
            }
          } catch (_) {}
        }, 3000);
        onlineIntervalsRef.current.push(rejoinPoll);
      };

      // Parse grid size and start game
      const gridSizeColsRows: Record<string, [number, number]> = {
        S: [13, 11],
        M: [17, 13],
        L: [21, 15],
      };
      const [cols, rows] = gridSizeColsRows[onlineGridSize] ?? [17, 13];

      isOnlineCoopRef.current = true;
      onlineRoleRef.current = "host";
      onlineRoomIdRef.current = onlineRoomId;

      setOnlineScreen("none");
      startGame(cols, rows, true);
      // Immediately push the initial game state so guest gets it without waiting 100ms
      const initialMgr = rtcManagerRef.current;
      const initialGs = gsRef.current;
      if (initialMgr?.isConnected && initialGs) {
        sendData(initialMgr, serializeGameState(initialGs));
        lastStatePushRef.current = performance.now();
      }
    } catch (_) {
      setOnlineError("Failed to start game. Please try again.");
    }
  };

  if (screen === "picker") {
    const handleStart = () => {
      let c = Number.parseInt(customCols, 10);
      let r = Number.parseInt(customRows, 10);
      if (Number.isNaN(c) || c < 9) c = 9;
      if (c > 29) c = 29;
      if (c % 2 === 0) c += 1;
      if (Number.isNaN(r) || r < 7) r = 7;
      if (r > 21) r = 21;
      if (r % 2 === 0) r += 1;
      startGame(c, r, false);
    };

    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-8 px-4 relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, #050510 0%, #0a0a1a 40%, #050a10 70%, #0a0510 100%)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(127,255,176,0.04) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(255,180,50,0.04) 0%, transparent 50%), radial-gradient(circle at 50% 50%, rgba(100,100,255,0.03) 0%, transparent 60%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            opacity: 0.04,
            backgroundImage:
              "linear-gradient(rgba(127,255,176,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(127,255,176,0.5) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="text-center space-y-4 relative z-10">
          <div
            className="flex justify-center gap-8 text-3xl mb-2"
            style={{ opacity: 0.5 }}
          >
            <span
              style={{ filter: "drop-shadow(0 0 8px rgba(255,100,50,0.8))" }}
            >
              💣
            </span>
            <span
              style={{ filter: "drop-shadow(0 0 8px rgba(255,200,50,0.8))" }}
            >
              💥
            </span>
            <span
              style={{ filter: "drop-shadow(0 0 8px rgba(255,100,50,0.8))" }}
            >
              💣
            </span>
          </div>
          <h1
            className="font-display font-black uppercase"
            style={{
              color: "#7fffb0",
              fontSize: "clamp(2.5rem, 8vw, 5rem)",
              letterSpacing: "0.2em",
              textShadow:
                "0 0 10px rgba(127,255,176,0.9), 0 0 30px rgba(127,255,176,0.5), 0 0 60px rgba(127,255,176,0.3), 0 0 100px rgba(127,255,176,0.15)",
              lineHeight: 1,
            }}
          >
            BOMBERMAN
          </h1>
          <p
            className="font-mono text-xs tracking-[0.4em] uppercase"
            style={{
              color: "#4aaa6a",
              textShadow: "0 0 10px rgba(74,170,106,0.5)",
            }}
          >
            ★ Classic Arcade · Endless Worlds ★
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {[
              { emoji: "🌿", name: "Grasslands", color: "#4aff8a" },
              { emoji: "🏕️", name: "Desert", color: "#ffb830" },
              { emoji: "❄️", name: "Ice", color: "#60d0ff" },
              { emoji: "🌋", name: "Lava", color: "#ff5030" },
              { emoji: "🚀", name: "Space", color: "#b060ff" },
            ].map(({ emoji, name, color }) => (
              <span
                key={name}
                className="font-mono text-xs px-3 py-1 rounded-full border"
                style={{
                  color,
                  borderColor: `${color}44`,
                  background: `${color}0d`,
                  textShadow: `0 0 8px ${color}66`,
                }}
              >
                {emoji} {name}
              </span>
            ))}
          </div>
        </div>

        <div
          className="flex flex-col items-center gap-4 p-8 rounded-sm relative z-10"
          style={{
            background: "rgba(5,10,8,0.92)",
            border: "1px solid rgba(127,255,176,0.2)",
            boxShadow:
              "0 0 0 1px rgba(127,255,176,0.05), 0 0 40px rgba(127,255,176,0.12), 0 20px 60px rgba(0,0,0,0.8)",
            backdropFilter: "blur(10px)",
          }}
        >
          <p
            className="font-mono text-sm tracking-widest uppercase"
            style={{ color: "#4a7a5a" }}
          >
            Select Grid Size
          </p>
          <div className="flex gap-3">
            {(
              [
                { label: "S", cols: 13, rows: 11 },
                { label: "M", cols: 17, rows: 13 },
                { label: "L", cols: 21, rows: 15 },
              ] as const
            ).map(({ label, cols, rows }) => (
              <Button
                key={label}
                data-ocid={`picker.${label.toLowerCase()}.button`}
                onClick={() => {
                  setShowCustom(false);
                  startGame(cols, rows, false);
                }}
                className="font-mono font-black text-lg w-14 h-14 border"
                style={{
                  background: "rgba(127,255,176,0.05)",
                  borderColor: "rgba(127,255,176,0.3)",
                  color: "#7fffb0",
                  textShadow: "0 0 8px rgba(127,255,176,0.6)",
                  boxShadow: "0 0 15px rgba(127,255,176,0.08)",
                  transition: "all 0.2s",
                  fontSize: "1.1rem",
                  fontWeight: 900,
                }}
              >
                {label}
              </Button>
            ))}
            <Button
              data-ocid="picker.custom.button"
              onClick={() => setShowCustom((v) => !v)}
              className="font-mono font-black text-sm w-20 h-14 border"
              style={{
                background: showCustom
                  ? "rgba(127,255,176,0.1)"
                  : "transparent",
                borderColor: "#2d5a2d",
                color: "#7fffb0",
              }}
            >
              Custom
            </Button>
          </div>

          <div
            className="mt-4 pt-4 border-t"
            style={{ borderColor: "rgba(68,170,255,0.2)" }}
          >
            <Button
              data-ocid="picker.localcoop.button"
              onClick={() => {
                setShowCoOpPicker(true);
              }}
              className="font-mono font-bold tracking-widest uppercase w-full py-3 border"
              style={{
                background: "rgba(68,170,255,0.1)",
                borderColor: "#44aaff",
                color: "#44aaff",
              }}
            >
              🎮 LOCAL CO-OP
            </Button>
            <p
              className="font-mono text-xs text-center mt-2"
              style={{ color: "#2a4a6a" }}
            >
              P1: Arrows + R.Ctrl &nbsp;|&nbsp; P2: WASD + Shift
            </p>
          </div>

          <div className="mt-2">
            <Button
              data-ocid="picker.onlinecoop.button"
              onClick={() => setOnlineScreen("name")}
              className="font-mono font-bold tracking-widest uppercase w-full py-3 border"
              style={{
                background: "rgba(160,80,255,0.1)",
                borderColor: "#a050ff",
                color: "#c080ff",
              }}
            >
              🌐 ONLINE CO-OP
            </Button>
            <p
              className="font-mono text-xs text-center mt-2"
              style={{ color: "#4a2a6a" }}
            >
              Play with a friend online via WebRTC
            </p>
          </div>

          {showCoOpPicker && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center"
              style={{ background: "rgba(0,0,0,0.75)" }}
            >
              <div
                className="flex flex-col gap-4 p-6 rounded-sm"
                style={{
                  background: "#07120a",
                  border: "1px solid rgba(68,170,255,0.4)",
                  boxShadow: "0 0 40px rgba(68,170,255,0.15)",
                  minWidth: 280,
                }}
              >
                <p
                  className="font-mono font-bold text-sm tracking-widest uppercase text-center"
                  style={{ color: "#44aaff" }}
                >
                  🎮 Local Co-op — Select Grid Size
                </p>
                <div className="flex gap-3 justify-center">
                  {(
                    [
                      { label: "S", cols: 13, rows: 11 },
                      { label: "M", cols: 17, rows: 13 },
                      { label: "L", cols: 21, rows: 15 },
                    ] as const
                  ).map(({ label, cols, rows }) => (
                    <Button
                      key={label}
                      onClick={() => {
                        setShowCoOpPicker(false);
                        startGame(cols, rows, true);
                      }}
                      className="font-mono font-black text-lg w-14 h-14 border"
                      style={{
                        background: "rgba(68,170,255,0.08)",
                        borderColor: "rgba(68,170,255,0.4)",
                        color: "#44aaff",
                        textShadow: "0 0 8px rgba(68,170,255,0.6)",
                      }}
                    >
                      {label}
                    </Button>
                  ))}
                  <Button
                    onClick={() => setShowCoOpCustom((v) => !v)}
                    className="font-mono font-black text-sm w-20 h-14 border"
                    style={{
                      background: showCoOpCustom
                        ? "rgba(68,170,255,0.15)"
                        : "transparent",
                      borderColor: "#44aaff",
                      color: "#44aaff",
                    }}
                  >
                    Custom
                  </Button>
                </div>
                {showCoOpCustom && (
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-3 items-center">
                      <label
                        htmlFor="coop-cols-input"
                        className="font-mono text-xs w-14"
                        style={{ color: "#4a7a9a" }}
                      >
                        Cols
                      </label>
                      <Input
                        id="coop-cols-input"
                        type="number"
                        value={coOpCustomCols}
                        onChange={(e) => setCoOpCustomCols(e.target.value)}
                        className="w-24 font-mono text-center"
                        min={9}
                        max={29}
                        style={{
                          background: "rgba(10,20,30,0.9)",
                          borderColor: "#1a3a5a",
                          color: "#44aaff",
                        }}
                      />
                    </div>
                    <div className="flex gap-3 items-center">
                      <label
                        htmlFor="coop-rows-input"
                        className="font-mono text-xs w-14"
                        style={{ color: "#4a7a9a" }}
                      >
                        Rows
                      </label>
                      <Input
                        id="coop-rows-input"
                        type="number"
                        value={coOpCustomRows}
                        onChange={(e) => setCoOpCustomRows(e.target.value)}
                        className="w-24 font-mono text-center"
                        min={7}
                        max={21}
                        style={{
                          background: "rgba(10,20,30,0.9)",
                          borderColor: "#1a3a5a",
                          color: "#44aaff",
                        }}
                      />
                    </div>
                    <Button
                      onClick={() => {
                        let c = Number.parseInt(coOpCustomCols, 10);
                        let r = Number.parseInt(coOpCustomRows, 10);
                        if (Number.isNaN(c) || c < 9) c = 9;
                        if (c > 29) c = 29;
                        if (c % 2 === 0) c += 1;
                        if (Number.isNaN(r) || r < 7) r = 7;
                        if (r > 21) r = 21;
                        if (r % 2 === 0) r += 1;
                        setShowCoOpPicker(false);
                        startGame(c, r, true);
                      }}
                      className="font-mono font-bold tracking-widest uppercase border w-full"
                      style={{
                        background: "rgba(68,170,255,0.15)",
                        borderColor: "#44aaff",
                        color: "#44aaff",
                      }}
                    >
                      ▶ START CO-OP
                    </Button>
                  </div>
                )}
                <Button
                  onClick={() => {
                    setShowCoOpPicker(false);
                    setShowCoOpCustom(false);
                  }}
                  className="font-mono text-xs border mt-1"
                  style={{
                    background: "transparent",
                    borderColor: "#2a4a6a",
                    color: "#44aaff",
                    opacity: 0.7,
                  }}
                >
                  ✕ Cancel
                </Button>
              </div>
            </div>
          )}

          {showCustom && (
            <div className="flex flex-col gap-3 pt-2">
              <div className="flex gap-3 items-center">
                <label
                  htmlFor="picker-cols-input"
                  className="font-mono text-xs"
                  style={{ color: "#4a7a5a", width: "60px" }}
                >
                  Cols
                </label>
                <Input
                  id="picker-cols-input"
                  data-ocid="picker.cols.input"
                  type="number"
                  value={customCols}
                  onChange={(e) => setCustomCols(e.target.value)}
                  className="w-24 font-mono text-center"
                  min={9}
                  max={29}
                  style={{
                    background: "rgba(10,20,12,0.9)",
                    borderColor: "#1a3a2a",
                    color: "#7fffb0",
                  }}
                />
                <span
                  className="font-mono text-xs"
                  style={{ color: "#2a4a3a" }}
                >
                  (9–29, odd)
                </span>
              </div>
              <div className="flex gap-3 items-center">
                <label
                  htmlFor="picker-rows-input"
                  className="font-mono text-xs"
                  style={{ color: "#4a7a5a", width: "60px" }}
                >
                  Rows
                </label>
                <Input
                  id="picker-rows-input"
                  data-ocid="picker.rows.input"
                  type="number"
                  value={customRows}
                  onChange={(e) => setCustomRows(e.target.value)}
                  className="w-24 font-mono text-center"
                  min={7}
                  max={21}
                  style={{
                    background: "rgba(10,20,12,0.9)",
                    borderColor: "#1a3a2a",
                    color: "#7fffb0",
                  }}
                />
                <span
                  className="font-mono text-xs"
                  style={{ color: "#2a4a3a" }}
                >
                  (7–21, odd)
                </span>
              </div>
              <Button
                data-ocid="picker.start.button"
                onClick={handleStart}
                className="font-mono font-bold tracking-widest uppercase border w-full mt-1"
                style={{
                  background: "rgba(127,255,176,0.15)",
                  borderColor: "#7fffb0",
                  color: "#7fffb0",
                }}
              >
                ▶ START
              </Button>
            </div>
          )}
        </div>

        {(highScore > 0 || bestLevel > 0) && (
          <div
            className="flex gap-6 text-center relative z-10 px-6 py-3 rounded-sm"
            style={{
              background: "rgba(127,255,176,0.05)",
              border: "1px solid rgba(127,255,176,0.15)",
            }}
          >
            {highScore > 0 && (
              <div className="flex flex-col items-center gap-0.5">
                <span
                  className="font-mono text-xs"
                  style={{ color: "#4a7a5a" }}
                >
                  Best Score
                </span>
                <span
                  className="font-mono font-bold"
                  style={{ color: "#ffcc55", fontSize: "1.1rem" }}
                >
                  {highScore.toString().padStart(5, "0")}
                </span>
              </div>
            )}
            {bestLevel > 0 && (
              <div className="flex flex-col items-center gap-0.5">
                <span
                  className="font-mono text-xs"
                  style={{ color: "#4a7a5a" }}
                >
                  Best Level
                </span>
                <span
                  className="font-mono font-bold"
                  style={{ color: "#7fffb0", fontSize: "1.1rem" }}
                >
                  Lv {bestLevel}
                </span>
              </div>
            )}
          </div>
        )}

        <div
          className="font-mono text-xs space-y-1 text-center relative z-10"
          style={{ color: "#5a9a7a", letterSpacing: "0.1em" }}
        >
          <p>P1: ⬆⬇⬅➡ MOVE &nbsp;·&nbsp; R.CTRL BOMB</p>
          <p style={{ color: "#4a8aaa" }}>
            P2: WASD MOVE &nbsp;·&nbsp; SHIFT BOMB
          </p>
          <p style={{ color: "#3a6a5a" }}>
            💣 Destroy boxes · ✨ Collect items · 🌀 Find the portal
          </p>
        </div>

        <div className="flex flex-col items-center gap-3 relative z-10">
          <p
            className="font-mono text-xs tracking-widest uppercase"
            style={{ color: "#2a4a3a" }}
          >
            Items
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              { icon: "🔥", label: "Fire Up", color: "#ff8040" },
              { icon: "💣", label: "Bomb Up", color: "#ff5050" },
              { icon: "⚡", label: "Speed+", color: "#ffd700" },
              { icon: "🐢", label: "Speed-", color: "#99aa44" },
              { icon: "⏩", label: "Fuse+", color: "#44ddaa" },
              { icon: "⏪", label: "Fuse-", color: "#cc8844" },
              { icon: "🛡️", label: "Shield", color: "#40d0ff" },
              { icon: "❤️", label: "Life", color: "#ff6080" },
              { icon: "☠️", label: "Curse", color: "#a060ff" },
              { icon: "🎁", label: "Bomb Type", color: "#88ffcc" },
            ].map(({ icon, label, color }) => (
              <div key={label} className="flex flex-col items-center gap-1">
                <span
                  className="text-xl"
                  style={{ filter: `drop-shadow(0 0 6px ${color}80)` }}
                >
                  {icon}
                </span>
                <span
                  className="font-mono"
                  style={{
                    fontSize: "0.55rem",
                    color: `${color}99`,
                    letterSpacing: "0.05em",
                  }}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
          <p
            className="font-mono text-xs tracking-widest uppercase mt-1"
            style={{ color: "#2a4a3a" }}
          >
            Bombs
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              { icon: "💣", label: "Normal", color: "#aaaaaa" },
              { icon: "🌋", label: "Lava", color: "#ff5030" },
              { icon: "❄️", label: "Freeze", color: "#60d0ff" },
              { icon: "👟", label: "Kick", color: "#ffcc44" },
              { icon: "🌀", label: "Portal", color: "#cc44ff" },
              { icon: "❓", label: "Surprise", color: "#ff88cc" },
            ].map(({ icon, label, color }) => (
              <div key={label} className="flex flex-col items-center gap-1">
                <span
                  className="text-xl"
                  style={{ filter: `drop-shadow(0 0 6px ${color}80)` }}
                >
                  {icon}
                </span>
                <span
                  className="font-mono"
                  style={{
                    fontSize: "0.55rem",
                    color: `${color}99`,
                    letterSpacing: "0.05em",
                  }}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <footer
          className="font-mono text-xs relative z-10"
          style={{ color: "#2a4a3a" }}
        >
          © {new Date().getFullYear()}.{" "}
          <a
            href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#3a6a4a" }}
          >
            Built with ♥ using caffeine.ai
          </a>
        </footer>

        {/* ── Online Co-op Overlay ─────────────────────────────────────────── */}
        {onlineScreen !== "none" && (
          <div
            data-ocid="online.modal"
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.88)" }}
          >
            <div
              className="flex flex-col gap-5 p-7 rounded-sm relative"
              style={{
                background: "linear-gradient(135deg, #0a0515 0%, #120820 100%)",
                border: "1px solid rgba(160,80,255,0.4)",
                boxShadow:
                  "0 0 60px rgba(160,80,255,0.18), 0 0 0 1px rgba(160,80,255,0.08)",
                minWidth: 320,
                maxWidth: 420,
                width: "90vw",
              }}
            >
              {/* ── Name Entry ─────────────────────────────────────────────── */}
              {onlineScreen === "name" && (
                <>
                  <div className="text-center">
                    <div className="text-3xl mb-2">🌐</div>
                    <p
                      className="font-mono font-bold tracking-widest uppercase"
                      style={{ color: "#c080ff", fontSize: "1rem" }}
                    >
                      Online Co-op
                    </p>
                    <p
                      className="font-mono text-xs mt-1"
                      style={{ color: "#6040a0" }}
                    >
                      Enter your display name
                    </p>
                  </div>
                  <Input
                    data-ocid="online.name.input"
                    value={onlineName}
                    onChange={(e) => setOnlineName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && onlineName.trim())
                        setOnlineScreen("choice");
                    }}
                    placeholder="Your name..."
                    maxLength={20}
                    autoFocus
                    className="font-mono text-center text-sm"
                    style={{
                      background: "rgba(160,80,255,0.08)",
                      borderColor: "#6040a0",
                      color: "#c080ff",
                    }}
                  />
                  {onlineError && (
                    <p
                      className="font-mono text-xs text-center"
                      style={{ color: "#ff6080" }}
                      data-ocid="online.error_state"
                    >
                      {onlineError}
                    </p>
                  )}
                  <div className="flex gap-3">
                    <Button
                      data-ocid="online.cancel.button"
                      onClick={() => cleanupOnline()}
                      className="font-mono text-xs border flex-1"
                      style={{
                        background: "transparent",
                        borderColor: "#3a2060",
                        color: "#7050b0",
                      }}
                    >
                      ✕ Back
                    </Button>
                    <Button
                      data-ocid="online.continue.button"
                      onClick={() => {
                        if (onlineName.trim()) setOnlineScreen("choice");
                      }}
                      disabled={!onlineName.trim()}
                      className="font-mono font-bold tracking-widest uppercase border flex-[2]"
                      style={{
                        background: "rgba(160,80,255,0.15)",
                        borderColor: "#a050ff",
                        color: "#c080ff",
                      }}
                    >
                      Continue →
                    </Button>
                  </div>
                </>
              )}

              {/* ── Choice ─────────────────────────────────────────────────── */}
              {onlineScreen === "choice" && (
                <>
                  <div className="text-center">
                    <p
                      className="font-mono font-bold tracking-widest uppercase"
                      style={{ color: "#c080ff", fontSize: "1rem" }}
                    >
                      Hello, {onlineName}
                    </p>
                    <p
                      className="font-mono text-xs mt-1"
                      style={{ color: "#6040a0" }}
                    >
                      What would you like to do?
                    </p>
                  </div>
                  <div className="flex flex-col gap-3">
                    <Button
                      data-ocid="online.host.button"
                      onClick={() => setOnlineScreen("hostSetup")}
                      className="font-mono font-bold tracking-widest uppercase py-4 border"
                      style={{
                        background: "rgba(160,80,255,0.12)",
                        borderColor: "#a050ff",
                        color: "#c080ff",
                        fontSize: "1rem",
                      }}
                    >
                      🏠 Host a Game
                    </Button>
                    <Button
                      data-ocid="online.join.button"
                      onClick={async () => {
                        setOnlineScreen("joinList");
                        await loadOnlineRooms();
                      }}
                      className="font-mono font-bold tracking-widest uppercase py-4 border"
                      style={{
                        background: "rgba(80,160,255,0.12)",
                        borderColor: "#50a0ff",
                        color: "#80c0ff",
                        fontSize: "1rem",
                      }}
                    >
                      🔍 Join a Game
                    </Button>
                  </div>
                  <Button
                    data-ocid="online.back.button"
                    onClick={() => setOnlineScreen("name")}
                    className="font-mono text-xs border"
                    style={{
                      background: "transparent",
                      borderColor: "#3a2060",
                      color: "#7050b0",
                    }}
                  >
                    ← Back
                  </Button>
                </>
              )}

              {/* ── Host Setup ─────────────────────────────────────────────── */}
              {onlineScreen === "hostSetup" && (
                <>
                  <div className="text-center">
                    <p
                      className="font-mono font-bold tracking-widest uppercase"
                      style={{ color: "#c080ff", fontSize: "1rem" }}
                    >
                      🏠 Host a Game
                    </p>
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="online-roomname"
                        className="font-mono text-xs"
                        style={{ color: "#7050b0" }}
                      >
                        Room Name
                      </label>
                      <Input
                        id="online-roomname"
                        data-ocid="online.roomname.input"
                        value={onlineRoomName}
                        onChange={(e) => setOnlineRoomName(e.target.value)}
                        placeholder="My Bomberman Room"
                        maxLength={30}
                        className="font-mono text-sm"
                        style={{
                          background: "rgba(160,80,255,0.08)",
                          borderColor: "#6040a0",
                          color: "#c080ff",
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <span
                        className="font-mono text-xs"
                        style={{ color: "#7050b0" }}
                      >
                        Grid Size
                      </span>
                      <div className="flex gap-2">
                        {(["S", "M", "L"] as const).map((sz) => (
                          <Button
                            key={sz}
                            data-ocid={`online.gridsize.${sz.toLowerCase()}.button`}
                            onClick={() => setOnlineGridSize(sz)}
                            className="font-mono font-black text-lg w-14 h-12 border flex-1"
                            style={{
                              background:
                                onlineGridSize === sz
                                  ? "rgba(160,80,255,0.25)"
                                  : "rgba(160,80,255,0.05)",
                              borderColor:
                                onlineGridSize === sz ? "#a050ff" : "#4a2080",
                              color:
                                onlineGridSize === sz ? "#e0a0ff" : "#7050b0",
                            }}
                          >
                            {sz}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {onlineError && (
                    <p
                      className="font-mono text-xs text-center"
                      style={{ color: "#ff6080" }}
                      data-ocid="online.error_state"
                    >
                      {onlineError}
                    </p>
                  )}
                  <div className="flex gap-3">
                    <Button
                      data-ocid="online.hostsetup.back.button"
                      onClick={() => {
                        setOnlineError("");
                        setOnlineScreen("choice");
                      }}
                      className="font-mono text-xs border flex-1"
                      style={{
                        background: "transparent",
                        borderColor: "#3a2060",
                        color: "#7050b0",
                      }}
                    >
                      ← Back
                    </Button>
                    <Button
                      data-ocid="online.create.button"
                      onClick={handleHostCreate}
                      disabled={!onlineRoomName.trim() || !actor}
                      className="font-mono font-bold tracking-widest uppercase border flex-[2]"
                      style={{
                        background: "rgba(160,80,255,0.15)",
                        borderColor: "#a050ff",
                        color: "#c080ff",
                      }}
                    >
                      ▶ Create Room
                    </Button>
                  </div>
                </>
              )}

              {/* ── Host Waiting ────────────────────────────────────────────── */}
              {onlineScreen === "hostWaiting" && (
                <>
                  <div className="text-center">
                    <p
                      className="font-mono font-bold tracking-widest uppercase"
                      style={{ color: "#c080ff", fontSize: "1rem" }}
                    >
                      🏠 Waiting for Player 2
                    </p>
                    <p
                      className="font-mono text-sm mt-1"
                      style={{ color: "#9060d0" }}
                    >
                      {onlineRoomNameDisplay}
                    </p>
                  </div>
                  <div
                    className="flex justify-center items-center gap-4 py-3 rounded-sm"
                    style={{
                      background: "rgba(160,80,255,0.06)",
                      border: "1px solid rgba(160,80,255,0.15)",
                    }}
                  >
                    <span
                      className="font-mono text-lg"
                      style={{
                        color: onlinePlayerCount >= 2 ? "#80ff80" : "#a050ff",
                      }}
                    >
                      {onlinePlayerCount >= 2 ? "✅" : "⏳"}
                    </span>
                    <span
                      className="font-mono font-bold"
                      style={{ color: "#c080ff", fontSize: "1.2rem" }}
                    >
                      {onlinePlayerCount}/2
                    </span>
                    <span
                      className="font-mono text-xs px-2 py-1 rounded-full"
                      style={{
                        background:
                          onlinePlayerCount >= 2
                            ? "rgba(0,255,0,0.1)"
                            : "rgba(160,80,255,0.1)",
                        color: onlinePlayerCount >= 2 ? "#80ff80" : "#a050ff",
                        border: `1px solid ${onlinePlayerCount >= 2 ? "rgba(0,255,0,0.3)" : "rgba(160,80,255,0.3)"}`,
                      }}
                    >
                      {onlinePlayerCount >= 2 ? "FULL" : "OPEN"}
                    </span>
                  </div>
                  <div className="text-center">
                    <p
                      className="font-mono text-xs"
                      style={{ color: rtcConnected ? "#80ff80" : "#6040a0" }}
                    >
                      {rtcConnected
                        ? "🟢 P2 Connected via WebRTC"
                        : "🔵 Establishing connection..."}
                    </p>
                  </div>
                  {onlineError && (
                    <p
                      className="font-mono text-xs text-center"
                      style={{ color: "#ff6080" }}
                      data-ocid="online.error_state"
                    >
                      {onlineError}
                    </p>
                  )}
                  <div className="flex gap-3">
                    <Button
                      data-ocid="online.hostwaiting.back.button"
                      onClick={() => cleanupOnline(onlineRoomId)}
                      className="font-mono text-xs border flex-1"
                      style={{
                        background: "transparent",
                        borderColor: "#3a2060",
                        color: "#7050b0",
                      }}
                    >
                      ✕ Leave
                    </Button>
                    <Button
                      data-ocid="online.start.button"
                      onClick={handleHostStart}
                      disabled={!rtcConnected}
                      className="font-mono font-bold tracking-widest uppercase border flex-[2]"
                      style={{
                        background: rtcConnected
                          ? "rgba(0,255,100,0.15)"
                          : "rgba(80,80,80,0.1)",
                        borderColor: rtcConnected ? "#00ff64" : "#404040",
                        color: rtcConnected ? "#00ff64" : "#505050",
                        cursor: rtcConnected ? "pointer" : "not-allowed",
                        transition: "all 0.3s",
                      }}
                    >
                      {rtcConnected ? "▶ Start Game" : "Waiting..."}
                    </Button>
                  </div>
                </>
              )}

              {/* ── Join List ───────────────────────────────────────────────── */}
              {onlineScreen === "joinList" && (
                <>
                  <div className="text-center">
                    <p
                      className="font-mono font-bold tracking-widest uppercase"
                      style={{ color: "#80c0ff", fontSize: "1rem" }}
                    >
                      🔍 Available Rooms
                    </p>
                  </div>
                  <div
                    className="flex flex-col gap-2"
                    style={{
                      minHeight: 120,
                      maxHeight: 260,
                      overflowY: "auto",
                    }}
                  >
                    {onlineRooms.length === 0 ? (
                      <div
                        data-ocid="online.rooms.empty_state"
                        className="flex flex-col items-center justify-center gap-2 py-8"
                        style={{ color: "#4a3080" }}
                      >
                        <span className="text-2xl">🎮</span>
                        <p className="font-mono text-xs">No rooms available</p>
                        <p
                          className="font-mono text-xs"
                          style={{ color: "#3a2060" }}
                        >
                          Be the first to host!
                        </p>
                      </div>
                    ) : (
                      onlineRooms.map((room, idx) => {
                        const isFull = Number(room.playerCount) >= 2;
                        return (
                          <button
                            key={room.id}
                            data-ocid={`online.rooms.item.${idx + 1}`}
                            onClick={() => {
                              handleGuestJoin(
                                room.id,
                                room.roomName,
                                room.gridSize,
                              );
                            }}
                            disabled={false}
                            type="button"
                            className="flex items-center justify-between p-3 rounded-sm text-left transition-all"
                            style={{
                              background: isFull
                                ? "rgba(255,160,50,0.08)"
                                : "rgba(80,160,255,0.08)",
                              border: `1px solid ${isFull ? "rgba(255,160,50,0.3)" : "rgba(80,160,255,0.25)"}`,
                              cursor: "pointer",
                              opacity: 1,
                            }}
                          >
                            <div className="flex flex-col gap-0.5">
                              <span
                                className="font-mono font-bold text-sm"
                                style={{
                                  color: isFull ? "#ffa030" : "#80c0ff",
                                }}
                              >
                                {room.roomName}
                              </span>
                              <span
                                className="font-mono text-xs"
                                style={{ color: "#4060a0" }}
                              >
                                Host: {room.hostName} &nbsp;·&nbsp; Grid:{" "}
                                {room.gridSize}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className="font-mono text-xs font-bold px-2 py-1 rounded-full"
                                style={{
                                  background: isFull
                                    ? "rgba(255,160,50,0.15)"
                                    : "rgba(80,255,80,0.1)",
                                  color: isFull ? "#ffa030" : "#80ff80",
                                  border: `1px solid ${isFull ? "rgba(255,160,50,0.4)" : "rgba(80,255,80,0.3)"}`,
                                }}
                              >
                                {Number(room.playerCount)}/2{" "}
                                {isFull ? "IN GAME" : ""}
                              </span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                  {onlineError && (
                    <p
                      className="font-mono text-xs text-center"
                      style={{ color: "#ff6080" }}
                      data-ocid="online.error_state"
                    >
                      {onlineError}
                    </p>
                  )}
                  <div className="flex gap-3">
                    <Button
                      data-ocid="online.joinlist.back.button"
                      onClick={() => {
                        setOnlineError("");
                        setOnlineScreen("choice");
                      }}
                      className="font-mono text-xs border flex-1"
                      style={{
                        background: "transparent",
                        borderColor: "#3a2060",
                        color: "#7050b0",
                      }}
                    >
                      ← Back
                    </Button>
                    <Button
                      data-ocid="online.refresh.button"
                      onClick={loadOnlineRooms}
                      className="font-mono font-bold tracking-widest uppercase border flex-[2]"
                      style={{
                        background: "rgba(80,160,255,0.12)",
                        borderColor: "#50a0ff",
                        color: "#80c0ff",
                      }}
                    >
                      🔄 Refresh
                    </Button>
                  </div>
                </>
              )}

              {/* ── Join Waiting ─────────────────────────────────────────────── */}
              {onlineScreen === "joinWaiting" && (
                <>
                  <div className="text-center">
                    <p
                      className="font-mono font-bold tracking-widest uppercase"
                      style={{ color: "#80c0ff", fontSize: "1rem" }}
                    >
                      🔵 Joined Room
                    </p>
                    <p
                      className="font-mono text-sm mt-1"
                      style={{ color: "#5080c0" }}
                    >
                      {onlineRoomNameDisplay}
                    </p>
                  </div>
                  <div
                    className="flex flex-col items-center gap-3 py-5"
                    style={{
                      background: "rgba(80,160,255,0.05)",
                      border: "1px solid rgba(80,160,255,0.12)",
                      borderRadius: 4,
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                      style={{
                        borderColor: "#50a0ff",
                        borderTopColor: "transparent",
                      }}
                    />
                    <p
                      className="font-mono text-sm"
                      style={{ color: "#80c0ff" }}
                    >
                      Waiting for host to start...
                    </p>
                    <p
                      className="font-mono text-xs"
                      style={{ color: rtcConnected ? "#80ff80" : "#3060a0" }}
                    >
                      {rtcConnected
                        ? "🟢 WebRTC Connected"
                        : "🔵 Connecting..."}
                    </p>
                  </div>
                  {onlineError && (
                    <p
                      className="font-mono text-xs text-center"
                      style={{ color: "#ff6080" }}
                      data-ocid="online.error_state"
                    >
                      {onlineError}
                    </p>
                  )}
                  <Button
                    data-ocid="online.joinwaiting.leave.button"
                    onClick={() => cleanupOnline(onlineRoomId)}
                    className="font-mono text-xs border w-full"
                    style={{
                      background: "transparent",
                      borderColor: "#3a2060",
                      color: "#7050b0",
                    }}
                  >
                    ✕ Leave Room
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Game Screen ─────────────────────────────────────────────────────────────
  const gs = gsRef.current;
  const level = gs?.level ?? 1;
  const theme = getTheme(level);
  const canvasW = gameCols * TILE;
  const canvasH = gameRows * TILE;

  const timerSecs =
    displayTimer !== null ? Math.ceil(displayTimer / 1000) : null;
  const timerColor =
    timerSecs === null
      ? "#7fffb0"
      : timerSecs > 15
        ? "#7fffb0"
        : timerSecs > 5
          ? "#ffd700"
          : "#ff4d6d";
  const timerFlash =
    timerSecs !== null &&
    timerSecs <= 5 &&
    Math.floor(Date.now() / 500) % 2 === 0;

  const modifierLabel: Record<NonNullable<LevelModifier>, string> = {
    fogOfWar: "🌫️ FOG OF WAR",
    windy: "💨 WINDY",
    dark: "🌑 DARK",
    trapTiles: "⚠️ TRAP TILES",
    conveyorBelts: "🔄 CONVEYOR BELTS",
    gravityZones: "🌀 GRAVITY ZONES",
    mirrorTiles: "🪞 MIRROR TILES",
    stickyFloor: "🕸️ STICKY FLOOR",
    shrinkingArena: "📦 SHRINKING ARENA",
    cursedBomb: "💀 CURSED BOMB",
    teleportPads: "🌀 TELEPORT PADS",
  };
  const challengeLabel: Record<ChallengeFlag, string> = {
    noBombUp: "NO BOMB+",
    noFireUp: "NO FIRE+",
    curseOnly: "CURSED FLOOR",
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-2 py-4 gap-3"
      style={{
        background:
          "linear-gradient(135deg, #050510 0%, #0a0a1a 50%, #05100a 100%)",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="font-display text-2xl font-black tracking-widest uppercase score-glow"
          style={{ color: theme.uiAccent }}
        >
          BOMBERMAN
        </span>
      </div>

      {/* HUD */}
      {displayIsMultiplayer ? (
        /* Co-op dual HUD */
        <div
          className="flex gap-2 items-stretch font-mono text-xs tracking-widest uppercase w-full"
          style={{ maxWidth: "100%" }}
        >
          {/* P1 Panel - left */}
          <div
            className="flex flex-col gap-1 px-3 py-2 rounded-sm flex-1"
            style={{
              background: "rgba(255,100,100,0.08)",
              border: "1px solid rgba(255,100,100,0.25)",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold" style={{ color: "#ff6b8a" }}>
                P1
              </span>
              <span style={{ color: "#ff6b8a" }}>
                {"❤️".repeat(Math.max(0, displayLives))}
                {displayLives === 0 ? "💀" : ""}
              </span>
            </div>
            <div className="flex gap-2 flex-wrap">
              <span title="Fire range" style={{ color: "#ff8c00" }}>
                🔥 {displayStats.range}
              </span>
              <span title="Bombs" style={{ color: "#cc88ff" }}>
                💣 {displayStats.maxBombs}
              </span>
              <span title="Speed" style={{ color: "#ffe066" }}>
                ⚡ {displayStats.speed.toFixed(1)}x
              </span>
              {displayBombType !== "normal" && (
                <span
                  style={{
                    color:
                      displayBombType === "lava"
                        ? "#ff4400"
                        : displayBombType === "freeze"
                          ? "#44aaff"
                          : displayBombType === "kick"
                            ? "#ffdd00"
                            : displayBombType === "surprise"
                              ? "#ffffff"
                              : "#ff88ff",
                    fontWeight: "bold",
                  }}
                >
                  {displayBombType === "lava"
                    ? "🔴 Lava Bomb"
                    : displayBombType === "freeze"
                      ? "🔵 Freeze Bomb"
                      : displayBombType === "kick"
                        ? "🟡 Kick Bomb"
                        : displayBombType === "surprise"
                          ? "❓ Random Bomb"
                          : "🟣 Portal Bomb"}
                </span>
              )}
              {displayShield > 0 && (
                <span style={{ color: "#80d8ff" }}>🛡️ {displayShield}s</span>
              )}
            </div>
          </div>

          {/* Center info */}
          <div
            className="flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-sm"
            style={{
              background: "rgba(0,0,0,0.5)",
              border: `1px solid ${theme.uiAccent}22`,
              minWidth: "8rem",
            }}
          >
            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  style={{ color: `${theme.uiAccent}88`, fontSize: "0.6rem" }}
                >
                  Score
                </span>
                <span
                  className="font-bold text-sm"
                  style={{ color: theme.uiAccent }}
                >
                  {displayScore.toString().padStart(6, "0")}
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span
                  style={{ color: `${theme.uiAccent}88`, fontSize: "0.6rem" }}
                >
                  Lv
                </span>
                <span
                  className="font-bold text-sm"
                  style={{ color: theme.uiAccent }}
                >
                  {displayLevel}
                </span>
              </div>
            </div>
            {timerSecs !== null && (
              <span
                className="font-bold"
                style={{
                  color: timerFlash ? "transparent" : timerColor,
                  transition: "color 0.1s",
                }}
              >
                {timerSecs}s
              </span>
            )}
            {displayModifier && (
              <div
                className="px-1 py-0.5 rounded-sm text-xs font-bold"
                style={{
                  background: "rgba(100,100,255,0.2)",
                  color: "#aabbff",
                  fontSize: "0.6rem",
                }}
              >
                {modifierLabel[displayModifier]}
              </div>
            )}
          </div>

          {/* P2 Panel - right */}
          <div
            className="flex flex-col gap-1 px-3 py-2 rounded-sm flex-1"
            style={{
              background: "rgba(68,170,255,0.08)",
              border: "1px solid rgba(68,170,255,0.25)",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold" style={{ color: "#44aaff" }}>
                P2
              </span>
              <span style={{ color: "#44aaff" }}>
                {"❤️".repeat(Math.max(0, displayLivesP2))}
                {displayLivesP2 === 0 ? "💀" : ""}
              </span>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              <span title="Fire range" style={{ color: "#ff8c00" }}>
                🔥 {displayStatsP2.range}
              </span>
              <span title="Bombs" style={{ color: "#cc88ff" }}>
                💣 {displayStatsP2.maxBombs}
              </span>
              <span title="Speed" style={{ color: "#ffe066" }}>
                ⚡ {displayStatsP2.speed.toFixed(1)}x
              </span>
              {displayBombTypeP2 !== "normal" && (
                <span
                  style={{
                    color:
                      displayBombTypeP2 === "lava"
                        ? "#ff4400"
                        : displayBombTypeP2 === "freeze"
                          ? "#44aaff"
                          : displayBombTypeP2 === "kick"
                            ? "#ffdd00"
                            : displayBombTypeP2 === "surprise"
                              ? "#ffffff"
                              : "#ff88ff",
                    fontWeight: "bold",
                  }}
                >
                  {displayBombTypeP2 === "lava"
                    ? "🔴 Lava Bomb"
                    : displayBombTypeP2 === "freeze"
                      ? "🔵 Freeze Bomb"
                      : displayBombTypeP2 === "kick"
                        ? "🟡 Kick Bomb"
                        : displayBombTypeP2 === "surprise"
                          ? "❓ Random Bomb"
                          : "🟣 Portal Bomb"}
                </span>
              )}
              {displayShieldP2 > 0 && (
                <span style={{ color: "#80d8ff" }}>🛡️ {displayShieldP2}s</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Single-player HUD */
        <div
          className="flex flex-wrap gap-3 items-center font-mono text-xs tracking-widest uppercase px-4 py-2 rounded-sm"
          style={{
            background: "rgba(0,0,0,0.5)",
            border: `1px solid ${theme.uiAccent}22`,
          }}
        >
          <div className="flex flex-col items-center gap-0.5">
            <span style={{ color: `${theme.uiAccent}88` }}>Score</span>
            <span
              className="font-bold text-base"
              style={{ color: theme.uiAccent }}
            >
              {displayScore.toString().padStart(6, "0")}
            </span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span style={{ color: `${theme.uiAccent}88` }}>Level</span>
            <span
              className="font-bold text-base"
              style={{ color: theme.uiAccent }}
            >
              {displayLevel}
            </span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span style={{ color: `${theme.uiAccent}88` }}>Lives</span>
            <span className="font-bold text-base" style={{ color: "#ff6b8a" }}>
              {"❤️".repeat(Math.max(0, displayLives))}
            </span>
          </div>

          {timerSecs !== null && (
            <div
              className="flex flex-col items-center gap-0.5"
              data-ocid="game.loading_state"
            >
              <span style={{ color: `${timerColor}88` }}>Timer</span>
              <span
                className="font-bold text-base"
                style={{
                  color: timerFlash ? "transparent" : timerColor,
                  transition: "color 0.1s",
                  minWidth: "2.5rem",
                  textAlign: "center",
                }}
              >
                {timerSecs}s
              </span>
            </div>
          )}

          <div
            className="w-px self-stretch"
            style={{ background: `${theme.uiAccent}22` }}
          />
          <div className="flex gap-3">
            <span title="Fire range" style={{ color: "#ff8c00" }}>
              🔥 {displayStats.range}
            </span>
            <span title="Bombs" style={{ color: "#cc88ff" }}>
              💣 {displayStats.maxBombs}
            </span>
            <span title="Speed" style={{ color: "#ffe066" }}>
              ⚡ {displayStats.speed.toFixed(1)}x
            </span>
            {displayBombType !== "normal" && (
              <span
                title={`Bomb type: ${displayBombType === "surprise" ? "Random" : displayBombType}`}
                style={{
                  color:
                    displayBombType === "lava"
                      ? "#ff4400"
                      : displayBombType === "freeze"
                        ? "#44aaff"
                        : displayBombType === "kick"
                          ? "#ffdd00"
                          : displayBombType === "surprise"
                            ? "#ffffff"
                            : "#ff88ff",
                  fontWeight: "bold",
                }}
              >
                {displayBombType === "lava"
                  ? "🔴 LAVA"
                  : displayBombType === "freeze"
                    ? "🔵 FREEZE"
                    : displayBombType === "kick"
                      ? "🟡 KICK"
                      : displayBombType === "surprise"
                        ? "❓ RANDOM"
                        : "🟣 PORTAL"}
              </span>
            )}
            {displayShield > 0 && (
              <span title="Shield" style={{ color: "#80d8ff" }}>
                🛡️ {displayShield}s
              </span>
            )}
            {displayCurseFlash && (
              <span
                title="Cursed!"
                style={{ color: "#bb44ff", animation: "pulse 0.3s infinite" }}
              >
                ☠️ CURSED!
              </span>
            )}
          </div>

          {displayModifier && (
            <>
              <div
                className="w-px self-stretch"
                style={{ background: `${theme.uiAccent}22` }}
              />
              <div
                className="px-2 py-0.5 rounded-sm text-xs font-bold"
                style={{
                  background: "rgba(100,100,255,0.2)",
                  border: "1px solid rgba(100,100,255,0.5)",
                  color: "#aabbff",
                }}
              >
                {modifierLabel[displayModifier]}
              </div>
            </>
          )}

          {displayModifier === "windy" && gs?.windDir && (
            <span style={{ color: "#80d8ff", fontSize: "1rem" }}>
              {gs.windDir.x === 1
                ? "→"
                : gs.windDir.x === -1
                  ? "←"
                  : gs.windDir.y === 1
                    ? "↓"
                    : "↑"}
            </span>
          )}

          {displayChallenge.length > 0 && (
            <>
              <div
                className="w-px self-stretch"
                style={{ background: `${theme.uiAccent}22` }}
              />
              <div className="flex gap-2">
                {displayChallenge.map((flag) => (
                  <div
                    key={flag}
                    className="px-2 py-0.5 rounded-sm text-xs font-bold"
                    style={{
                      background: "rgba(255,50,50,0.2)",
                      border: "1px solid rgba(255,50,50,0.5)",
                      color: "#ff6666",
                    }}
                  >
                    ⚠️ {challengeLabel[flag]}
                  </div>
                ))}
              </div>
            </>
          )}

          <div
            className="w-px self-stretch"
            style={{ background: `${theme.uiAccent}22` }}
          />
          <div className="flex flex-col items-center gap-0.5">
            <span style={{ color: `${theme.uiAccent}88` }}>Best</span>
            <span className="font-bold" style={{ color: "#ffcc55" }}>
              {highScore.toString().padStart(5, "0")}
            </span>
            {bestLevel > 0 && (
              <span
                className="font-mono"
                style={{ fontSize: "0.6rem", color: theme.uiAccent }}
              >
                Lv {bestLevel}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Canvas */}
      <div
        className="relative game-glow rounded-sm overflow-hidden"
        style={{
          boxShadow: `0 0 0 1px ${theme.uiAccent}33, 0 0 30px ${theme.uiAccent}11`,
        }}
      >
        <canvas
          ref={canvasRef}
          width={canvasW}
          height={canvasH}
          data-ocid="game.canvas_target"
          className="block"
          style={{ imageRendering: "pixelated" }}
        />
        <div className="scanlines" />

        {displayIsMultiplayer &&
          gs?.player2 &&
          !gs.player2.alive &&
          gameStatus === "playing" && (
            <div
              className="absolute top-2 right-2 px-3 py-2 rounded text-xs font-mono"
              style={{
                background: "rgba(68,170,255,0.15)",
                border: "1px solid rgba(68,170,255,0.4)",
                color: "#44aaff",
              }}
            >
              💀 P2 waiting for next level
            </div>
          )}

        {displayIsMultiplayer &&
          !gs?.player.alive &&
          gameStatus === "playing" && (
            <div
              className="absolute top-2 left-2 px-3 py-2 rounded text-xs font-mono"
              style={{
                background: "rgba(255,100,100,0.15)",
                border: "1px solid rgba(255,100,100,0.4)",
                color: "#ff6b8a",
              }}
            >
              💀 YOU: waiting for next level
            </div>
          )}

        {gameStatus === "levelcomplete" && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-6"
            style={{ background: theme.overlayBg }}
          >
            <p
              className="font-display text-5xl font-black tracking-widest uppercase"
              style={{
                color: theme.uiAccent,
                textShadow: `0 0 20px ${theme.uiAccent}`,
              }}
            >
              LEVEL {level} CLEAR!
            </p>
            {isOnlineCoopRef.current && onlineRoleRef.current === "guest" ? (
              <p
                className="font-mono text-sm tracking-widest"
                style={{ color: theme.uiAccent, opacity: 0.7 }}
              >
                ⏳ Waiting for host...
              </p>
            ) : (
              <Button
                data-ocid="game.continue.button"
                onClick={advanceLevel}
                className="font-mono font-bold tracking-widest uppercase px-10 py-3 border"
                style={{
                  background: "transparent",
                  borderColor: theme.uiAccent,
                  color: theme.uiAccent,
                }}
              >
                ▶ NEXT LEVEL
              </Button>
            )}
          </div>
        )}

        {gameStatus === "gameover" && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-6"
            style={{ background: "rgba(10,0,0,0.88)" }}
          >
            <div className="text-center space-y-2">
              <p
                className="font-display text-5xl font-black tracking-widest uppercase"
                style={{ color: "#ff4d6d", textShadow: "0 0 20px #ff4d6d" }}
              >
                GAME OVER
              </p>
              <p
                className="font-mono text-sm tracking-widest"
                style={{ color: "#6a3a4a" }}
              >
                PLAYER ELIMINATED
              </p>
            </div>
            <div className="flex flex-col items-center gap-1 font-mono">
              <span className="text-xs" style={{ color: "#4a2a3a" }}>
                Final Score
              </span>
              <span
                className="text-3xl font-bold score-glow"
                style={{ color: "#7fffb0" }}
              >
                {finalScore.toString().padStart(6, "0")}
              </span>
            </div>
            <div className="flex gap-3">
              <Button
                data-ocid="game.restart.button"
                onClick={restartGame}
                className="font-mono font-bold tracking-widest uppercase px-8 py-3 border"
                style={{
                  background: "transparent",
                  borderColor: "#ff4d6d",
                  color: "#ff4d6d",
                }}
              >
                ▶ PLAY AGAIN
              </Button>
              <Button
                data-ocid="game.menu.button"
                onClick={() => {
                  setScreen("picker");
                }}
                className="font-mono font-bold tracking-widest uppercase px-8 py-3 border"
                style={{
                  background: "transparent",
                  borderColor: "#3a5a3a",
                  color: "#7fffb0",
                }}
              >
                ◄ MENU
              </Button>
              {isOnlineCoopRef.current && (
                <Button
                  data-ocid="game.back.to.lobby.button"
                  onClick={async () => {
                    await cleanupOnline();
                    // After cleanup, show the join list on the picker screen
                    setScreen("picker");
                    setOnlineScreen("joinList");
                    // Load fresh room list
                    setTimeout(() => loadOnlineRooms(), 100);
                  }}
                  className="font-mono font-bold tracking-widest uppercase px-8 py-3 border"
                  style={{
                    background: "transparent",
                    borderColor: "#4488cc",
                    color: "#88ccff",
                  }}
                >
                  ⬤ JOIN NEW ROOM
                </Button>
              )}
            </div>
          </div>
        )}

        {p2LeftMessage &&
          isOnlineCoopRef.current &&
          onlineRoleRef.current === "host" && (
            <div
              style={{
                position: "absolute",
                top: 8,
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(0,0,0,0.8)",
                border: "1px solid #ff8040",
                color: "#ff8040",
                padding: "6px 16px",
                borderRadius: 6,
                fontFamily: "monospace",
                fontSize: 12,
                zIndex: 40,
                pointerEvents: "none",
              }}
            >
              {p2LeftMessage}
            </div>
          )}

        {onlineDisconnected && onlineRoleRef.current === "guest" && (
          <div
            data-ocid="online.disconnected.modal"
            className="absolute inset-0 flex flex-col items-center justify-center gap-6 z-50"
            style={{ background: "rgba(0,0,0,0.93)" }}
          >
            <div className="text-5xl">📡</div>
            <p
              className="font-display text-3xl font-black tracking-widest uppercase"
              style={{ color: "#ff6080", textShadow: "0 0 20px #ff6080" }}
            >
              DISCONNECTED
            </p>
            <p className="font-mono text-sm" style={{ color: "#6a3a4a" }}>
              Opponent has disconnected
            </p>
            <Button
              data-ocid="online.disconnected.return.button"
              onClick={async () => {
                await cleanupOnline();
                setScreen("picker");
              }}
              className="font-mono font-bold tracking-widest uppercase px-10 py-3 border"
              style={{
                background: "transparent",
                borderColor: "#ff6080",
                color: "#ff6080",
              }}
            >
              ◄ RETURN TO MENU
            </Button>
          </div>
        )}

        {gameStatus === "win" && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-6"
            style={{ background: "rgba(2,0,8,0.9)" }}
          >
            <p
              className="font-display text-6xl font-black tracking-widest uppercase"
              style={{
                color: "#cc88ff",
                textShadow: "0 0 30px #cc88ff, 0 0 60px #9400d366",
              }}
            >
              YOU WIN!
            </p>
            <p
              className="font-mono text-sm tracking-widest"
              style={{ color: "#6644aa" }}
            >
              ALL WORLDS CONQUERED
            </p>
            <div className="flex flex-col items-center gap-1 font-mono">
              <span className="text-xs" style={{ color: "#442266" }}>
                Final Score
              </span>
              <span
                className="text-3xl font-bold"
                style={{ color: "#cc88ff", textShadow: "0 0 15px #cc88ff" }}
              >
                {finalScore.toString().padStart(6, "0")}
              </span>
            </div>
            <Button
              data-ocid="game.playagain.button"
              onClick={() => setScreen("picker")}
              className="font-mono font-bold tracking-widest uppercase px-10 py-3 border"
              style={{
                background: "transparent",
                borderColor: "#cc88ff",
                color: "#cc88ff",
              }}
            >
              ▶ PLAY AGAIN
            </Button>
          </div>
        )}
      </div>

      <div
        className="font-mono text-xs tracking-widest text-center"
        style={{ color: "#2a3a2a" }}
      >
        {displayIsMultiplayer
          ? "P1: ARROWS/R.CTRL — P2: WASD/SHIFT | Clear all enemies then reach portal"
          : "ARROWS — MOVE | R.CTRL — BOMB | Reach portal after clearing all enemies"}
      </div>

      <footer className="font-mono text-xs" style={{ color: "#1a2a1a" }}>
        © {new Date().getFullYear()}.{" "}
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#2a4a2a" }}
        >
          Built with ♥ using caffeine.ai
        </a>
      </footer>
    </div>
  );
}
