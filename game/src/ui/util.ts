// Shared UI helpers: safe selector wrappers (the engine may still be a stub while
// the team works in parallel, so every selector falls back to a local rule copy),
// player helpers, army breakdown, win odds, and an sfx shim.
import * as engine from '../game/engine';
import { ADJACENT, CONTINENTS, CONTINENT_IDS, TERRITORIES, TERRITORY_IDS } from '../game/mapData';
import type {
  Card, GameState, Player, PlayerId, ReinforcementBreakdown, TerritoryId,
} from '../game/types';
import { playSfx } from './audioBridge';

export const TEAM_PALETTE: { name: string; color: string }[] = [
  { name: 'Crimson', color: '#E63946' },
  { name: 'Azure', color: '#3A86FF' },
  { name: 'Lime', color: '#6CC24A' },
  { name: 'Sunflower', color: '#FFBE0B' },
  { name: 'Violet', color: '#8E44AD' },
  { name: 'Charcoal', color: '#34495E' },
];
export const NEUTRAL_COLOR = '#A0A4A8';

export function sfx(name: string) {
  playSfx(name);
}

function attempt<T>(fn: () => T, fallback: () => T): T {
  try {
    return fn();
  } catch {
    return fallback();
  }
}

export const currentPlayer = (s: GameState): Player => s.players[s.current];
export const playerById = (s: GameState, id: PlayerId | null | undefined): Player | undefined =>
  id ? s.players.find((p) => p.id === id) : undefined;
export const tName = (t: TerritoryId | null | undefined) => (t ? TERRITORIES[t]?.name ?? t : '');

export function ownedBy(s: GameState, id: PlayerId): TerritoryId[] {
  return TERRITORY_IDS.filter((t) => s.territories[t]?.owner === id);
}

export function totalArmies(s: GameState, id: PlayerId): number {
  return ownedBy(s, id).reduce((n, t) => n + s.territories[t].armies, 0);
}

export function continentsHeld(s: GameState, id: PlayerId) {
  return CONTINENT_IDS.filter((c) => CONTINENTS[c].territories.every((t) => s.territories[t]?.owner === id));
}

// ------------------------------------------------------------ safe selectors

export const sel = {
  reinforcementsFor(s: GameState, id: PlayerId): ReinforcementBreakdown {
    return attempt(() => engine.reinforcementsFor(s, id), () => {
      const territories = Math.max(3, Math.floor(ownedBy(s, id).length / 3));
      const continents = continentsHeld(s, id).map((c) => ({ continent: c, bonus: CONTINENTS[c].bonus }));
      return { territories, continents, total: territories + continents.reduce((n, c) => n + c.bonus, 0) };
    });
  },
  nextSetValue(s: GameState): number {
    return attempt(() => engine.nextSetValue(s), () => {
      const k = s.setsTraded;
      if (s.settings.cardProgression === 'expert') return 4 + k;
      const classic = [4, 6, 8, 10, 12, 15];
      return k < classic.length ? classic[k] : 15 + 5 * (k - classic.length + 1);
    });
  },
  isValidSet(s: GameState, ids: string[]): boolean {
    return attempt(() => engine.isValidSet(s, ids), () => localIsSet(ids.map((i) => s.cards[i]).filter(Boolean)));
  },
  findSets(s: GameState, id: PlayerId): [string, string, string][] {
    return attempt(() => engine.findSets(s, id), () => {
      const hand = playerById(s, id)?.cards ?? [];
      const out: [string, string, string][] = [];
      for (let a = 0; a < hand.length; a++)
        for (let b = a + 1; b < hand.length; b++)
          for (let c = b + 1; c < hand.length; c++) {
            const set: [string, string, string] = [hand[a], hand[b], hand[c]];
            if (localIsSet(set.map((i) => s.cards[i]).filter(Boolean))) out.push(set);
          }
      return out;
    });
  },
  maxAttackDice(s: GameState, from: TerritoryId): number {
    return attempt(() => engine.maxAttackDice(s, from), () => Math.min(3, Math.max(0, s.territories[from].armies - 1)));
  },
  attackSources(s: GameState): TerritoryId[] {
    return attempt(() => engine.attackSources(s), () => {
      const me = currentPlayer(s).id;
      return TERRITORY_IDS.filter((t) => s.territories[t].owner === me && s.territories[t].armies > 1
        && ADJACENT[t].some((n) => s.territories[n].owner !== me));
    });
  },
  attackTargets(s: GameState, from: TerritoryId): TerritoryId[] {
    return attempt(() => engine.attackTargets(s, from), () => ADJACENT[from].filter((n) => s.territories[n].owner !== s.territories[from].owner));
  },
  fortifyTargets(s: GameState, from: TerritoryId): TerritoryId[] {
    return attempt(() => engine.fortifyTargets(s, from), () => {
      const me = s.territories[from].owner;
      if (s.settings.fortify === 'adjacent') return ADJACENT[from].filter((n) => s.territories[n].owner === me);
      const seen = new Set<TerritoryId>([from]);
      const q = [from];
      while (q.length) {
        const t = q.shift()!;
        for (const n of ADJACENT[t]) if (!seen.has(n) && s.territories[n].owner === me) { seen.add(n); q.push(n); }
      }
      seen.delete(from);
      return [...seen];
    });
  },
  placementTargets(s: GameState): TerritoryId[] {
    return attempt(() => engine.placementTargets(s), () => {
      if (s.phase === 'setupClaim') return TERRITORY_IDS.filter((t) => s.territories[t].owner === null);
      const me = currentPlayer(s).id;
      return ownedBy(s, me);
    });
  },
};

