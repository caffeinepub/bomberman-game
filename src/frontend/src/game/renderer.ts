import {
  BOMB_FUSE,
  EXPLOSION_DURATION,
  TILE,
  TILE_BREAKABLE,
  TILE_SOLID,
} from "./constants";
import { enemyColor } from "./gameLogic";
import { getTheme } from "./themes";
import type { ThemeColors } from "./themes";
import type {
  Bomb,
  Enemy,
  Explosion,
  GameState,
  Player,
  Portal,
  PowerUp,
  TeleportPortal,
} from "./types";
import type { BombType, PowerUpType } from "./types";

// ─── Main draw entry ────────────────────────────────────────────────
export function drawGame(
  ctx: CanvasRenderingContext2D,
  gs: GameState,
  now: number,
) {
  const {
    cols,
    rows,
    map,
    player,
    enemies,
    bombs,
    explosions,
    powerUps,
    portal,
    projectiles,
  } = gs;
  const W = cols * TILE;
  const H = rows * TILE;
  const theme = getTheme(gs.level);

  // Floor
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? theme.floor : theme.floor2;
      ctx.fillRect(col * TILE, row * TILE, TILE, TILE);
    }
  }

  // Sticky floor patches
  for (const st of gs.stickyTiles) {
    const x = st.tx * TILE;
    const y = st.ty * TILE;
    ctx.fillStyle = "rgba(30,10,40,0.65)";
    ctx.fillRect(x, y, TILE, TILE);
    // Gooey dots
    ctx.fillStyle = "rgba(80,20,90,0.7)";
    for (let i = 0; i < 3; i++) {
      const ox = (i * TILE) / 3 + TILE / 6;
      ctx.beginPath();
      ctx.arc(x + ox, y + TILE / 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Conveyor belts
  for (const ct of gs.conveyorTiles) {
    const x = ct.tx * TILE;
    const y = ct.ty * TILE;
    ctx.fillStyle = "rgba(40,40,80,0.6)";
    ctx.fillRect(x, y, TILE, TILE);
    // Striped pattern
    ctx.strokeStyle = "rgba(100,100,200,0.5)";
    ctx.lineWidth = 2;
    for (let s = -TILE; s < TILE * 2; s += 8) {
      ctx.beginPath();
      if (ct.dir.x !== 0) {
        ctx.moveTo(x + s, y);
        ctx.lineTo(x + s, y + TILE);
      } else {
        ctx.moveTo(x, y + s);
        ctx.lineTo(x + TILE, y + s);
      }
      ctx.stroke();
    }
    // Arrow
    const cx = x + TILE / 2;
    const cy2 = y + TILE / 2;
    const aw = 10;
    ctx.fillStyle = "rgba(180,180,255,0.9)";
    ctx.save();
    ctx.translate(cx, cy2);
    ctx.rotate(Math.atan2(ct.dir.y, ct.dir.x));
    ctx.beginPath();
    ctx.moveTo(aw, 0);
    ctx.lineTo(-aw * 0.6, -aw * 0.6);
    ctx.lineTo(-aw * 0.3, 0);
    ctx.lineTo(-aw * 0.6, aw * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Gravity zones
  for (const gz of gs.gravityZones) {
    const x = gz.tx * TILE;
    const y = gz.ty * TILE;
    const cx = x + TILE / 2;
    const cy2 = y + TILE / 2;
    const pulse = 0.5 + 0.5 * Math.sin(now / 600);
    const grd = ctx.createRadialGradient(cx, cy2, 0, cx, cy2, TILE * 0.7);
    grd.addColorStop(0, `rgba(180,0,255,${0.3 + 0.2 * pulse})`);
    grd.addColorStop(0.5, `rgba(100,0,200,${0.15 * pulse})`);
    grd.addColorStop(1, "transparent");
    ctx.fillStyle = grd;
    ctx.fillRect(x, y, TILE, TILE);
    // Swirl lines
    ctx.strokeStyle = `rgba(200,100,255,${0.5 + 0.3 * pulse})`;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const angle = (now / 1000 + (i * Math.PI) / 2) % (Math.PI * 2);
      ctx.beginPath();
      ctx.arc(cx, cy2, TILE * 0.3, angle, angle + Math.PI * 0.5);
      ctx.stroke();
    }
  }

  // Mirror tiles
  for (const mt of gs.mirrorTiles) {
    const x = mt.tx * TILE;
    const y = mt.ty * TILE;
    const cx = x + TILE / 2;
    const cy2 = y + TILE / 2;
    const sparkle = Math.sin(now / 300) > 0.5;
    ctx.fillStyle = "rgba(200,230,255,0.15)";
    ctx.fillRect(x, y, TILE, TILE);
    // Reflective shine diagonal
    const grad = ctx.createLinearGradient(x, y, x + TILE, y + TILE);
    grad.addColorStop(0, "rgba(255,255,255,0.0)");
    grad.addColorStop(0.4, "rgba(255,255,255,0.0)");
    grad.addColorStop(0.5, `rgba(255,255,255,${sparkle ? 0.5 : 0.2})`);
    grad.addColorStop(0.6, "rgba(255,255,255,0.0)");
    grad.addColorStop(1, "rgba(255,255,255,0.0)");
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, TILE, TILE);
    // Mirror symbol
    ctx.fillStyle = "rgba(150,200,255,0.8)";
    ctx.font = `${Math.floor(TILE * 0.35)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("↔", cx, cy2);
  }

  // Grid overlay
  ctx.strokeStyle = "rgba(255,255,255,0.025)";
  ctx.lineWidth = 1;
  for (let c = 0; c <= cols; c++) {
    ctx.beginPath();
    ctx.moveTo(c * TILE, 0);
    ctx.lineTo(c * TILE, H);
    ctx.stroke();
  }
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * TILE);
    ctx.lineTo(W, r * TILE);
    ctx.stroke();
  }

  // Tiles
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const t = map[row][col];
      const x = col * TILE;
      const y = row * TILE;
      if (t === TILE_SOLID) {
        const key = `${col},${row}`;
        if (gs.lavaTiles.has(key)) {
          drawLavaTile(ctx, x, y, theme);
        } else {
          drawSolidTile(ctx, x, y, theme);
        }
      } else if (t === TILE_BREAKABLE) drawBreakableTile(ctx, x, y, theme);
    }
  }

  // Spawners
  for (const spawner of gs.spawners) {
    if (!spawner.alive) continue;
    const sx = spawner.tx * TILE;
    const sy = spawner.ty * TILE;
    const pulse = 0.7 + 0.3 * Math.sin(now / 400);
    ctx.save();
    ctx.shadowColor = "#FFD700";
    ctx.shadowBlur = 10 * pulse;
    ctx.fillStyle = `rgba(255, 180, 0, ${0.85 + 0.15 * pulse})`;
    ctx.strokeStyle = "#8B6914";
    ctx.lineWidth = 2;
    ctx.fillRect(sx + 2, sy + 2, TILE - 4, TILE - 4);
    ctx.strokeRect(sx + 2, sy + 2, TILE - 4, TILE - 4);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#3B2800";
    ctx.font = `bold ${Math.floor(TILE * 0.6)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("★", sx + TILE / 2, sy + TILE / 2);
    ctx.restore();
  }

  // Portal
  if (portal?.visible) drawPortal(ctx, portal, now, theme);

  // Ice patches
  for (const ip of gs.icePatches) {
    const age = now - ip.spawnedAt;
    const alpha = Math.max(0, 0.55 * (1 - age / 3000));
    const x = ip.tx * TILE;
    const y = ip.ty * TILE;
    ctx.fillStyle = `rgba(100,180,255,${alpha})`;
    ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = `rgba(200,240,255,${alpha * 0.8})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + TILE / 2, y + 4);
    ctx.lineTo(x + TILE / 2, y + TILE - 4);
    ctx.moveTo(x + 4, y + TILE / 2);
    ctx.lineTo(x + TILE - 4, y + TILE / 2);
    ctx.stroke();
  }

  // Teleport portals (portal bomb portals)
  for (const tp of gs.teleportPortals) {
    drawTeleportPortal(ctx, tp, now);
  }

  // Trap tiles (triggered ones blink red)
  for (const tt of gs.trapTiles) {
    if (!tt.triggered) continue;
    const elapsed = now - tt.triggeredAt;
    const blink = Math.floor(elapsed / 200) % 2 === 0;
    if (!blink) continue;
    const x = tt.tx * TILE;
    const y = tt.ty * TILE;
    ctx.fillStyle = "rgba(255,30,0,0.75)";
    ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = "rgba(255,150,0,0.9)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
    // Timer text
    const remaining = Math.max(0, 3 - elapsed / 1000);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = `bold ${Math.floor(TILE * 0.4)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(remaining.toFixed(1), x + TILE / 2, y + TILE / 2);
  }

  // Power-ups
  for (const pu of powerUps) {
    if (map[pu.ty]?.[pu.tx] === TILE_BREAKABLE) continue;
    drawPowerUp(ctx, pu, now);
  }

  // Explosions (bug fix: pass bombType for correct visual)
  for (const exp of explosions) {
    const progress = (now - exp.startedAt) / EXPLOSION_DURATION;
    drawExplosion(ctx, exp, progress);
  }

  // Lava fires
  for (const lf of gs.lavaFires) {
    const age = now - lf.spawnedAt;
    const alpha = Math.max(0, 0.7 * (1 - age / 3000));
    const flicker = 0.6 + 0.4 * Math.sin(now / 100 + lf.id * 0.7);
    const x = lf.tx * TILE;
    const y = lf.ty * TILE;
    ctx.fillStyle = `rgba(255,80,0,${alpha * flicker})`;
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = `rgba(255,200,0,${alpha * flicker * 0.5})`;
    ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
  }

  // Bombs
  for (const bomb of bombs) drawBomb(ctx, bomb, now);

  // Projectiles
  for (const proj of projectiles) {
    if (!proj.alive) continue;
    ctx.fillStyle = "#ff00ff";
    ctx.beginPath();
    ctx.arc(proj.px, proj.py, 5, 0, Math.PI * 2);
    ctx.fill();
    const grd = ctx.createRadialGradient(
      proj.px,
      proj.py,
      0,
      proj.px,
      proj.py,
      10,
    );
    grd.addColorStop(0, "rgba(255,0,255,0.5)");
    grd.addColorStop(1, "transparent");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(proj.px, proj.py, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // Enemies
  for (const enemy of enemies) {
    if (enemy.alive) drawEnemy(ctx, enemy);
  }

  // Player
  if (player.alive) {
    const flash =
      (player.invincible || player.shieldActive) &&
      Math.floor(now / 100) % 2 === 0;
    if (!flash) drawPlayer(ctx, player, now);
  }

  // Teleport flash
  if (now < gs.teleportFlashUntil) {
    const alpha = Math.max(
      0,
      0.6 * (1 - (now - (gs.teleportFlashUntil - 300)) / 300),
    );
    ctx.fillStyle = `rgba(200,100,255,${alpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  // Shrinking arena warning (flash red border when imminent)
  if (gs.levelModifier === "shrinkingArena") {
    const nextShrink = gs.lastShrinkAt + 60000;
    const timeToShrink = nextShrink - now;
    if (timeToShrink < 10000) {
      const urgency = 1 - timeToShrink / 10000;
      const blink = Math.floor(now / (400 - 300 * urgency)) % 2 === 0;
      if (blink) {
        ctx.strokeStyle = `rgba(255,50,0,${0.4 + 0.4 * urgency})`;
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, W - 6, H - 6);
      }
    }
  }

  // Fog/Dark overlay
  if (gs.levelModifier === "fogOfWar" || gs.levelModifier === "dark") {
    const radius = gs.levelModifier === "fogOfWar" ? TILE * 4.5 : TILE * 3;
    const px = player.px;
    const py = player.py;
    const grad = ctx.createRadialGradient(px, py, radius * 0.3, px, py, radius);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.6, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.97)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(0,0,0,0.97)";
    ctx.fillRect(0, 0, W, Math.max(0, py - radius));
    ctx.fillRect(0, Math.min(H, py + radius), W, H);
    ctx.fillRect(
      0,
      Math.max(0, py - radius),
      Math.max(0, px - radius),
      radius * 2,
    );
    ctx.fillRect(
      Math.min(W, px + radius),
      Math.max(0, py - radius),
      W,
      radius * 2,
    );
  }
}

// ─── Tile draws ───────────────────────────────────────────────────────────────
function drawLavaTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  theme: ThemeColors,
) {
  ctx.fillStyle = theme.lavaColor;
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillRect(x, y, TILE, 3);
  ctx.fillRect(x, y, 3, TILE);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(x, y + TILE - 3, TILE, 3);
  ctx.fillRect(x + TILE - 3, y, 3, TILE);
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fillRect(x + TILE / 2 - 3, y + TILE / 2 - 3, 6, 6);
}

function drawSolidTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  theme: ThemeColors,
) {
  const p = 2;
  ctx.fillStyle = theme.solid;
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = theme.solidEdge;
  ctx.fillRect(x + p, y + p, TILE - p * 2, TILE - p * 2);
  ctx.fillStyle = theme.solid;
  ctx.fillRect(x + TILE / 2 - 2, y + p + 2, 4, TILE - p * 2 - 4);
  ctx.fillRect(x + p + 2, y + TILE / 2 - 2, TILE - p * 2 - 4, 4);
}

function drawBreakableTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  theme: ThemeColors,
) {
  const p = 2;
  ctx.fillStyle = theme.breakable;
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = theme.breakableEdge;
  ctx.fillRect(x + p, y + p, TILE - p * 2, p);
  ctx.fillRect(x + p, y + p, p, TILE - p * 2);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(x + p, y + TILE - p * 2, TILE - p * 2, p);
  ctx.fillRect(x + TILE - p * 2, y + p, p, TILE - p * 2);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(x + 8 + i * 13, y + 6, 2, TILE - 12);
  }
}

// ─── Teleport Portal (portal bomb) ────────────────────────────────────────────
function drawTeleportPortal(
  ctx: CanvasRenderingContext2D,
  tp: TeleportPortal,
  now: number,
) {
  const cx = tp.tx * TILE + TILE / 2;
  const cy = tp.ty * TILE + TILE / 2;
  const angle = (now / 800) * Math.PI * 2;
  const pulse = 0.85 + 0.15 * Math.sin(now / 250);
  const r = TILE * 0.38 * pulse;

  // Outer glow
  const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
  grd.addColorStop(0, "rgba(255,20,180,0.35)");
  grd.addColorStop(0.5, "rgba(180,0,255,0.2)");
  grd.addColorStop(1, "transparent");
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2);
  ctx.fill();

  // Spinning ring
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.strokeStyle = "rgba(255,80,220,0.9)";
  ctx.lineWidth = 3;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Inner fill
  const inner = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.6);
  inner.addColorStop(0, "rgba(255,200,255,0.8)");
  inner.addColorStop(0.5, "rgba(200,0,255,0.5)");
  inner.addColorStop(1, "rgba(100,0,200,0.1)");
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.75, 0, Math.PI * 2);
  ctx.fill();

  // P label
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = `bold ${Math.floor(TILE * 0.3)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("⬡", cx, cy);
}

// ─── Portal ──────────────────────────────────────────────────────────────────────────
function drawPortal(
  ctx: CanvasRenderingContext2D,
  portal: Portal,
  now: number,
  theme: ThemeColors,
) {
  const cx = portal.tx * TILE + TILE / 2;
  const cy = portal.ty * TILE + TILE / 2;
  const angle = (now / 1000) * Math.PI * 2;
  const pulse = 0.8 + Math.sin(now / 300) * 0.2;
  const r = TILE * 0.4 * pulse;

  const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2);
  grd.addColorStop(0, `${theme.portalInner}cc`);
  grd.addColorStop(0.5, `${theme.portalInner}44`);
  grd.addColorStop(1, "transparent");
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = theme.portalInner;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6);
    ctx.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
    ctx.stroke();
  }
  ctx.restore();

  const inner = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.5);
  inner.addColorStop(0, "#ffffff88");
  inner.addColorStop(1, `${theme.portalInner}44`);
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

// ─── Power-ups ─────────────────────────────────────────────────────────────────────
const POWERUP_COLORS: Record<PowerUpType, string> = {
  FireUp: "#ff8c00",
  BombUp: "#ff4d6d",
  SpeedUp: "#ffe066",
  Shield: "#80d8ff",
  Life: "#ff80ab",
  Curse: "#9400d3",
  FuseUp: "#ff6600",
  FuseDown: "#4488ff",
  BombType: "#ffffff",
};
const POWERUP_ICONS: Record<PowerUpType, string> = {
  FireUp: "🔥",
  BombUp: "💣",
  SpeedUp: "⚡",
  Shield: "🛡️",
  Life: "❤️",
  Curse: "☠",
  FuseUp: "⏩",
  FuseDown: "⏪",
  BombType: "💣",
};

function drawPowerUp(ctx: CanvasRenderingContext2D, pu: PowerUp, now: number) {
  const cx = pu.tx * TILE + TILE / 2;
  const cy = pu.ty * TILE + TILE / 2;
  const bob = Math.sin(now / 400 + pu.id * 1.3) * 3;
  const r = TILE * 0.3;
  const color = POWERUP_COLORS[pu.type];

  const grd = ctx.createRadialGradient(cx, cy + bob, 0, cx, cy + bob, r * 2.5);
  grd.addColorStop(0, `${color}55`);
  grd.addColorStop(1, "transparent");
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(cx, cy + bob, r * 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.beginPath();
  ctx.arc(cx, cy + bob, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy + bob, r, 0, Math.PI * 2);
  ctx.stroke();

  if (pu.type === "Curse") {
    ctx.fillStyle = "#bb44ff";
    ctx.font = `bold ${TILE * 0.38}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("☠", cx, cy + bob);
  } else if (pu.type === "BombType") {
    const colors: string[] = [
      "#ff2200",
      "#4499ff",
      "#ffffff",
      "#ffdd00",
      "#ff44ff",
    ];
    const labels: string[] = ["L", "F", "N", "K", "P"];
    const count = 5;
    const spacing = r * 0.44;
    for (let i = 0; i < count; i++) {
      const ox = (i - 2) * spacing;
      const cr = r * 0.22;
      ctx.fillStyle = colors[i];
      ctx.beginPath();
      ctx.arc(cx + ox, cy + bob, cr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.85)";
      ctx.font = `bold ${Math.floor(cr * 1.3)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(labels[i], cx + ox, cy + bob);
    }
  } else {
    ctx.font = `${TILE * 0.32}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(POWERUP_ICONS[pu.type], cx, cy + bob);
  }
}

// ─── Bomb ─────────────────────────────────────────────────────────────────────────────
function drawBomb(ctx: CanvasRenderingContext2D, bomb: Bomb, now: number) {
  const cx = bomb.tx * TILE + TILE / 2;
  const cy = bomb.ty * TILE + TILE / 2;
  const fuse = (now - bomb.placedAt) / (bomb.fuseMs ?? BOMB_FUSE);
  const pulse = 1 + Math.sin(now / 150) * 0.06 * (1 + fuse);
  const r = TILE * 0.32 * pulse;

  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.9, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  const bType = bomb.bombType ?? "normal";
  const baseColor0 =
    bType === "lava"
      ? fuse > 0.6
        ? "#ff8844"
        : "#cc2200"
      : bType === "freeze"
        ? fuse > 0.6
          ? "#88ccff"
          : "#0044cc"
        : bType === "kick"
          ? fuse > 0.6
            ? "#ffee44"
            : "#cc9900"
          : bType === "portal"
            ? fuse > 0.6
              ? "#ff88ff"
              : "#aa00cc"
            : fuse > 0.6
              ? "#ff6644"
              : "#444444";
  const baseColor1 =
    bType === "lava"
      ? "#550000"
      : bType === "freeze"
        ? "#001133"
        : bType === "kick"
          ? "#443300"
          : bType === "portal"
            ? "#220033"
            : fuse > 0.6
              ? "#882200"
              : "#111111";

  const grad = ctx.createRadialGradient(
    cx - r * 0.3,
    cy - r * 0.3,
    0,
    cx,
    cy,
    r,
  );
  grad.addColorStop(0, baseColor0);
  grad.addColorStop(1, baseColor1);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.beginPath();
  ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.3, 0, Math.PI * 2);
  ctx.fill();

  const fuseFlicker = Math.sin(now / 60) > 0;
  ctx.strokeStyle = fuseFlicker ? "#ffdd44" : "#ccaa22";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.2, cy - r * 0.8);
  ctx.quadraticCurveTo(cx + r * 0.8, cy - r * 1.2, cx + r * 0.5, cy - r * 1.5);
  ctx.stroke();

  if (fuseFlicker) {
    ctx.fillStyle = "#ffff88";
    ctx.beginPath();
    ctx.arc(cx + r * 0.5, cy - r * 1.5, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Kick bomb: draw arrows to indicate it can be pushed
  if (bType === "kick") {
    ctx.fillStyle = "rgba(255,230,0,0.9)";
    ctx.font = `bold ${Math.floor(r * 1.1)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("↔", cx, cy + r * 0.1);
  }

  // Portal bomb: draw swirl symbol
  if (bType === "portal") {
    ctx.fillStyle = "rgba(255,180,255,0.95)";
    ctx.font = `bold ${Math.floor(r * 1.0)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⬡", cx, cy + r * 0.1);
  }
}

// ─── Explosion ─────────────────────────────────────────────────────────────────
// Bug fix: Freeze explosions render as cold white/blue flash, not orange fireball
function drawExplosion(
  ctx: CanvasRenderingContext2D,
  exp: Explosion,
  progress: number,
) {
  const alpha = 1 - progress;
  const bombType: BombType = exp.bombType ?? "normal";

  for (const cell of exp.cells) {
    const x = cell.x * TILE;
    const y = cell.y * TILE;
    const cx = x + TILE / 2;
    const cy = y + TILE / 2;
    const r = TILE * 0.48;

    if (bombType === "freeze") {
      // Cold white/icy-blue flash - visually distinct, clears immediately like normal bomb
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, `rgba(220,240,255,${alpha})`);
      grad.addColorStop(0.3, `rgba(100,180,255,${alpha * 0.9})`);
      grad.addColorStop(0.7, `rgba(20,80,200,${alpha * 0.6})`);
      grad.addColorStop(1, "rgba(0,20,80,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, TILE, TILE);
    } else {
      // Normal / lava: orange fireball
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, `rgba(255,255,200,${alpha})`);
      grad.addColorStop(0.3, `rgba(255,140,0,${alpha * 0.9})`);
      grad.addColorStop(0.7, `rgba(255,50,0,${alpha * 0.7})`);
      grad.addColorStop(1, "rgba(100,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, TILE, TILE);
    }
  }
}

// ─── Player ───────────────────────────────────────────────────────────────────────────
function drawPlayer(
  ctx: CanvasRenderingContext2D,
  player: Player,
  now: number,
) {
  const cx = player.px;
  const cy = player.py;
  const r = TILE * 0.3;

  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.85, r * 0.8, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  if (player.shieldActive) {
    const shieldGrad = ctx.createRadialGradient(
      cx,
      cy,
      r * 0.5,
      cx,
      cy,
      r * 1.6,
    );
    shieldGrad.addColorStop(0, "rgba(80,200,255,0.0)");
    shieldGrad.addColorStop(0.7, "rgba(80,200,255,0.3)");
    shieldGrad.addColorStop(1, "rgba(80,200,255,0.0)");
    ctx.fillStyle = shieldGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(80,200,255,0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.4, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Mirror effect - tint player purple
  const isMirrored = now < player.mirrorUntil;
  const bodyGrad = ctx.createRadialGradient(
    cx - r * 0.3,
    cy - r * 0.3,
    0,
    cx,
    cy,
    r,
  );
  if (isMirrored) {
    bodyGrad.addColorStop(0, "#dd88ff");
    bodyGrad.addColorStop(0.6, "#8822cc");
    bodyGrad.addColorStop(1, "#110022");
  } else {
    bodyGrad.addColorStop(0, "#88ddff");
    bodyGrad.addColorStop(0.6, "#2288cc");
    bodyGrad.addColorStop(1, "#001144");
  }
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(200,240,255,0.9)";
  ctx.beginPath();
  ctx.ellipse(cx, cy - r * 0.1, r * 0.55, r * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  const bob = Math.sin(now / 600) * 1.5;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.beginPath();
  ctx.arc(cx - r * 0.18, cy - r * 0.15 + bob, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + r * 0.18, cy - r * 0.15 + bob, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

// ─── Enemy ─────────────────────────────────────────────────────────────────────────────
function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy) {
  const cx = enemy.px;
  const cy = enemy.py;
  const r = TILE * 0.28;
  const color = enemyColor(enemy.type);

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + r, r * 0.9, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  if (enemy.type === "bomber") {
    // Skull design for Bomb Minion
    ctx.fillStyle = "#e8e8e8";
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.1, r * 0.9, r * 1.0, 0, 0, Math.PI * 2);
    ctx.fill();
    const skullGrad = ctx.createRadialGradient(
      cx - r * 0.3,
      cy - r * 0.4,
      0,
      cx,
      cy,
      r * 1.1,
    );
    skullGrad.addColorStop(0, "rgba(255,255,255,0.6)");
    skullGrad.addColorStop(0.5, "rgba(180,180,180,0.2)");
    skullGrad.addColorStop(1, "rgba(40,40,40,0.5)");
    ctx.fillStyle = skullGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.1, r * 0.9, r * 1.0, 0, 0, Math.PI * 2);
    ctx.fill();
    // Eye sockets
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.ellipse(
      cx - r * 0.35,
      cy - r * 0.15,
      r * 0.28,
      r * 0.32,
      -0.2,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(
      cx + r * 0.35,
      cy - r * 0.15,
      r * 0.28,
      r * 0.32,
      0.2,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    // Red pupils
    ctx.fillStyle = "rgba(255,30,30,0.85)";
    ctx.beginPath();
    ctx.arc(cx - r * 0.35, cy - r * 0.15, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + r * 0.35, cy - r * 0.15, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
    // Nose
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(cx - r * 0.1, cy + r * 0.15, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + r * 0.1, cy + r * 0.15, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
    // Teeth
    const teethY = cy + r * 0.52;
    const teethW = r * 0.18;
    const teethH = r * 0.22;
    ctx.fillStyle = "#e8e8e8";
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i++) {
      ctx.fillRect(
        cx + i * teethW * 1.1 - teethW / 2,
        teethY,
        teethW * 0.85,
        teethH,
      );
      ctx.strokeRect(
        cx + i * teethW * 1.1 - teethW / 2,
        teethY,
        teethW * 0.85,
        teethH,
      );
    }
    // Purple bomb badge
    ctx.fillStyle = "#aa00ff";
    ctx.beginPath();
    ctx.arc(cx + r * 0.65, cy + r * 0.65, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.round(r * 0.3)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("💣", cx + r * 0.65, cy + r * 0.68);
    return;
  }

  // Body gradient (all other enemy types)
  const grad = ctx.createRadialGradient(
    cx - r * 0.3,
    cy - r * 0.3,
    0,
    cx,
    cy,
    r,
  );
  grad.addColorStop(0, color);
  grad.addColorStop(1, "#000000");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(cx - r * 0.22, cy - r * 0.15, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + r * 0.22, cy - r * 0.15, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(cx - r * 0.2, cy - r * 0.1, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + r * 0.2, cy - r * 0.1, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
}
