// ─── Level Themes ─────────────────────────────────────────────────────────────
export interface ThemeColors {
  floor: string;
  floor2: string;
  solid: string;
  solidEdge: string;
  breakable: string;
  breakableEdge: string;
  accent: string;
  portalInner: string;
  portalOuter: string;
  overlayBg: string;
  uiAccent: string;
  lavaColor: string;
}

export const THEMES: Record<string, ThemeColors> = {
  grasslands: {
    floor: "#0d1a0d",
    floor2: "#0f200f",
    solid: "#1a3a1a",
    solidEdge: "#2d5a2d",
    breakable: "#3a2a0d",
    breakableEdge: "#7a5a1a",
    accent: "#7fffb0",
    portalInner: "#00ff80",
    portalOuter: "#005530",
    overlayBg: "rgba(0,10,0,0.85)",
    uiAccent: "#7fffb0",
    lavaColor: "#4CAF50",
  },
  desert: {
    floor: "#1a1200",
    floor2: "#201600",
    solid: "#3a2a00",
    solidEdge: "#6a4a10",
    breakable: "#4a3000",
    breakableEdge: "#aa7a20",
    accent: "#ffd700",
    portalInner: "#ffaa00",
    portalOuter: "#553300",
    overlayBg: "rgba(10,8,0,0.85)",
    uiAccent: "#ffd700",
    lavaColor: "#FF9800",
  },
  ice: {
    floor: "#0a1220",
    floor2: "#0d1a30",
    solid: "#1a3050",
    solidEdge: "#2a5080",
    breakable: "#1a2a40",
    breakableEdge: "#3a6a9a",
    accent: "#80d8ff",
    portalInner: "#00aaff",
    portalOuter: "#001133",
    overlayBg: "rgba(0,5,15,0.85)",
    uiAccent: "#80d8ff",
    lavaColor: "#64B5F6",
  },
  lava: {
    floor: "#1a0800",
    floor2: "#200a00",
    solid: "#3a1800",
    solidEdge: "#6a2800",
    breakable: "#4a1a00",
    breakableEdge: "#aa3800",
    accent: "#ff6600",
    portalInner: "#ff4400",
    portalOuter: "#550000",
    overlayBg: "rgba(10,0,0,0.85)",
    uiAccent: "#ff6600",
    lavaColor: "#FF5722",
  },
  space: {
    floor: "#020208",
    floor2: "#030310",
    solid: "#0a0a1a",
    solidEdge: "#1a1a3a",
    breakable: "#0d0d20",
    breakableEdge: "#3030a0",
    accent: "#cc88ff",
    portalInner: "#aa44ff",
    portalOuter: "#220033",
    overlayBg: "rgba(2,0,8,0.88)",
    uiAccent: "#cc88ff",
    lavaColor: "#9C27B0",
  },
};

export function getTheme(level: number): ThemeColors {
  if (level === 1) return THEMES.grasslands;
  if (level === 2) return THEMES.desert;
  if (level === 3) return THEMES.ice;
  if (level === 4) return THEMES.lava;
  const themeNames = ["space", "lava", "ice", "desert", "grasslands"];
  return THEMES[themeNames[(level - 5) % themeNames.length]];
}
