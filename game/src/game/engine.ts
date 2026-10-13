// Rules engine — PUBLIC API CONTRACT. Keep these exported names and signatures stable
// (UI, scene, server and bot depend on them).
//
// `reduce` is a pure reducer: it clones the input, applies one action, and returns the new
// state plus the events that animations / logs play back. All randomness is drawn from the
// mulberry32 state stored in `state.rng`, so the same seed + the same actions replay exactly.
import type {
  Action, BattleRoll, GameEvent, GameSettings, GameState, NewPlayer, Player, PlayerId, ReduceResult,
  ReinforcementBreakdown, TerritoryId, TerritoryState,
} from './types';
import { DEFAULT_SETTINGS, NEUTRAL } from './types';
import { ADJACENT, CONTINENT_IDS, CONTINENTS, TERRITORIES, TERRITORY_IDS } from './mapData';
import { buildCards, cardIdFor, isSetOf, setValue, WILD_CARD_IDS } from './cards';
import { normalizeSeed, randInt, rollDie, shuffle } from './rng';

const STARTING_ARMIES: Record<number, number> = { 2: 40, 3: 35, 4: 30, 5: 25, 6: 20 };
const NEUTRAL_COLOR = '#A0A4A8';
const MAX_LOG = 200;

// ---------------------------------------------------------------- helpers

class RuleError extends Error {}
function fail(message: string): never { throw new RuleError(message); }

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const tName = (t: TerritoryId) => TERRITORIES[t].name;

function playerById(s: GameState, id: PlayerId): Player | undefined {
  return s.players.find((p) => p.id === id);
}
function pName(s: GameState, id: PlayerId | null): string {
  if (id === null) return 'nobody';
  return playerById(s, id)?.name ?? id;
}

function log(s: GameState, player: PlayerId | null, text: string) {
  s.log.push({ turn: s.turn, player, text });
}

function makeNeutral(): Player {
  return { id: NEUTRAL, name: 'Neutral', color: NEUTRAL_COLOR, kind: 'bot', isNeutral: true, eliminated: false, cards: [] };
}

/** Shallow-structured clone: every mutable part is copied, immutable parts (cards, settings, log entries, lastBattle) are shared. */
function cloneState(s: GameState): GameState {
  const territories = {} as Record<TerritoryId, TerritoryState>;
  for (const k of Object.keys(s.territories) as TerritoryId[]) territories[k] = { ...s.territories[k] };
  return {
    ...s,
    players: s.players.map((p) => ({ ...p, cards: [...p.cards] })),
    territories,
    setupPool: { ...s.setupPool },
    setupStep: s.setupStep ? { ...s.setupStep } : null,
    deck: [...s.deck],
    discard: [...s.discard],
    log: [...s.log],
    pendingOccupy: s.pendingOccupy ? { ...s.pendingOccupy } : null,
  };
}

function ownedBy(s: GameState, player: PlayerId): TerritoryId[] {
  return TERRITORY_IDS.filter((t) => s.territories[t].owner === player);
}

function territoryArg(x: unknown, label = 'territory'): TerritoryId {
  if (typeof x !== 'string' || !has(TERRITORIES, x)) fail(`Unknown ${label} "${String(x)}".`);
  return x as TerritoryId;
}

function intArg(x: unknown, label: string): number {
  if (typeof x !== 'number' || !Number.isInteger(x)) fail(`${label} must be a whole number.`);
  return x;
}

/** Next player (after `from`) who still takes turns. `wrapped` = play passed the end of the order. */
function nextActive(s: GameState, from: number): { index: number; wrapped: boolean } | null {
  const n = s.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    const p = s.players[idx];
    if (!p.isNeutral && !p.eliminated) return { index: idx, wrapped: idx <= from };
  }
  return null;
}

/** Next non-neutral player (after `from`, possibly `from` itself last) with armies left in the setup pool. */
function nextWithPool(s: GameState, from: number): number | null {
  const n = s.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    const p = s.players[idx];
    if (!p.isNeutral && (s.setupPool[p.id] ?? 0) > 0) return idx;
  }
  return null;
}

function makeSetupStep(s: GameState, index: number): { own: number; neutral: number } {
  const p = s.players[index];
  return { own: Math.min(2, s.setupPool[p.id] ?? 0), neutral: (s.setupPool[NEUTRAL] ?? 0) > 0 ? 1 : 0 };
}

