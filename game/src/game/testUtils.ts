// Helpers shared by the engine / bot tests.
import { createGame, reduce } from './engine';
import { TERRITORY_IDS } from './mapData';
import type { Action, GameSettings, GameState, NewPlayer, PlayerId, ReduceResult, TerritoryId } from './types';
import { NEUTRAL } from './types';
import { TOTAL_CARDS } from './cards';

export const COLORS = ['#E63946', '#3A86FF', '#6CC24A', '#FFBE0B', '#8E44AD', '#34495E'];

export function newPlayers(n: number, kind: NewPlayer['kind'] = 'human'): NewPlayer[] {
  return Array.from({ length: n }, (_, i) => ({ name: `Player ${i + 1}`, color: COLORS[i], kind }));
}

/**
 * A game in `phase` for p1 with every territory owned by `fallback` (1 army) except the
 * ones listed in `owners` ([owner, armies]).
 */
export function scenario(opts: {
  players?: number;
  settings?: Partial<GameSettings>;
  owners?: Partial<Record<TerritoryId, [PlayerId, number]>>;
  fallback?: PlayerId;
  phase?: GameState['phase'];
  current?: PlayerId;
  seed?: number;
}): GameState {
  const s = createGame(newPlayers(opts.players ?? 3), { setup: 'auto', ...opts.settings }, opts.seed ?? 1);
  const fallback = opts.fallback ?? 'p2';
  for (const t of TERRITORY_IDS) {
    const o = opts.owners?.[t];
    s.territories[t] = o ? { owner: o[0], armies: o[1] } : { owner: fallback, armies: 1 };
  }
  s.current = s.players.findIndex((p) => p.id === (opts.current ?? 'p1'));
  s.phase = opts.phase ?? 'attack';
  s.reinforcements = 0;
  s.mustTrade = false;
  s.conqueredThisTurn = false;
  s.territoryBonusUsed = false;
  s.pendingOccupy = null;
  s.log = [];
  return s;
}

export function ok(r: ReduceResult): GameState {
  if (!r.ok) throw new Error(`expected ok, got error: ${r.error}`);
  return r.state;
}

export function act(s: GameState, a: Action, actor?: PlayerId): GameState {
  return ok(reduce(s, a, actor ?? s.players[s.current].id));
}

/** Gives a player specific cards, taking them out of the deck. */
export function giveCards(s: GameState, player: PlayerId, ids: string[]) {
  s.deck = s.deck.filter((c) => !ids.includes(c));
  s.discard = s.discard.filter((c) => !ids.includes(c));
  for (const p of s.players) p.cards = p.cards.filter((c) => !ids.includes(c));
  s.players.find((p) => p.id === player)!.cards.push(...ids);
}

/** Tries rng states until `pred` accepts the reduce result. */
export function findRng(s: GameState, a: Action, pred: (r: ReduceResult & { ok: true }) => boolean, actor?: PlayerId): GameState {
  for (let seed = 1; seed < 20000; seed++) {
    const r = reduce({ ...s, rng: seed }, a, actor ?? s.players[s.current].id);
    if (r.ok && pred(r)) return { ...s, rng: seed };
  }
  throw new Error('no rng state satisfies the predicate');
}

/** Structural invariants that hold after every accepted action once setup is over. */
export function checkInvariants(s: GameState): string | null {
  const setup = s.phase === 'setupClaim' || s.phase === 'setupReinforce';
  if (!setup) {
    for (const t of TERRITORY_IDS) {
      const ts = s.territories[t];
      if (ts.owner === null) return `${t} has no owner`;
      const pendingTarget = s.pendingOccupy?.to === t;
      if (ts.armies < 1 && !pendingTarget) return `${t} has ${ts.armies} armies`;
    }
  }
  const inHands = s.players.reduce((n, p) => n + p.cards.length, 0);
  const all = [...s.deck, ...s.discard, ...s.players.flatMap((p) => p.cards)];
  if (all.length !== TOTAL_CARDS || new Set(all).size !== TOTAL_CARDS) return `card conservation broken (deck ${s.deck.length} discard ${s.discard.length} hands ${inHands})`;
  for (const p of s.players) {
    if (p.isNeutral && p.cards.length) return 'neutral holds cards';
    if (p.id === NEUTRAL && !p.isNeutral) return 'neutral flag';
  }
  if (s.players[s.current].isNeutral) return 'neutral is the current player';
  if (s.log.length > 200) return 'log too long';
  return null;
}
