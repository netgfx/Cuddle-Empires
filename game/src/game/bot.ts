// Heuristic bot. Always returns a legal action (falls back to legalActions) and is
// aggressive enough that all-bot games finish.
import {
  attackSources, attackTargets, createGame, findSets, fortifyTargets, legalActions, maxAttackDice,
  placementTargets, reduce,
} from './engine';
import { ADJACENT, CONTINENTS, TERRITORIES, TERRITORY_IDS } from './mapData';
import type { Action, GameSettings, GameState, NewPlayer, PlayerId, TerritoryId } from './types';
import { NEUTRAL } from './types';

/** Max attack actions a bot makes per turn (each may be a blitz). */
const MAX_ATTACKS_PER_TURN = 25;

const owner = (s: GameState, t: TerritoryId) => s.territories[t].owner;
const armies = (s: GameState, t: TerritoryId) => s.territories[t].armies;
const enemyNeighbours = (s: GameState, t: TerritoryId, me: PlayerId) =>
  ADJACENT[t].filter((n) => owner(s, n) !== null && owner(s, n) !== me);

/** Fraction of the continent of `t` held by `me`. */
function continentShare(s: GameState, t: TerritoryId, me: PlayerId): number {
  const c = CONTINENTS[TERRITORIES[t].continent];
  return c.territories.filter((x) => owner(s, x) === me).length / c.territories.length;
}

function argmax<T>(items: T[], score: (x: T) => number): T | undefined {
  let best: T | undefined;
  let bestScore = -Infinity;
  for (const x of items) {
    const v = score(x);
    if (v > bestScore) { bestScore = v; best = x; }
  }
  return best;
}

/** How attractive capturing `target` is for `me`. */
function targetValue(s: GameState, target: TerritoryId, me: PlayerId): number {
  const c = CONTINENTS[TERRITORIES[target].continent];
  const share = continentShare(s, target, me);
  const tOwner = owner(s, target);
  // finishing a continent is worth a lot; breaking someone else's continent too
  const completes = c.territories.filter((x) => owner(s, x) !== me).length === 1 ? c.bonus * 2 : 0;
  const breaks = tOwner && c.territories.every((x) => owner(s, x) === tOwner) ? c.bonus : 0;
  const neutralPenalty = tOwner === NEUTRAL ? 1 : 0;
  return share * 8 + completes + breaks + c.bonus * 0.2 - neutralPenalty;
}

/** Best own border territory to stack reinforcements on. */
function bestPlacement(s: GameState, me: PlayerId, candidates: TerritoryId[]): TerritoryId {
  const borders = candidates.filter((t) => enemyNeighbours(s, t, me).length > 0);
  const pool = borders.length ? borders : candidates;
  return argmax(pool, (t) => {
    const enemies = enemyNeighbours(s, t, me);
    const opportunity = enemies.length ? Math.max(...enemies.map((n) => targetValue(s, n, me) - armies(s, n) * 0.6)) : 0;
    const threat = enemies.reduce((m, n) => Math.max(m, armies(s, n)), 0) - armies(s, t);
    return opportunity + continentShare(s, t, me) * 3 + Math.max(0, threat) * 0.15;
  }) ?? pool[0];
}

function attacksThisTurn(s: GameState, me: PlayerId): number {
  let n = 0;
  for (let i = s.log.length - 1; i >= 0; i--) {
    const e = s.log[i];
    if (e.turn !== s.turn || (e.player !== me && e.player !== null)) break;
    if (e.player === me && e.text.includes(' attacks ')) n++;
  }
  return n;
}

function chooseTrade(s: GameState, me: PlayerId): Action | null {
  const sets = findSets(s, me);
  if (!sets.length) return null;
  const best = argmax(sets, (set) => {
    const ownsCard = set.some((id) => { const t = s.cards[id].territory; return t !== null && owner(s, t) === me; });
    const wilds = set.filter((id) => s.cards[id].unit === 'wild').length;
    return (ownsCard ? 2 : 0) - wilds; // keep wilds for later
  })!;
  return { type: 'tradeCards', cards: best };
}