function startTurn(s: GameState, events: GameEvent[], index: number) {
  s.current = index;
  s.phase = 'reinforce';
  s.setupStep = null;
  s.conqueredThisTurn = false;
  s.territoryBonusUsed = false;
  s.pendingOccupy = null;
  s.bonusTerritory = null;
  const p = s.players[index];
  const br = reinforcementsFor(s, p.id);
  s.reinforcements = br.total;
  s.mustTrade = p.cards.length >= 5;
  events.push({ type: 'turnStarted', player: p.id, turn: s.turn, reinforcements: br });
  events.push({ type: 'phaseChanged', phase: 'reinforce' });
  const cont = br.continents.length ? ` (incl. ${br.continents.map((c) => `${CONTINENTS[c.continent].name} +${c.bonus}`).join(', ')})` : '';
  log(s, p.id, `Turn ${s.turn}: ${p.name} receives ${br.total} armies${cont}.${s.mustTrade ? ' Must trade cards first.' : ''}`);
}

function advanceTurn(s: GameState, events: GameEvent[]) {
  const next = nextActive(s, s.current);
  if (!next) return; // no one left (game over is handled by callers)
  if (next.wrapped) s.turn += 1;
  startTurn(s, events, next.index);
}

function finishSetup(s: GameState, events: GameEvent[]) {
  log(s, null, 'Setup complete — let the conquest begin!');
  s.turn = 1;
  startTurn(s, events, 0);
}

function activeOpponents(s: GameState, me: PlayerId): Player[] {
  return s.players.filter((p) => !p.isNeutral && !p.eliminated && p.id !== me);
}

function declareWinner(s: GameState, events: GameEvent[], winner: PlayerId) {
  s.phase = 'gameOver';
  s.winner = winner;
  s.reinforcements = 0;
  s.mustTrade = false;
  s.pendingOccupy = null;
  events.push({ type: 'phaseChanged', phase: 'gameOver' });
  events.push({ type: 'gameOver', winner });
  log(s, winner, `${pName(s, winner)} conquers the world!`);
}

function drawCard(s: GameState, events: GameEvent[], player: Player) {
  if (s.deck.length === 0 && s.discard.length > 0) {
    s.deck = shuffle(s, [...s.discard]);
    s.discard = [];
    log(s, null, 'The discard pile is reshuffled into a new deck.');
  }
  const id = s.deck.pop();
  if (id === undefined) {
    log(s, player.id, `${player.name} earns a card, but the deck is empty.`);
    return;
  }
  player.cards.push(id);
  events.push({ type: 'cardDrawn', player: player.id, card: id });
  log(s, player.id, `${player.name} draws a card.`);
}

// ---------------------------------------------------------------- createGame

