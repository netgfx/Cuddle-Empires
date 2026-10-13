// Shared constants + helpers for the 3D scene.
import { Color, Vector3 } from 'three';
import { TERRITORIES, TERRITORY_IDS } from '../game/mapData';
import type { GameState, PlayerId, TerritoryId } from '../game/types';
import { NEUTRAL } from '../game/types';

export const MAP_URL = '/assets/map/risk-map.glb';

/** Board extents in metres (glTF coords, Y up, north = -Z). */
export const BOARD = { halfW: 1.0, halfD: 0.5, top: 0.044 } as const;

export const NEUTRAL_COLOR = '#A0A4A8';
export const ATTACK_COLOR = '#ff3b3b';
export const FORTIFY_COLOR = '#5CF59A';

/** Pawn world position (top of the marker disc) per territory. */
export const SOCKET: Record<TerritoryId, Vector3> = Object.fromEntries(
  TERRITORY_IDS.map((id) => [id, new Vector3(...TERRITORIES[id].pawn)]),
) as Record<TerritoryId, Vector3>;

export function playerColor(view: GameState | null, owner: PlayerId | null | undefined): string {
  if (!owner) return '#ffffff';
  if (owner === NEUTRAL) return NEUTRAL_COLOR;
  return view?.players.find((p) => p.id === owner)?.color ?? NEUTRAL_COLOR;
}

const colorCache = new Map<string, Color>();
/** Cached THREE.Color for a hex string — never mutate the result. */
export function cachedColor(hex: string): Color {
  let c = colorCache.get(hex);
  if (!c) { c = new Color(hex); colorCache.set(hex, c); }
  return c;
}

export type PawnKind = 'dog' | 'pony' | 'panda';
export const PAWN_KINDS: PawnKind[] = ['panda', 'pony', 'dog'];

/** Max pieces drawn per territory (the badge always shows the exact count). */
export const MAX_PIECES = 6;

/** Army composition as pieces, biggest first, capped at MAX_PIECES. */
export function composition(n: number): PawnKind[] {
  const pandas = Math.floor(n / 10);
  const ponies = Math.floor((n % 10) / 5);
  const dogs = n % 5;
  const out: PawnKind[] = [];
  for (let i = 0; i < pandas && out.length < MAX_PIECES; i++) out.push('panda');
  for (let i = 0; i < ponies && out.length < MAX_PIECES; i++) out.push('pony');
  for (let i = 0; i < dogs && out.length < MAX_PIECES; i++) out.push('dog');
  return out;
}

/** Cluster offsets (x, z) around the socket for k pieces, biggest piece first (centre / back). */
const LAYOUTS: [number, number][][] = [
  [],
  [[0, 0]],
  [[-0.011, -0.002], [0.011, 0.002]],
  [[0, -0.008], [-0.013, 0.007], [0.013, 0.007]],
  [[-0.011, -0.009], [0.011, -0.009], [-0.011, 0.009], [0.011, 0.009]],
  [[0, -0.012], [-0.018, -0.004], [0.018, -0.004], [-0.01, 0.013], [0.01, 0.013]],
  [[-0.009, -0.012], [0.009, -0.012], [-0.019, 0.002], [0.019, 0.002], [-0.008, 0.015], [0.008, 0.015]],
];
export function clusterLayout(k: number): [number, number][] { return LAYOUTS[Math.min(k, LAYOUTS.length - 1)]; }
/** Uniform scale of the cluster so crowded territories stay tidy. */
export function clusterScale(k: number): number { return k <= 2 ? 1 : k <= 4 ? 0.9 : 0.8; }

/** Alaska–Kamchatka wraps around the board edge. */
export function isWrapPair(a: TerritoryId, b: TerritoryId): boolean {
  return (a === 'Alaska' && b === 'Kamchatka') || (a === 'Kamchatka' && b === 'Alaska');
}

/** Live camera facts shared by billboards/labels (written by CameraRig). */
export const cameraInfo = { overview: 2.6 };

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