function decide(s: GameState, me: PlayerId): Action | null {
  switch (s.phase) {
    case 'setupClaim': {
      const empty = placementTargets(s);
      const t = argmax(empty, (x) => {
        const c = CONTINENTS[TERRITORIES[x].continent];
        const mine = c.territories.filter((y) => owner(s, y) === me).length;
        const theirs = c.territories.filter((y) => owner(s, y) !== null && owner(s, y) !== me).length;
        const adj = ADJACENT[x].filter((n) => owner(s, n) === me).length;
        return (mine + 1) / c.territories.length * 6 - theirs * 0.8 + adj + (10 - c.territories.length) * 0.2;
      });
      return t ? { type: 'claim', territory: t } : null;
    }
    case 'setupReinforce': {
      const targets = placementTargets(s);
      if (!targets.length) return null;
      if (s.setupStep && s.setupStep.own === 0) {
        // neutral army: put it where it blocks the opponent the most
        const t = argmax(targets, (x) => ADJACENT[x].filter((n) => owner(s, n) !== me && owner(s, n) !== NEUTRAL).length * 2 - armies(s, x) * 0.1);
        return { type: 'placeSetup', territory: t ?? targets[0] };
      }
      return { type: 'placeSetup', territory: bestPlacement(s, me, targets) };
    }
    case 'reinforce': {
      const trade = chooseTrade(s, me);
      if (trade) return trade;
      if (s.mustTrade) return null;
      const t = bestPlacement(s, me, placementTargets(s));
      return { type: 'placeReinforcements', territory: t, count: s.reinforcements };
    }
    case 'occupy': {
      const p = s.pendingOccupy;
      if (!p) return null;
      const stillBorder = enemyNeighbours(s, p.from, me).some((n) => n !== p.to);
      const count = stillBorder ? Math.max(p.min, Math.ceil(p.max * 0.6)) : p.max;
      return { type: 'occupy', count };
    }
    case 'attack': {
      if (s.mustTrade) return chooseTrade(s, me);
      if (s.reinforcements > 0) {
        return { type: 'placeReinforcements', territory: bestPlacement(s, me, placementTargets(s)), count: s.reinforcements };
      }
      if (attacksThisTurn(s, me) < MAX_ATTACKS_PER_TURN) {
        let best: { from: TerritoryId; to: TerritoryId; score: number } | null = null;
        for (const from of attackSources(s)) {
          for (const to of attackTargets(s, from)) {
            if (armies(s, from) < armies(s, to) + 2) continue;
            const score = (armies(s, from) - armies(s, to)) * 0.5 + targetValue(s, to, me);
            if (!best || score > best.score) best = { from, to, score };
          }
        }
        if (best) return { type: 'attack', from: best.from, to: best.to, dice: maxAttackDice(s, best.from) as 1 | 2 | 3, blitz: true };
      }
      return { type: 'endAttack' };
    }
    case 'fortify': {
      const mine = TERRITORY_IDS.filter((t) => owner(s, t) === me);
      const interior = mine.filter((t) => armies(s, t) > 1 && enemyNeighbours(s, t, me).length === 0);
      const src = argmax(interior, (t) => armies(s, t));
      if (!src) return { type: 'endTurn' };
      const targets = fortifyTargets(s, src);
      const borders = targets.filter((t) => enemyNeighbours(s, t, me).length > 0);
      let to: TerritoryId | undefined;
      if (borders.length) {
        to = argmax(borders, (t) => enemyNeighbours(s, t, me).reduce((m, n) => Math.max(m, armies(s, n)), 0) - armies(s, t) * 0.2);
      } else if (targets.length) {
        // step towards the nearest border
        const dist = distanceToBorder(s, me);
        to = argmax(targets, (t) => -(dist.get(t) ?? 99));
        if (to && (dist.get(to) ?? 99) >= (dist.get(src) ?? 99)) to = undefined;
      }
      if (!to) return { type: 'endTurn' };
      return { type: 'fortify', from: src, to, count: armies(s, src) - 1 };
    }
    default:
      return null;
  }
}

/** BFS distance (through own territories) from each own territory to the nearest own border territory. */
function distanceToBorder(s: GameState, me: PlayerId): Map<TerritoryId, number> {
  const dist = new Map<TerritoryId, number>();
  const queue: TerritoryId[] = [];
  for (const t of TERRITORY_IDS) {
    if (owner(s, t) === me && enemyNeighbours(s, t, me).length > 0) { dist.set(t, 0); queue.push(t); }
  }
  while (queue.length) {
    const t = queue.shift()!;
    for (const n of ADJACENT[t]) {
      if (owner(s, n) === me && !dist.has(n)) { dist.set(n, dist.get(t)! + 1); queue.push(n); }
    }
  }
  return dist;
}

/** Pick an action for `player`. Always legal for the given state (when it is that player's turn). */
export function chooseBotAction(state: GameState, player: PlayerId): Action {
  try {
    const a = decide(state, player);
    if (a && reduce(state, a, player).ok) return a;
  } catch {
    // fall through to a guaranteed-legal action
  }
  const legal = legalActions(state, player);
  return legal.find((a) => a.type === 'endAttack')
    ?? legal.find((a) => a.type === 'endTurn')
    ?? legal[0]
    ?? { type: 'endTurn' };
}

const BOT_COLORS = ['#E63946', '#3A86FF', '#6CC24A', '#FFBE0B', '#8E44AD', '#34495E'];

/** Runs an all-bot game through `reduce`. Throws if a bot ever produces an illegal action. */
export function simulateGame(
  seed: number, nPlayers: number, maxActions = 20000, settings?: Partial<GameSettings>,
): { state: GameState; actions: number } {
  const players: NewPlayer[] = Array.from({ length: nPlayers }, (_, i) => ({ name: `Bot ${i + 1}`, color: BOT_COLORS[i], kind: 'bot' }));
  let state = createGame(players, settings, seed);
  let actions = 0;
  while (state.phase !== 'gameOver' && actions < maxActions) {
    const actor = state.players[state.current].id;
    const action = chooseBotAction(state, actor);
    const res = reduce(state, action, actor);
    if (!res.ok) throw new Error(`Bot ${actor} sent an illegal action ${JSON.stringify(action)}: ${res.error}`);
    state = res.state;
    actions++;
  }
  return { state, actions };
}