/** Create a new game. 2–6 players; with 2 players the neutral player is added automatically (book 2-player rules). */
export function createGame(players: NewPlayer[], settings?: Partial<GameSettings>, seed?: number): GameState {
  if (!Array.isArray(players) || players.length < 2 || players.length > 6) throw new Error('RISK needs 2 to 6 players.');
  const st: GameSettings = { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
  const h = { rng: normalizeSeed(seed ?? Math.floor(Math.random() * 2 ** 31)) };

  let list: Player[] = players.map((p, i) => ({
    id: p.id ?? `p${i + 1}`, name: p.name, color: p.color, kind: p.kind, isNeutral: false, eliminated: false, cards: [],
  }));
  const ids = new Set(list.map((p) => p.id));
  if (ids.size !== list.length) throw new Error('Player ids must be unique.');
  if (ids.has(NEUTRAL)) throw new Error(`"${NEUTRAL}" is reserved for the neutral player.`);

  // Random first player: rotate the order so the first player sits at index 0.
  const first = randInt(h, list.length);
  list = [...list.slice(first), ...list.slice(0, first)];
  const twoPlayer = list.length === 2;
  if (twoPlayer) list.push(makeNeutral());

  const start = STARTING_ARMIES[players.length];
  const setupPool: Record<PlayerId, number> = {};
  for (const p of list) setupPool[p.id] = start;

  const territories = {} as Record<TerritoryId, TerritoryState>;
  for (const t of TERRITORY_IDS) territories[t] = { owner: null, armies: 0 };

  const s: GameState = {
    version: 0,
    rng: h.rng,
    settings: st,
    players: list,
    current: 0,
    turn: 1,
    phase: 'setupClaim',
    territories,
    setupPool,
    setupStep: null,
    reinforcements: 0,
    bonusTerritory: null,
    deck: [],
    discard: [],
    cards: buildCards(),
    setsTraded: 0,
    conqueredThisTurn: false,
    territoryBonusUsed: false,
    mustTrade: false,
    pendingOccupy: null,
    lastBattle: null,
    winner: null,
    log: [],
  };
  const allCards = [...TERRITORY_IDS.map(cardIdFor), ...WILD_CARD_IDS];
  log(s, null, `New game: ${list.filter((p) => !p.isNeutral).map((p) => p.name).join(', ')}${twoPlayer ? ' (+ neutral armies)' : ''}. ${list[0].name} goes first.`);

  const deal = (order: TerritoryId[]) => {
    order.forEach((t, i) => {
      const p = list[i % list.length];
      s.territories[t] = { owner: p.id, armies: 1 };
      s.setupPool[p.id] -= 1;
    });
  };

  if (st.setup === 'auto') {
    deal(shuffle(s, [...TERRITORY_IDS]));
    for (const p of list) {
      const own = ownedBy(s, p.id);
      while (s.setupPool[p.id] > 0) {
        s.territories[own[randInt(s, own.length)]].armies += 1;
        s.setupPool[p.id] -= 1;
      }
    }
    s.deck = shuffle(s, [...allCards]);
    log(s, null, 'Territories dealt and armies placed automatically.');
    finishSetup(s, []);
    return s;
  }

  if (twoPlayer) {
    // Book 2-player rules: remove the wilds, deal the territory cards to the 2 players + neutral, return the wilds, reshuffle.
    const territoryCards = shuffle(s, [...TERRITORY_IDS.map(cardIdFor)]);
    deal(territoryCards.map((c) => s.cards[c].territory as TerritoryId));
    s.deck = shuffle(s, [...allCards]);
    s.phase = 'setupReinforce';
    s.setupStep = makeSetupStep(s, 0);
    log(s, null, 'Territories dealt 14 / 14 / 14. Each turn: place 2 of your armies, then 1 neutral army.');
    return s;
  }

  s.deck = shuffle(s, [...allCards]);
  s.phase = 'setupClaim';
  log(s, null, 'Claim territories in turn order.');
  return s;
}

// ---------------------------------------------------------------- reduce

/** Apply one action by `actor`. Pure: never mutates `state`. */
export function reduce(state: GameState, action: Action, actor: PlayerId): ReduceResult {
  try {
    if (!action || typeof action !== 'object' || typeof (action as { type?: unknown }).type !== 'string') fail('Invalid action.');
    if (state.phase === 'gameOver') fail('The game is over.');
    const cur = state.players[state.current];
    if (!state.players.some((p) => p.id === actor)) fail(`Unknown player "${String(actor)}".`);
    if (actor !== cur.id) fail(`It is not your turn — it is ${cur.name}'s turn.`);

    const s = cloneState(state);
    const events: GameEvent[] = [];
    const me = s.players[s.current];

    switch (action.type) {
      case 'claim': doClaim(s, events, me, action); break;
      case 'placeSetup': doPlaceSetup(s, events, me, action); break;
      case 'tradeCards': doTrade(s, events, me, action); break;
      case 'placeReinforcements': doPlaceReinforcements(s, events, me, action); break;
      case 'attack': doAttack(s, events, me, action); break;
      case 'occupy': doOccupy(s, events, me, action); break;
      case 'endAttack': doEndAttack(s, events, me); break;
      case 'fortify': doFortify(s, events, me, action); break;
      case 'endTurn': doEndTurn(s, events, me); break;
      case 'resign': doResign(s, events, me); break;
      default: fail(`Unknown action "${String((action as { type: unknown }).type)}".`);
    }

    s.version = state.version + 1;
    if (s.log.length > MAX_LOG) s.log = s.log.slice(-MAX_LOG);
    return { ok: true, state: s, events };
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, error: e.message };
    throw e;
  }
}

type A<T extends Action['type']> = Extract<Action, { type: T }>;

function doClaim(s: GameState, ev: GameEvent[], me: Player, a: A<'claim'>) {
  if (s.phase !== 'setupClaim') fail('Territories can only be claimed during the claiming phase.');
  const t = territoryArg(a.territory);
  if (s.territories[t].owner !== null) fail(`${tName(t)} is already claimed.`);
  if ((s.setupPool[me.id] ?? 0) <= 0) fail('You have no armies left to place.');
  s.territories[t] = { owner: me.id, armies: 1 };
  s.setupPool[me.id] -= 1;
  ev.push({ type: 'claimed', player: me.id, territory: t });
  log(s, me.id, `${me.name} claims ${tName(t)}.`);

  if (TERRITORY_IDS.every((x) => s.territories[x].owner !== null)) {
    s.phase = 'setupReinforce';
    ev.push({ type: 'phaseChanged', phase: 'setupReinforce' });
    log(s, null, 'All territories claimed. Now place your remaining armies one at a time.');
    const next = nextWithPool(s, s.current);
    if (next === null) finishSetup(s, ev);
    else s.current = next;
    return;
  }
  const next = nextActive(s, s.current);
  if (next) s.current = next.index;
}