function localIsSet(cards: Card[]): boolean {
  if (cards.length !== 3) return false;
  if (cards.some((c) => c.unit === 'wild')) return true;
  const units = new Set(cards.map((c) => c.unit));
  return units.size === 1 || units.size === 3;
}

// ------------------------------------------------------------ armies & units

export type Animal = 'dog' | 'pony' | 'panda';
export const UNIT_ANIMAL: Record<Card['unit'], Animal | 'wild'> = {
  infantry: 'dog', cavalry: 'pony', artillery: 'panda', wild: 'wild',
};
export const ANIMAL_EMOJI: Record<Animal, string> = { dog: '🐶', pony: '🐴', panda: '🐼' };
export const ANIMAL_VALUE: Record<Animal, number> = { dog: 1, pony: 5, panda: 10 };

/** 23 → { panda: 2, pony: 0, dog: 3 } */
export function armyBreakdown(n: number) {
  const panda = Math.floor(n / 10);
  const pony = Math.floor((n % 10) / 5);
  const dog = n % 5;
  return { panda, pony, dog };
}

// ------------------------------------------------------------ odds

type Outcome = { aLoss: number; dLoss: number; p: number }[];
const rollTable = new Map<string, Outcome>();
function outcomes(a: number, d: number): Outcome {
  const key = `${a}${d}`;
  const hit = rollTable.get(key);
  if (hit) return hit;
  const counts = new Map<string, number>();
  const total = 6 ** (a + d);
  const dice = new Array(a + d).fill(1);
  for (let i = 0; i < total; i++) {
    let x = i;
    for (let k = 0; k < a + d; k++) { dice[k] = (x % 6) + 1; x = Math.floor(x / 6); }
    const A = dice.slice(0, a).sort((p, q) => q - p);
    const D = dice.slice(a).sort((p, q) => q - p);
    let al = 0, dl = 0;
    for (let k = 0; k < Math.min(a, d); k++) { if (A[k] > D[k]) dl++; else al++; }
    const ck = `${al},${dl}`;
    counts.set(ck, (counts.get(ck) ?? 0) + 1);
  }
  const out: Outcome = [...counts].map(([k, c]) => { const [al, dl] = k.split(',').map(Number); return { aLoss: al, dLoss: dl, p: c / total }; });
  rollTable.set(key, out);
  return out;
}

/** Probability that `attackers` armies (in the source territory) blitzing with up to `maxDice` dice conquer `defenders`. */
export function winOdds(attackers: number, defenders: number, maxDice = 3): number {
  const A = Math.min(attackers - 1, 80);
  const D = Math.min(defenders, 80);
  if (A <= 0) return 0;
  const memo = new Map<number, number>();
  const f = (a: number, d: number): number => {
    if (d <= 0) return 1;
    if (a <= 0) return 0;
    const key = a * 1000 + d;
    const m = memo.get(key);
    if (m !== undefined) return m;
    let p = 0;
    for (const o of outcomes(Math.min(maxDice, a), Math.min(2, d))) p += o.p * f(a - o.aLoss, d - o.dLoss);
    memo.set(key, p);
    return p;
  };
  return f(A, D);
}

/** Single-roll odds: probability the defender loses at least one army. */
export function rollOdds(dice: number, defenders: number) {
  const o = outcomes(dice, Math.min(2, defenders));
  const avgD = o.reduce((n, x) => n + x.dLoss * x.p, 0);
  const avgA = o.reduce((n, x) => n + x.aLoss * x.p, 0);
  return { avgD, avgA };
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
