// Serializer for GameState -- handles non-JSON-serializable fields
// (Set and Map) while passing everything else through as plain JSON.

import type { GameState } from "./types";

interface SerializedGameState {
  // All plain fields exactly as in GameState, except:
  // lavaTiles: string[]  (from Set<string>)
  // lavaDamageCooldown: [string, number][]  (from Map<string, number>)
  [key: string]: unknown;
  lavaTiles: string[];
  lavaDamageCooldown: [string, number][];
}

export function serializeGameState(gs: GameState): string {
  const obj: SerializedGameState = {
    ...(gs as unknown as Record<string, unknown>),
    lavaTiles: Array.from(gs.lavaTiles),
    lavaDamageCooldown: Array.from(gs.lavaDamageCooldown.entries()),
  };
  return JSON.stringify(obj);
}

export function deserializeGameState(json: string): GameState {
  const obj = JSON.parse(json) as SerializedGameState;
  const gs = obj as unknown as GameState;
  // Restore Set<string>
  gs.lavaTiles = new Set(obj.lavaTiles as string[]);
  // Restore Map<string, number>
  gs.lavaDamageCooldown = new Map(obj.lavaDamageCooldown as [string, number][]);
  return gs;
}