function doPlaceSetup(s: GameState, ev: GameEvent[], me: Player, a: A<'placeSetup'>) {
  if (s.phase !== 'setupReinforce') fail('Setup armies can only be placed during the setup phase.');
  const t = territoryArg(a.territory);
  const terr = s.territories[t];

  if (s.setupStep) {
    const step = s.setupStep;
    if (step.own > 0) {
      if (terr.owner !== me.id) fail(`Place your own armies first: ${tName(t)} is not yours.`);
      terr.armies += 1;
      s.setupPool[me.id] -= 1;
      step.own -= 1;
      ev.push({ type: 'armiesPlaced', player: me.id, territory: t, count: 1 });
      log(s, me.id, `${me.name} places an army on ${tName(t)}.`);
    } else if (step.neutral > 0) {
      if (terr.owner !== NEUTRAL) fail(`Now place 1 neutral army on a neutral territory — ${tName(t)} is not neutral.`);
      terr.armies += 1;
      s.setupPool[NEUTRAL] -= 1;
      step.neutral -= 1;
      ev.push({ type: 'armiesPlaced', player: NEUTRAL, territory: t, count: 1 });
      log(s, me.id, `${me.name} places a neutral army on ${tName(t)}.`);
    }
    if (step.own === 0 && step.neutral === 0) {
      const next = nextWithPool(s, s.current);
      if (next === null) { finishSetup(s, ev); return; }
      s.current = next;
      s.setupStep = makeSetupStep(s, next);
    }
    return;
  }

  if ((s.setupPool[me.id] ?? 0) <= 0) fail('You have no armies left to place.');
  if (terr.owner !== me.id) fail(`${tName(t)} is not yours.`);
  terr.armies += 1;
  s.setupPool[me.id] -= 1;
  ev.push({ type: 'armiesPlaced', player: me.id, territory: t, count: 1 });
  log(s, me.id, `${me.name} places an army on ${tName(t)}.`);
  const next = nextWithPool(s, s.current);
  if (next === null) finishSetup(s, ev);
  else s.current = next;
}

function doTrade(s: GameState, ev: GameEvent[], me: Player, a: A<'tradeCards'>) {
  if (s.pendingOccupy) fail('Move armies into the captured territory first.');
  if (!(s.phase === 'reinforce' || (s.phase === 'attack' && s.mustTrade))) {
    fail('Cards can only be traded while placing reinforcements at the start of your turn (or when forced to after an elimination).');
  }
  const ids = a.cards;
  if (!Array.isArray(ids) || ids.length !== 3) fail('Choose exactly 3 cards to trade.');
  if (new Set(ids).size !== 3) fail('Choose 3 different cards.');
  for (const id of ids) if (typeof id !== 'string' || !me.cards.includes(id)) fail('You can only trade cards from your own hand.');
  if (!isSetOf(ids.map((id) => s.cards[id]))) fail('Those cards are not a set: trade 3 of a kind, 1 of each kind, or any 2 with a wild.');

  const value = nextSetValue(s);
  s.setsTraded += 1;
  me.cards = me.cards.filter((c) => !ids.includes(c));
  s.discard.push(...ids);
  s.reinforcements += value;

  let bonus: TerritoryId | null = null;
  if (!s.territoryBonusUsed) {
    for (const id of ids) {
      const t = s.cards[id].territory;
      if (t && s.territories[t].owner === me.id) { bonus = t; break; }
    }
  }
  ev.push({ type: 'cardsTraded', player: me.id, cards: [...ids], armies: value, bonusTerritory: bonus });
  log(s, me.id, `${me.name} trades a set for ${value} armies.`);
  if (bonus) {
    s.territoryBonusUsed = true;
    s.territories[bonus].armies += 2;
    ev.push({ type: 'armiesPlaced', player: me.id, territory: bonus, count: 2 });
    log(s, me.id, `+2 bonus armies on ${tName(bonus)}.`);
  }
  if (s.mustTrade && me.cards.length <= 4) s.mustTrade = false;
}

function doPlaceReinforcements(s: GameState, ev: GameEvent[], me: Player, a: A<'placeReinforcements'>) {
  if (!(s.phase === 'reinforce' || (s.phase === 'attack' && s.reinforcements > 0))) fail('You have no reinforcements to place right now.');
  if (s.mustTrade) fail(`You must trade cards first (you hold ${me.cards.length}).`);
  const t = territoryArg(a.territory);
  const count = intArg(a.count, 'Army count');
  if (s.territories[t].owner !== me.id) fail(`${tName(t)} is not yours.`);
  if (count < 1) fail('Place at least 1 army.');
  if (count > s.reinforcements) fail(`You only have ${s.reinforcements} armies to place.`);
  s.territories[t].armies += count;
  s.reinforcements -= count;
  ev.push({ type: 'armiesPlaced', player: me.id, territory: t, count });
  log(s, me.id, `${me.name} places ${count} ${count === 1 ? 'army' : 'armies'} on ${tName(t)}.`);
  if (s.reinforcements === 0 && s.phase === 'reinforce') {
    s.phase = 'attack';
    ev.push({ type: 'phaseChanged', phase: 'attack' });
  }
}

function rollBattle(s: GameState, from: TerritoryId, to: TerritoryId, dice: number): BattleRoll {
  const A = s.territories[from];
  const D = s.territories[to];
  const defDice = Math.min(2, D.armies);
  const attackerDice = Array.from({ length: dice }, () => rollDie(s)).sort((x, y) => y - x);
  const defenderDice = Array.from({ length: defDice }, () => rollDie(s)).sort((x, y) => y - x);
  let attackerLosses = 0;
  let defenderLosses = 0;
  for (let i = 0; i < Math.min(attackerDice.length, defenderDice.length); i++) {
    if (attackerDice[i] > defenderDice[i]) defenderLosses++;
    else attackerLosses++; // ties go to the defender
  }
  const roll: BattleRoll = {
    from, to, attacker: A.owner as PlayerId, defender: D.owner as PlayerId,
    attackerDice, defenderDice, attackerLosses, defenderLosses,
  };
  A.armies -= attackerLosses;
  D.armies -= defenderLosses;
  return roll;
}

function doAttack(s: GameState, ev: GameEvent[], me: Player, a: A<'attack'>) {
  if (s.phase === 'occupy' || s.pendingOccupy) fail('Move armies into the captured territory first.');
  if (s.phase !== 'attack') fail('You can only attack during the attack phase.');
  if (s.mustTrade) fail(`You must trade cards first (you hold ${me.cards.length}).`);
  if (s.reinforcements > 0) fail(`Place your remaining ${s.reinforcements} armies before attacking.`);
  const from = territoryArg(a.from, 'attacking territory');
  const to = territoryArg(a.to, 'target territory');
  const F = s.territories[from];
  const T = s.territories[to];
  if (F.owner !== me.id) fail(`You can only attack from your own territory (${tName(from)} isn't yours).`);
  if (F.armies < 2) fail(`${tName(from)} needs at least 2 armies to attack.`);
  if (!ADJACENT[from].includes(to)) fail(`${tName(to)} does not border ${tName(from)}.`);
  if (T.owner === me.id) fail(`You can't attack your own territory (${tName(to)}).`);
  const dice = intArg(a.dice, 'Dice');
  const maxDice = Math.min(3, F.armies - 1);
  if (dice < 1 || dice > maxDice) fail(`You can roll 1 to ${maxDice} ${maxDice === 1 ? 'die' : 'dice'} from ${tName(from)}.`);

  const defender = T.owner as PlayerId;
  let rolls = 0, aLoss = 0, dLoss = 0, lastDice = dice;
  for (;;) {
    lastDice = Math.min(dice, F.armies - 1);
    const roll = rollBattle(s, from, to, lastDice);
    rolls++;
    aLoss += roll.attackerLosses;
    dLoss += roll.defenderLosses;
    s.lastBattle = roll;
    ev.push({ type: 'battle', roll });
    if (T.armies === 0) break;
    if (!a.blitz || F.armies < 2) break;
  }
  log(s, me.id, `${me.name} attacks ${tName(to)} (${pName(s, defender)}) from ${tName(from)}${a.blitz ? ` — blitz, ${rolls} ${rolls === 1 ? 'roll' : 'rolls'}` : ''}: loses ${aLoss}, kills ${dLoss}.`);
  if (T.armies === 0) capture(s, ev, me, from, to, defender, lastDice);
}

function capture(s: GameState, ev: GameEvent[], me: Player, from: TerritoryId, to: TerritoryId, previousOwner: PlayerId, dice: number) {
  const F = s.territories[from];
  const T = s.territories[to];
  T.owner = me.id;
  T.armies = 0;
  s.conqueredThisTurn = true;
  ev.push({ type: 'conquered', player: me.id, from, to, previousOwner });
  log(s, me.id, `${me.name} captures ${tName(to)}!`);

  const prev = playerById(s, previousOwner);
  if (prev && !prev.isNeutral && ownedBy(s, prev.id).length === 0) {
    prev.eliminated = true;
    const taken = [...prev.cards];
    prev.cards = [];
    me.cards.push(...taken);
    ev.push({ type: 'eliminated', player: prev.id, by: me.id, cardsTaken: taken });
    log(s, me.id, `${prev.name} is eliminated by ${me.name}${taken.length ? `, who takes ${taken.length} ${taken.length === 1 ? 'card' : 'cards'}` : ''}.`);
    if (activeOpponents(s, me.id).length === 0) {
      const move = F.armies - 1;
      F.armies -= move;
      T.armies += move;
      ev.push({ type: 'armiesMoved', player: me.id, from, to, count: move, reason: 'occupy' });
      declareWinner(s, ev, me.id);
      return;
    }
    if (me.cards.length >= 6) {
      s.mustTrade = true;
      log(s, me.id, `${me.name} holds ${me.cards.length} cards and must trade down to 4 or fewer.`);
    }
  }

  const max = F.armies - 1;
  const min = Math.min(dice, max);
  if (min === max) {
    F.armies -= max;
    T.armies += max;
    ev.push({ type: 'armiesMoved', player: me.id, from, to, count: max, reason: 'occupy' });
    log(s, me.id, `${me.name} moves ${max} into ${tName(to)}.`);
    return;
  }
  s.pendingOccupy = { from, to, min, max };
  s.phase = 'occupy';
  ev.push({ type: 'phaseChanged', phase: 'occupy' });
}

function doOccupy(s: GameState, ev: GameEvent[], me: Player, a: A<'occupy'>) {
  const p = s.pendingOccupy;
  if (s.phase !== 'occupy' || !p) fail('There is no captured territory to move into.');
  const count = intArg(a.count, 'Army count');
  if (count < p.min || count > p.max) fail(`Move between ${p.min} and ${p.max} armies into ${tName(p.to)}.`);
  s.territories[p.from].armies -= count;
  s.territories[p.to].armies += count;
  s.pendingOccupy = null;
  s.phase = 'attack';
  ev.push({ type: 'armiesMoved', player: me.id, from: p.from, to: p.to, count, reason: 'occupy' });
  ev.push({ type: 'phaseChanged', phase: 'attack' });
  log(s, me.id, `${me.name} moves ${count} into ${tName(p.to)}.`);
}

function assertCanLeaveAttack(s: GameState, me: Player) {
  if (s.phase === 'occupy' || s.pendingOccupy) fail('Move armies into the captured territory first.');
  if (s.phase !== 'attack') fail('You are not in the attack phase.');
  if (s.mustTrade) fail(`You must trade cards first (you hold ${me.cards.length}).`);
  if (s.reinforcements > 0) fail(`Place your remaining ${s.reinforcements} armies first.`);
}

function leaveAttack(s: GameState, ev: GameEvent[], me: Player) {
  if (s.conqueredThisTurn) drawCard(s, ev, me);
  s.phase = 'fortify';
  ev.push({ type: 'phaseChanged', phase: 'fortify' });
}

function doEndAttack(s: GameState, ev: GameEvent[], me: Player) {
  assertCanLeaveAttack(s, me);
  leaveAttack(s, ev, me);
}

function doFortify(s: GameState, ev: GameEvent[], me: Player, a: A<'fortify'>) {
  if (s.phase !== 'fortify') fail('You can only fortify after attacking (end the attack phase first).');
  const from = territoryArg(a.from);
  const to = territoryArg(a.to);
  if (s.territories[from].owner !== me.id) fail(`${tName(from)} is not yours.`);
  if (s.territories[to].owner !== me.id) fail(`${tName(to)} is not yours.`);
  if (from === to) fail('Choose two different territories.');
  const count = intArg(a.count, 'Army count');
  const max = s.territories[from].armies - 1;
  if (max < 1) fail(`${tName(from)} must keep at least 1 army — it has none to spare.`);
  if (count < 1 || count > max) fail(`Move between 1 and ${max} armies from ${tName(from)}.`);
  if (!fortifyTargets(s, from).includes(to)) {
    fail(s.settings.fortify === 'adjacent'
      ? `${tName(to)} must border ${tName(from)}.`
      : `${tName(to)} must be connected to ${tName(from)} through your own territories.`);
  }
  s.territories[from].armies -= count;
  s.territories[to].armies += count;
  ev.push({ type: 'armiesMoved', player: me.id, from, to, count, reason: 'fortify' });
  log(s, me.id, `${me.name} fortifies ${tName(to)} with ${count} from ${tName(from)}.`);
  advanceTurn(s, ev);
}

function doEndTurn(s: GameState, ev: GameEvent[], me: Player) {
  if (s.phase === 'attack') {
    assertCanLeaveAttack(s, me);
    leaveAttack(s, ev, me);
  } else if (s.phase !== 'fortify') {
    fail(s.phase === 'reinforce' ? 'Place all your reinforcements first.' : 'You cannot end your turn right now.');
  }
  log(s, me.id, `${me.name} ends the turn.`);
  advanceTurn(s, ev);
}

function doResign(s: GameState, ev: GameEvent[], me: Player) {
  if (s.phase === 'setupClaim' || s.phase === 'setupReinforce') fail('You cannot resign during setup.');
  if (s.pendingOccupy) {
    const p = s.pendingOccupy;
    s.territories[p.from].armies -= p.min;
    s.territories[p.to].armies += p.min;
    ev.push({ type: 'armiesMoved', player: me.id, from: p.from, to: p.to, count: p.min, reason: 'occupy' });
    s.pendingOccupy = null;
  }
  if (!playerById(s, NEUTRAL)) s.players.push(makeNeutral());
  for (const t of ownedBy(s, me.id)) s.territories[t].owner = NEUTRAL;
  s.discard.push(...me.cards);
  me.cards = [];
  me.eliminated = true;
  s.reinforcements = 0;
  s.mustTrade = false;
  ev.push({ type: 'eliminated', player: me.id, by: NEUTRAL, cardsTaken: [] });
  log(s, me.id, `${me.name} resigns; their armies turn neutral.`);
  const left = s.players.filter((p) => !p.isNeutral && !p.eliminated);
  if (left.length === 1) { declareWinner(s, ev, left[0].id); return; }
  if (left.length === 0) { s.phase = 'gameOver'; ev.push({ type: 'phaseChanged', phase: 'gameOver' }); return; }
  advanceTurn(s, ev);
}

// ---------------------------------------------------------------- selectors (pure helpers for UI / bot)

export function currentPlayerId(s: GameState): PlayerId { return s.players[s.current].id; }

export function reinforcementsFor(s: GameState, player: PlayerId): ReinforcementBreakdown {
  const owned = ownedBy(s, player).length;
  const territories = Math.max(3, Math.floor(owned / 3));
  const continents = CONTINENT_IDS
    .filter((c) => CONTINENTS[c].territories.every((t) => s.territories[t].owner === player))
    .map((c) => ({ continent: c, bonus: CONTINENTS[c].bonus }));
  return { territories, continents, total: territories + continents.reduce((n, c) => n + c.bonus, 0) };
}

/** Armies the next traded set is worth. */
export function nextSetValue(s: GameState): number { return setValue(s.settings.cardProgression, s.setsTraded); }

/** True if the three cards form a valid set. */
export function isValidSet(s: GameState, cards: string[]): boolean {
  if (!Array.isArray(cards) || cards.length !== 3 || new Set(cards).size !== 3) return false;
  if (!cards.every((id) => has(s.cards, id))) return false;
  return isSetOf(cards.map((id) => s.cards[id]));
}

/** All valid 3-card sets in a player's hand. */
export function findSets(s: GameState, player: PlayerId): [string, string, string][] {
  const hand = playerById(s, player)?.cards ?? [];
  const out: [string, string, string][] = [];
  for (let i = 0; i < hand.length; i++)
    for (let j = i + 1; j < hand.length; j++)
      for (let k = j + 1; k < hand.length; k++)
        if (isSetOf([s.cards[hand[i]], s.cards[hand[j]], s.cards[hand[k]]])) out.push([hand[i], hand[j], hand[k]]);
  return out;
}

/** Territories the current player may attack from (owned, ≥2 armies, has an enemy neighbour). */
export function attackSources(s: GameState): TerritoryId[] {
  const me = currentPlayerId(s);
  return TERRITORY_IDS.filter((t) => s.territories[t].owner === me && s.territories[t].armies >= 2 && attackTargets(s, t).length > 0);
}

/** Enemy neighbours of `from`. */
export function attackTargets(s: GameState, from: TerritoryId): TerritoryId[] {
  const owner = s.territories[from]?.owner;
  if (!owner) return [];
  return ADJACENT[from].filter((n) => s.territories[n].owner !== null && s.territories[n].owner !== owner);
}

/** Max attacker dice from `from` (min(3, armies-1)). */
export function maxAttackDice(s: GameState, from: TerritoryId): number {
  const t = s.territories[from];
  if (!t) return 0;
  return Math.max(0, Math.min(3, t.armies - 1));
}

/** Territories the current player may fortify into from `from` (respects settings.fortify). */
export function fortifyTargets(s: GameState, from: TerritoryId): TerritoryId[] {
  const me = currentPlayerId(s);
  if (!s.territories[from] || s.territories[from].owner !== me) return [];
  if (s.settings.fortify === 'adjacent') return ADJACENT[from].filter((n) => s.territories[n].owner === me);
  const seen = new Set<TerritoryId>([from]);
  const queue: TerritoryId[] = [from];
  while (queue.length) {
    const t = queue.shift()!;
    for (const n of ADJACENT[t]) {
      if (!seen.has(n) && s.territories[n].owner === me) { seen.add(n); queue.push(n); }
    }
  }
  seen.delete(from);
  return TERRITORY_IDS.filter((t) => seen.has(t));
}

/** Territories a player may legally act on right now for placement (claim / setup / reinforce). */
export function placementTargets(s: GameState): TerritoryId[] {
  const me = currentPlayerId(s);
  switch (s.phase) {
    case 'setupClaim':
      return TERRITORY_IDS.filter((t) => s.territories[t].owner === null);
    case 'setupReinforce': {
      const owner = s.setupStep && s.setupStep.own === 0 && s.setupStep.neutral > 0 ? NEUTRAL : me;
      return TERRITORY_IDS.filter((t) => s.territories[t].owner === owner);
    }
    case 'reinforce':
      return ownedBy(s, me);
    case 'attack':
      return s.reinforcements > 0 ? ownedBy(s, me) : [];
    default:
      return [];
  }
}

const sampleCounts = (min: number, max: number): number[] =>
  [...new Set([min, Math.max(min, Math.ceil(max / 2)), max])].filter((n) => n >= min && n <= max);

/**
 * Every action the actor could legally send now (used by the bot and tests).
 * Army counts are sampled (1 / half / all). `resign` is always legal outside setup but is
 * deliberately not listed, so random players built on this never give up.
 */
export function legalActions(s: GameState, actor: PlayerId): Action[] {
  if (s.phase === 'gameOver' || actor !== currentPlayerId(s)) return [];
  const me = s.players[s.current];
  const out: Action[] = [];
  const trades = () => findSets(s, me.id).forEach((c) => out.push({ type: 'tradeCards', cards: c }));
  const placements = () => {
    for (const t of placementTargets(s)) for (const n of sampleCounts(1, s.reinforcements)) out.push({ type: 'placeReinforcements', territory: t, count: n });
  };

  switch (s.phase) {
    case 'setupClaim':
      for (const t of placementTargets(s)) out.push({ type: 'claim', territory: t });
      break;
    case 'setupReinforce':
      for (const t of placementTargets(s)) out.push({ type: 'placeSetup', territory: t });
      break;
    case 'reinforce':
      trades();
      if (!s.mustTrade) placements();
      break;
    case 'occupy':
      if (s.pendingOccupy) for (const n of sampleCounts(s.pendingOccupy.min, s.pendingOccupy.max)) out.push({ type: 'occupy', count: n });
      break;
    case 'attack':
      if (s.mustTrade) { trades(); break; }
      if (s.reinforcements > 0) { placements(); break; }
      for (const from of attackSources(s)) {
        const max = maxAttackDice(s, from);
        for (const to of attackTargets(s, from)) {
          for (let d = 1; d <= max; d++) out.push({ type: 'attack', from, to, dice: d as 1 | 2 | 3 });
          out.push({ type: 'attack', from, to, dice: max as 1 | 2 | 3, blitz: true });
        }
      }
      out.push({ type: 'endAttack' });
      out.push({ type: 'endTurn' });
      break;
    case 'fortify':
      for (const from of ownedBy(s, me.id)) {
        const max = s.territories[from].armies - 1;
        if (max < 1) continue;
        for (const to of fortifyTargets(s, from)) for (const n of sampleCounts(1, max)) out.push({ type: 'fortify', from, to, count: n });
      }
      out.push({ type: 'endTurn' });
      break;
  }
  return out;
}
