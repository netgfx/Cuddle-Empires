import { describe, expect, it } from 'vitest';
import {
  attackSources, attackTargets, createGame, currentPlayerId, findSets, fortifyTargets, isValidSet, legalActions,
  maxAttackDice, nextSetValue, placementTargets, reduce, reinforcementsFor,
} from './engine';
import { CONTINENTS, TERRITORY_IDS } from './mapData';
import { cardIdFor, setValue, TOTAL_CARDS } from './cards';
import { mulberry32 } from './rng';
import type { GameEvent, GameState, TerritoryId } from './types';
import { NEUTRAL } from './types';
import { act, checkInvariants, findRng, giveCards, newPlayers, ok, scenario } from './testUtils';

const armiesOf = (s: GameState, id: string) => TERRITORY_IDS.filter((t) => s.territories[t].owner === id).reduce((n, t) => n + s.territories[t].armies, 0);
const countOf = (s: GameState, id: string) => TERRITORY_IDS.filter((t) => s.territories[t].owner === id).length;
const types = (ev: GameEvent[]) => ev.map((e) => e.type);

describe('rng', () => {
  it('mulberry32 is deterministic and in [0,1)', () => {
    let st = 123;
    const a: number[] = [];
    for (let i = 0; i < 1000; i++) { const r = mulberry32(st); st = r.state; a.push(r.value); }
    expect(a.every((x) => x >= 0 && x < 1)).toBe(true);
    let st2 = 123;
    expect(mulberry32(st2).value).toBe(a[0]);
    st2 = mulberry32(st2).state;
    expect(mulberry32(st2).value).toBe(a[1]);
  });
});

describe('createGame', () => {
  const START: Record<number, number> = { 2: 40, 3: 35, 4: 30, 5: 25, 6: 20 };

  for (let n = 2; n <= 6; n++) {
    it(`${n} players · auto setup`, () => {
      const s = createGame(newPlayers(n), {}, 99 + n);
      const real = s.players.filter((p) => !p.isNeutral);
      expect(real.map((p) => p.id).sort()).toEqual(Array.from({ length: n }, (_, i) => `p${i + 1}`).sort());
      expect(s.players.length).toBe(n === 2 ? 3 : n);
      if (n === 2) {
        const neu = s.players.find((p) => p.id === NEUTRAL)!;
        expect(neu).toMatchObject({ isNeutral: true, color: '#A0A4A8', kind: 'bot', eliminated: false });
        expect(countOf(s, NEUTRAL)).toBe(14);
        expect(armiesOf(s, NEUTRAL)).toBe(40);
      }
      for (const p of s.players) {
        expect(armiesOf(s, p.id)).toBe(START[n]);
        expect(s.setupPool[p.id]).toBe(0);
      }
      expect(TERRITORY_IDS.every((t) => s.territories[t].owner !== null && s.territories[t].armies >= 1)).toBe(true);
      expect(s.phase).toBe('reinforce');
      expect(s.current).toBe(0);
      expect(s.turn).toBe(1);
      expect(s.reinforcements).toBe(reinforcementsFor(s, s.players[0].id).total);
      expect(s.deck.length).toBe(TOTAL_CARDS);
      expect(new Set(s.deck).size).toBe(44);
      expect(checkInvariants(s)).toBeNull();
    });

    it(`${n} players · manual pools`, () => {
      const s = createGame(newPlayers(n), { setup: 'manual' }, 5);
      if (n === 2) {
        expect(s.phase).toBe('setupReinforce');
        for (const p of s.players) { expect(countOf(s, p.id)).toBe(14); expect(s.setupPool[p.id]).toBe(26); }
      } else {
        expect(s.phase).toBe('setupClaim');
        for (const p of s.players) expect(s.setupPool[p.id]).toBe(START[n]);
        expect(placementTargets(s).length).toBe(42);
      }
    });
  }

  it('keeps given ids, rejects bad player counts, random first player', () => {
    const s = createGame([{ id: 'a', name: 'A', color: '#000000', kind: 'human' }, { name: 'B', color: '#111111', kind: 'bot' }, { name: 'C', color: '#222222', kind: 'bot' }], {}, 1);
    expect(s.players.map((p) => p.id).sort()).toEqual(['a', 'p2', 'p3']);
    expect(() => createGame(newPlayers(1))).toThrow();
    expect(() => createGame(newPlayers(7))).toThrow();
    const firsts = new Set(Array.from({ length: 30 }, (_, i) => createGame(newPlayers(4), {}, i).players[0].id));
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('same seed → same game; different seed → different game', () => {
    expect(createGame(newPlayers(4), {}, 7)).toEqual(createGame(newPlayers(4), {}, 7));
    expect(createGame(newPlayers(4), {}, 7).territories).not.toEqual(createGame(newPlayers(4), {}, 8).territories);
  });
});

describe('manual setup', () => {
  it('claim → setupReinforce → first turn (3 players)', () => {
    let s = createGame(newPlayers(3), { setup: 'manual' }, 11);
    const order = s.players.map((p) => p.id);
    const claimers: string[] = [];
    for (let i = 0; i < 42; i++) {
      expect(s.phase).toBe('setupClaim');
      claimers.push(currentPlayerId(s));
      const t = placementTargets(s)[0];
      const r = reduce(s, { type: 'claim', territory: t }, currentPlayerId(s));
      s = ok(r);
      if (i < 41) expect(types(r.ok ? r.events : [])).toEqual(['claimed']);
    }
    expect(claimers.slice(0, 6)).toEqual([...order, ...order]);
    expect(s.phase).toBe('setupReinforce');
    for (const p of s.players) expect(countOf(s, p.id)).toBe(14);
    // claiming again is illegal
    expect(reduce(s, { type: 'claim', territory: 'Alaska' }, currentPlayerId(s)).ok).toBe(false);
    let guard = 0;
    while (s.phase === 'setupReinforce') {
      const me = currentPlayerId(s);
      const targets = placementTargets(s);
      expect(targets.every((t) => s.territories[t].owner === me)).toBe(true);
      const foreign = TERRITORY_IDS.find((t) => s.territories[t].owner !== me)!;
      expect(reduce(s, { type: 'placeSetup', territory: foreign }, me).ok).toBe(false);
      s = act(s, { type: 'placeSetup', territory: targets[0] });
      if (++guard > 200) throw new Error('setup did not finish');
    }
    expect(s.phase).toBe('reinforce');
    expect(s.current).toBe(0);
    expect(currentPlayerId(s)).toBe(claimers[0]);
    for (const p of s.players) { expect(armiesOf(s, p.id)).toBe(35); expect(s.setupPool[p.id]).toBe(0); }
    expect(checkInvariants(s)).toBeNull();
  });

  it('claim rejects taken territories', () => {
    let s = createGame(newPlayers(4), { setup: 'manual' }, 3);
    s = act(s, { type: 'claim', territory: 'Alaska' });
    const r = reduce(s, { type: 'claim', territory: 'Alaska' }, currentPlayerId(s));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/already claimed/);
  });

  it('2-player setupStep: 2 own armies then 1 neutral, until pools are empty', () => {
    let s = createGame(newPlayers(2), { setup: 'manual' }, 21);
    expect(s.deck.length).toBe(44);
    expect(s.deck.filter((c) => c.startsWith('wild')).length).toBe(2);
    expect(s.setupStep).toEqual({ own: 2, neutral: 1 });
    const first = currentPlayerId(s);
    const own = () => TERRITORY_IDS.find((t) => s.territories[t].owner === currentPlayerId(s))!;
    const neutral = () => TERRITORY_IDS.find((t) => s.territories[t].owner === NEUTRAL)!;
    expect(reduce(s, { type: 'placeSetup', territory: neutral() }, first).ok).toBe(false);
    s = act(s, { type: 'placeSetup', territory: own() });
    expect(s.setupStep).toEqual({ own: 1, neutral: 1 });
    s = act(s, { type: 'placeSetup', territory: own() });
    expect(s.setupStep).toEqual({ own: 0, neutral: 1 });
    expect(placementTargets(s).every((t) => s.territories[t].owner === NEUTRAL)).toBe(true);
    expect(reduce(s, { type: 'placeSetup', territory: own() }, first).ok).toBe(false);
    s = act(s, { type: 'placeSetup', territory: neutral() });
    expect(currentPlayerId(s)).not.toBe(first);
    expect(s.setupStep).toEqual({ own: 2, neutral: 1 });
    let guard = 0;
    while (s.phase === 'setupReinforce') {
      s = act(s, { type: 'placeSetup', territory: placementTargets(s)[0] });
      if (++guard > 200) throw new Error('setup did not finish');
    }
    expect(s.phase).toBe('reinforce');
    expect(currentPlayerId(s)).toBe(first);
    for (const p of s.players) expect(armiesOf(s, p.id)).toBe(40);
    expect(checkInvariants(s)).toBeNull();
  });
});

describe('reinforcements', () => {
  it('max(3, floor(owned/3)) + continent bonuses', () => {
    const owners: Partial<Record<TerritoryId, ['p1', number]>> = {};
    const s1 = scenario({ owners });
    expect(reinforcementsFor(s1, 'p1')).toEqual({ territories: 3, continents: [], total: 3 });
    // 11 territories, no full continent → 3
    const some = TERRITORY_IDS.filter((_, i) => i % 4 === 0).slice(0, 11);
    const s2 = scenario({ owners: Object.fromEntries(some.map((t) => [t, ['p1', 1]])) });
    expect(reinforcementsFor(s2, 'p1').total).toBe(3);
    // Australia (4) + South America (4) + 4 more = 12 → 4 + 2 + 2
    const ts = [...CONTINENTS.Australia.territories, ...CONTINENTS.SouthAmerica.territories, 'Alaska', 'Egypt', 'Ural', 'Japan'] as TerritoryId[];
    const s3 = scenario({ owners: Object.fromEntries(ts.map((t) => [t, ['p1', 1]])) });
    const br = reinforcementsFor(s3, 'p1');
    expect(br.territories).toBe(4);
    expect(br.continents.map((c) => c.continent).sort()).toEqual(['Australia', 'SouthAmerica']);
    expect(br.total).toBe(8);
    // Asia alone: 12 → 4 + 7
    const s4 = scenario({ owners: Object.fromEntries(CONTINENTS.Asia.territories.map((t) => [t, ['p1', 1]])) });
    expect(reinforcementsFor(s4, 'p1').total).toBe(11);
  });

  it('turn start emits turnStarted with the breakdown and places by count', () => {
    const s = scenario({ owners: Object.fromEntries(CONTINENTS.Australia.territories.map((t) => [t, ['p1', 1]])), phase: 'fortify', current: 'p3' });
    const r = reduce(s, { type: 'endTurn' }, 'p3');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const next = r.state;
    const started = r.events.find((e) => e.type === 'turnStarted');
    expect(started).toBeTruthy();
    const me = currentPlayerId(next);
    expect(next.reinforcements).toBe(reinforcementsFor(next, me).total);
  });

  it('placeReinforcements validation and transition to attack', () => {
    let s = scenario({ owners: { Alaska: ['p1', 1], Kamchatka: ['p1', 1] }, phase: 'reinforce' });
    s.reinforcements = 3;
    expect(reduce(s, { type: 'placeReinforcements', territory: 'Ontario', count: 1 }, 'p1').ok).toBe(false);
    expect(reduce(s, { type: 'placeReinforcements', territory: 'Alaska', count: 4 }, 'p1').ok).toBe(false);
    expect(reduce(s, { type: 'placeReinforcements', territory: 'Alaska', count: 0 }, 'p1').ok).toBe(false);
    expect(reduce(s, { type: 'placeReinforcements', territory: 'Alaska', count: 1.5 }, 'p1').ok).toBe(false);
    s = act(s, { type: 'placeReinforcements', territory: 'Alaska', count: 2 });
    expect(s.phase).toBe('reinforce');
    const r = reduce(s, { type: 'placeReinforcements', territory: 'Kamchatka', count: 1 }, 'p1');
    expect(r.ok && types(r.events)).toEqual(['armiesPlaced', 'phaseChanged']);
    s = ok(r);
    expect(s.phase).toBe('attack');
    expect(s.territories.Alaska.armies).toBe(3);
    expect(s.territories.Kamchatka.armies).toBe(2);
  });
});

describe('cards', () => {
  const s = scenario({});
  const inf = ['Alaska', 'Ontario', 'EasternUS'].map((t) => cardIdFor(t as TerritoryId)); // infantry
  const mixed = [cardIdFor('Alaska'), cardIdFor('NorthwestTerritory'), cardIdFor('Alberta')]; // inf, cav, art
  it('set validity', () => {
    expect(isValidSet(s, inf)).toBe(true);
    expect(isValidSet(s, mixed)).toBe(true);
    expect(isValidSet(s, [cardIdFor('Alaska'), cardIdFor('Ontario'), 'wild-1'])).toBe(true);
    expect(isValidSet(s, [cardIdFor('Alaska'), cardIdFor('Alberta'), 'wild-2'])).toBe(true);
    expect(isValidSet(s, [cardIdFor('Alaska'), 'wild-1', 'wild-2'])).toBe(true);
    expect(isValidSet(s, [cardIdFor('Alaska'), cardIdFor('Ontario'), cardIdFor('Alberta')])).toBe(false);
    expect(isValidSet(s, [cardIdFor('Alaska'), cardIdFor('Alaska'), cardIdFor('Ontario')])).toBe(false);
    expect(isValidSet(s, [cardIdFor('Alaska'), cardIdFor('Ontario')])).toBe(false);
    expect(isValidSet(s, ['nope', cardIdFor('Alaska'), cardIdFor('Ontario')])).toBe(false);
  });

  it('classic and expert progression incl. 7th/8th set', () => {
    expect(Array.from({ length: 9 }, (_, i) => setValue('classic', i))).toEqual([4, 6, 8, 10, 12, 15, 20, 25, 30]);
    expect(Array.from({ length: 9 }, (_, i) => setValue('expert', i))).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const x = scenario({ settings: { cardProgression: 'expert' } });
    x.setsTraded = 7;
    expect(nextSetValue(x)).toBe(11);
    const c = scenario({});
    c.setsTraded = 7;
    expect(nextSetValue(c)).toBe(25);
  });

  it('trading adds armies, discards cards, advances the counter; findSets', () => {
    let st = scenario({ phase: 'reinforce' });
    st.reinforcements = 3;
    st.setsTraded = 6;
    giveCards(st, 'p1', inf);
    expect(findSets(st, 'p1')).toEqual([inf]);
    const r = reduce(st, { type: 'tradeCards', cards: inf as [string, string, string] }, 'p1');
    st = ok(r);
    expect(st.reinforcements).toBe(23);
    expect(st.setsTraded).toBe(7);
    expect(st.discard).toEqual(expect.arrayContaining(inf));
    expect(st.players.find((p) => p.id === 'p1')!.cards).toEqual([]);
    expect(r.ok && r.events[0]).toMatchObject({ type: 'cardsTraded', armies: 20, bonusTerritory: null });
    expect(checkInvariants(st)).toBeNull();
  });

  it('rejects non-sets, foreign cards and trades outside reinforce', () => {
    const st = scenario({ phase: 'reinforce' });
    st.reinforcements = 3;
    giveCards(st, 'p1', [cardIdFor('Alaska'), cardIdFor('Ontario'), cardIdFor('Alberta')]);
    giveCards(st, 'p2', inf.slice(1));
    expect(reduce(st, { type: 'tradeCards', cards: [cardIdFor('Alaska'), cardIdFor('Ontario'), cardIdFor('Alberta')] }, 'p1').ok).toBe(false);
    expect(reduce(st, { type: 'tradeCards', cards: [cardIdFor('Alaska'), inf[1], inf[2]] }, 'p1').ok).toBe(false);
    const atk = { ...st, phase: 'attack' as const, reinforcements: 0 };
    giveCards(atk, 'p1', ['wild-1']);
    expect(reduce(atk, { type: 'tradeCards', cards: [cardIdFor('Alaska'), cardIdFor('Ontario'), 'wild-1'] }, 'p1').ok).toBe(false);
  });

  it('+2 territory bonus only once per turn', () => {
    let st = scenario({ owners: { Alaska: ['p1', 1], Ontario: ['p1', 1], Quebec: ['p1', 1] }, phase: 'reinforce' });
    st.reinforcements = 3;
    const set1 = [cardIdFor('Alaska'), cardIdFor('Ontario'), cardIdFor('EasternUS')] as [string, string, string]; // 3 infantry
    const set2 = [cardIdFor('Quebec'), cardIdFor('NorthwestTerritory'), cardIdFor('CentralAmerica')] as [string, string, string]; // 3 cavalry
    giveCards(st, 'p1', [...set1, ...set2]);
    const r1 = reduce(st, { type: 'tradeCards', cards: set1 }, 'p1');
    expect(r1.ok && types(r1.events)).toEqual(['cardsTraded', 'armiesPlaced']);
    expect(r1.ok && r1.events[0]).toMatchObject({ bonusTerritory: 'Alaska' });
    st = ok(r1);
    expect(st.territories.Alaska.armies).toBe(3);
    expect(st.territoryBonusUsed).toBe(true);
    const r2 = reduce(st, { type: 'tradeCards', cards: set2 }, 'p1');
    expect(r2.ok && types(r2.events)).toEqual(['cardsTraded']);
    st = ok(r2);
    expect(st.territories.Quebec.armies).toBe(1);
    expect(st.reinforcements).toBe(3 + 4 + 6);
  });

  it('mustTrade at 5 cards at turn start', () => {
    const s0 = scenario({ owners: { Alaska: ['p1', 1] }, phase: 'fortify' });
    // make p1 the next player: end the turn of the player before p1
    const idx = s0.players.findIndex((p) => p.id === 'p1');
    const prev = s0.players[(idx + s0.players.length - 1) % s0.players.length].id;
    s0.current = s0.players.findIndex((p) => p.id === prev);
    const five = [cardIdFor('Alaska'), cardIdFor('Ontario'), cardIdFor('EasternUS'), cardIdFor('Quebec'), cardIdFor('Peru')];
    giveCards(s0, 'p1', five);
    let s = act(s0, { type: 'endTurn' });
    expect(currentPlayerId(s)).toBe('p1');
    expect(s.mustTrade).toBe(true);
    expect(legalActions(s, 'p1').every((a) => a.type === 'tradeCards')).toBe(true);
    const r = reduce(s, { type: 'placeReinforcements', territory: 'Alaska', count: 1 }, 'p1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/must trade/);
    s = act(s, { type: 'tradeCards', cards: [cardIdFor('Alaska'), cardIdFor('Ontario'), cardIdFor('EasternUS')] });
    expect(s.mustTrade).toBe(false);
    expect(s.reinforcements).toBe(3 + 4);
    // 4 cards: no forced trade
    const s1 = scenario({ phase: 'fortify', current: prev });
    giveCards(s1, 'p1', five.slice(0, 4));
    expect(act(s1, { type: 'endTurn' }).mustTrade).toBe(false);
  });
});

describe('attack', () => {
  const base = () => scenario({ owners: { Alaska: ['p1', 4], Kamchatka: ['p2', 3], Alberta: ['p1', 1] }, fallback: 'p3' });

  it('validates source, target, dice and phase', () => {
    const s = base();
    const bad = (a: Parameters<typeof reduce>[1], re: RegExp) => {
      const r = reduce(s, a, 'p1');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(re);
    };
    bad({ type: 'attack', from: 'Alberta', to: 'Ontario', dice: 1 }, /at least 2/);
    bad({ type: 'attack', from: 'Alaska', to: 'Alberta', dice: 1 }, /own territory/);
    bad({ type: 'attack', from: 'Alaska', to: 'Japan', dice: 1 }, /does not border/);
    bad({ type: 'attack', from: 'Kamchatka', to: 'Alaska', dice: 1 }, /your own territory/);
    const s2 = { ...s, territories: { ...s.territories, Alaska: { owner: 'p1', armies: 3 } } };
    const r = reduce(s2, { type: 'attack', from: 'Alaska', to: 'Kamchatka', dice: 3 }, 'p1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/1 to 2 dice/);
    expect(reduce({ ...s, phase: 'fortify' }, { type: 'attack', from: 'Alaska', to: 'Kamchatka', dice: 1 }, 'p1').ok).toBe(false);
    expect(reduce({ ...s, reinforcements: 2 }, { type: 'attack', from: 'Alaska', to: 'Kamchatka', dice: 1 }, 'p1').ok).toBe(false);
    expect(reduce(s, { type: 'attack', from: 'Alaska', to: 'Kamchatka', dice: 1 }, 'p2').ok).toBe(false);
    expect(maxAttackDice(s, 'Alaska')).toBe(3);
    expect(maxAttackDice(s, 'Alberta')).toBe(0);
    expect(attackSources(s)).toEqual(['Alaska']);
    expect(attackTargets(s, 'Alaska').sort()).toEqual(['Kamchatka', 'NorthwestTerritory']);
  });

  it('dice comparison: sorted, pairwise, ties to the defender, max 2 losses', () => {
    let s = base();
    let sawTie = false;
    for (let seed = 1; seed <= 400; seed++) {
      s = { ...base(), rng: seed };
      const dice = ((seed % 3) + 1) as 1 | 2 | 3;
      const r = reduce(s, { type: 'attack', from: 'Alaska', to: 'Kamchatka', dice }, 'p1');
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      const roll = r.state.lastBattle!;
      expect(roll.attackerDice.length).toBe(dice);
      expect(roll.defenderDice.length).toBe(2);
      expect([...roll.attackerDice].sort((a, b) => b - a)).toEqual(roll.attackerDice);
      expect([...roll.defenderDice].sort((a, b) => b - a)).toEqual(roll.defenderDice);
      let al = 0, dl = 0;
      for (let i = 0; i < Math.min(dice, 2); i++) {
        if (roll.attackerDice[i] > roll.defenderDice[i]) dl++; else al++;
        if (roll.attackerDice[i] === roll.defenderDice[i]) sawTie = true;
      }
      expect(roll.attackerLosses).toBe(al);
      expect(roll.defenderLosses).toBe(dl);
      expect(al + dl).toBe(Math.min(dice, 2));
      expect(al).toBeLessThanOrEqual(2);
      expect(r.state.territories.Alaska.armies).toBe(4 - al);
      expect(r.state.territories.Kamchatka.armies).toBe(3 - dl);
      expect(r.events.filter((e) => e.type === 'battle').length).toBe(1);
    }
    expect(sawTie).toBe(true);
  });

  it('defender with 1 army rolls 1 die', () => {
    const s = scenario({ owners: { Alaska: ['p1', 4], Kamchatka: ['p2', 1] }, fallback: 'p3' });
    const r = ok(reduce(s, { type: 'attack', from: 'Alaska', to: 'Kamchatka', dice: 3 }, 'p1'));
    expect(r.lastBattle!.defenderDice.length).toBe(1);
  });

  it('blitz rolls until capture or the attacker is down to 1', () => {
    const s = scenario({ owners: { Alaska: ['p1', 30], Kamchatka: ['p2', 5] }, fallback: 'p3' });
    const r = reduce(s, { type: 'attack', from: 'Alaska', to: 'Kamchatka', dice: 3, blitz: true }, 'p1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const battles = r.events.filter((e) => e.type === 'battle');
    expect(battles.length).toBeGreaterThan(1);
    expect(r.events.some((e) => e.type === 'conquered')).toBe(true);
    expect(r.state.territories.Kamchatka.owner).toBe('p1');

    const weak = scenario({ owners: { Alaska: ['p1', 3], Kamchatka: ['p2', 40] }, fallback: 'p3' });
    const w = ok(reduce(weak, { type: 'attack', from: 'Alaska', to: 'Kamchatka', dice: 2, blitz: true }, 'p1'));
    expect(w.territories.Alaska.armies).toBe(1);
    expect(w.territories.Kamchatka.owner).toBe('p2');
    expect(w.phase).toBe('attack');
  });

  it('capture → occupy between min (dice) and max (armies-1)', () => {
    const s0 = scenario({ owners: { Alaska: ['p1', 10], Kamchatka: ['p2', 1] }, fallback: 'p2' });
    const a = { type: 'attack' as const, from: 'Alaska' as const, to: 'Kamchatka' as const, dice: 3 as const };
    const s = findRng(s0, a, (r) => r.state.territories.Kamchatka.owner === 'p1');
    const r = reduce(s, a, 'p1');
    expect(r.ok && types(r.events)).toEqual(['battle', 'conquered', 'phaseChanged']);
    let st = ok(r);
    expect(st.phase).toBe('occupy');
    expect(st.pendingOccupy).toEqual({ from: 'Alaska', to: 'Kamchatka', min: 3, max: 9 });
    expect(st.conqueredThisTurn).toBe(true);
    expect(reduce(st, { type: 'occupy', count: 2 }, 'p1').ok).toBe(false);
    expect(reduce(st, { type: 'occupy', count: 10 }, 'p1').ok).toBe(false);
    expect(reduce(st, a, 'p1').ok).toBe(false);
    expect(reduce(st, { type: 'endAttack' }, 'p1').ok).toBe(false);
    expect(legalActions(st, 'p1').map((x) => x.type === 'occupy' && x.count)).toEqual([3, 5, 9]);
    st = act(st, { type: 'occupy', count: 5 });
    expect(st.phase).toBe('attack');
    expect(st.territories.Alaska.armies).toBe(5);
    expect(st.territories.Kamchatka.armies).toBe(5);
    expect(st.pendingOccupy).toBeNull();
  });

  it('auto-occupies when min === max', () => {
    const s0 = scenario({ owners: { Alaska: ['p1', 3], Kamchatka: ['p2', 1] }, fallback: 'p2' });
    const a = { type: 'attack' as const, from: 'Alaska' as const, to: 'Kamchatka' as const, dice: 2 as const };
    const s = findRng(s0, a, (r) => r.state.territories.Kamchatka.owner === 'p1');
    const r = reduce(s, a, 'p1');
    expect(r.ok && types(r.events)).toEqual(['battle', 'conquered', 'armiesMoved']);
    const st = ok(r);
    expect(st.phase).toBe('attack');
    expect(st.pendingOccupy).toBeNull();
    expect(st.territories.Kamchatka.armies).toBe(2);
    expect(st.territories.Alaska.armies).toBe(1);
  });

  it('elimination transfers cards and forces a trade at 6+', () => {
    const s0 = scenario({ players: 4, owners: { Alaska: ['p1', 10], Kamchatka: ['p3', 1] }, fallback: 'p2' });
    giveCards(s0, 'p1', [cardIdFor('Alaska'), cardIdFor('Ontario')]);
    const theirs = [cardIdFor('EasternUS'), cardIdFor('Peru'), cardIdFor('Brazil'), 'wild-1'];
    giveCards(s0, 'p3', theirs);
    const a = { type: 'attack' as const, from: 'Alaska' as const, to: 'Kamchatka' as const, dice: 3 as const };
    const s = findRng(s0, a, (r) => r.state.territories.Kamchatka.owner === 'p1');
    const r = reduce(s, a, 'p1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const elim = r.events.find((e) => e.type === 'eliminated');
    expect(elim).toEqual({ type: 'eliminated', player: 'p3', by: 'p1', cardsTaken: theirs });
    let st = r.state;
    expect(st.players.find((p) => p.id === 'p3')!.eliminated).toBe(true);
    expect(st.players.find((p) => p.id === 'p1')!.cards.length).toBe(6);
    expect(st.mustTrade).toBe(true);
    expect(st.phase).toBe('occupy');
    // occupy is still allowed, trading is not until occupied
    expect(reduce(st, { type: 'tradeCards', cards: [cardIdFor('Alaska'), cardIdFor('Ontario'), cardIdFor('EasternUS')] }, 'p1').ok).toBe(false);
    st = act(st, { type: 'occupy', count: 3 });
    expect(reduce(st, { type: 'attack', from: 'Kamchatka', to: 'Japan', dice: 1 }, 'p1').ok).toBe(false);
    expect(reduce(st, { type: 'endAttack' }, 'p1').ok).toBe(false);
    st = act(st, { type: 'tradeCards', cards: [cardIdFor('Alaska'), cardIdFor('Ontario'), cardIdFor('EasternUS')] }); // 3 infantry
    expect(st.mustTrade).toBe(false); // 3 cards left
    expect(st.reinforcements).toBe(4);
    expect(st.phase).toBe('attack');
    expect(placementTargets(st)).toContain('Alaska');
    // further trades are not allowed now (only forced ones)
    expect(reduce(st, { type: 'tradeCards', cards: [cardIdFor('Peru'), cardIdFor('Brazil'), 'wild-1'] }, 'p1').ok).toBe(false);
    expect(reduce(st, { type: 'attack', from: 'Alaska', to: 'NorthwestTerritory', dice: 3 }, 'p1').ok).toBe(false);
    st = act(st, { type: 'placeReinforcements', territory: 'Alaska', count: 4 });
    expect(st.reinforcements).toBe(0);
    expect(st.phase).toBe('attack');
    expect(reduce(st, { type: 'attack', from: 'Alaska', to: 'NorthwestTerritory', dice: 3 }, 'p1').ok).toBe(true);
    expect(checkInvariants(st)).toBeNull();
  });

  it('eliminating the last opponent wins', () => {
    const s0 = scenario({ players: 3, owners: { Alaska: ['p1', 10], Kamchatka: ['p3', 1] }, fallback: 'p1' });
    s0.players.find((p) => p.id === 'p2')!.eliminated = true;
    const a = { type: 'attack' as const, from: 'Alaska' as const, to: 'Kamchatka' as const, dice: 3 as const };
    const s = findRng(s0, a, (r) => r.state.territories.Kamchatka.owner === 'p1');
    const r = reduce(s, a, 'p1');
    expect(r.ok && types(r.events).slice(-2)).toEqual(['phaseChanged', 'gameOver']);
    const st = ok(r);
    expect(st.phase).toBe('gameOver');
    expect(st.winner).toBe('p1');
    expect(st.territories.Kamchatka.armies).toBeGreaterThan(0);
    expect(reduce(st, { type: 'endTurn' }, 'p1').ok).toBe(false);
    expect(legalActions(st, 'p1')).toEqual([]);
  });

  it('2-player: the neutral is attackable but never eliminated; beating the opponent wins', () => {
    const s0 = createGame(newPlayers(2), {}, 4);
    const me = currentPlayerId(s0);
    const opp = s0.players.find((p) => !p.isNeutral && p.id !== me)!.id;
    for (const t of TERRITORY_IDS) s0.territories[t] = { owner: NEUTRAL, armies: 1 };
    s0.territories.Alaska = { owner: me, armies: 10 };
    s0.territories.Kamchatka = { owner: NEUTRAL, armies: 1 };
    s0.territories.Alberta = { owner: opp, armies: 1 };
    s0.phase = 'attack'; s0.reinforcements = 0;
    const a = { type: 'attack' as const, from: 'Alaska' as const, to: 'Kamchatka' as const, dice: 3 as const };
    let st = ok(reduce(findRng(s0, a, (r) => r.state.territories.Kamchatka.owner === me), a, me));
    expect(st.players.find((p) => p.id === NEUTRAL)!.eliminated).toBe(false);
    st = act(st, { type: 'occupy', count: 3 });
    const b = { type: 'attack' as const, from: 'Alaska' as const, to: 'Alberta' as const, dice: 3 as const };
    st = ok(reduce(findRng(st, b, (r) => r.state.territories.Alberta.owner === me), b, me));
    expect(st.phase).toBe('gameOver');
    expect(st.winner).toBe(me);
  });
});

describe('end of attack, fortify, turn order', () => {
  it('endAttack draws one card only if a territory was conquered', () => {
    const s = scenario({ owners: { Alaska: ['p1', 3] } });
    const top = s.deck[s.deck.length - 1];
    const r1 = reduce(s, { type: 'endAttack' }, 'p1');
    expect(r1.ok && types(r1.events)).toEqual(['phaseChanged']);
    expect(ok(r1).phase).toBe('fortify');
    const r2 = reduce({ ...s, conqueredThisTurn: true }, { type: 'endAttack' }, 'p1');
    expect(r2.ok && r2.events[0]).toEqual({ type: 'cardDrawn', player: 'p1', card: top });
    const st = ok(r2);
    expect(st.players.find((p) => p.id === 'p1')!.cards).toEqual([top]);
    expect(st.deck.length).toBe(43);
  });

  it('empty deck reshuffles the discard; both empty draws nothing', () => {
    const s = scenario({ owners: { Alaska: ['p1', 3] } });
    s.conqueredThisTurn = true;
    s.discard = [...s.deck];
    s.deck = [];
    const st = act(s, { type: 'endAttack' });
    expect(st.players.find((p) => p.id === 'p1')!.cards.length).toBe(1);
    expect(st.deck.length).toBe(43);
    expect(st.discard.length).toBe(0);
    const e = scenario({ owners: { Alaska: ['p1', 3] } });
    e.conqueredThisTurn = true;
    e.players.find((p) => p.id === 'p2')!.cards = [...e.deck];
    e.deck = [];
    const r = reduce(e, { type: 'endAttack' }, 'p1');
    expect(r.ok && types(r.events)).toEqual(['phaseChanged']);
  });

  it('fortify adjacent vs connected', () => {
    const owners = { Alaska: ['p1', 5], NorthwestTerritory: ['p1', 1], Greenland: ['p1', 1], Alberta: ['p2', 1] } as const;
    const adj = scenario({ owners: owners as never, phase: 'fortify' });
    expect(fortifyTargets(adj, 'Alaska')).toEqual(['NorthwestTerritory']);
    expect(reduce(adj, { type: 'fortify', from: 'Alaska', to: 'Greenland', count: 2 }, 'p1').ok).toBe(false);
    expect(reduce(adj, { type: 'fortify', from: 'Alaska', to: 'NorthwestTerritory', count: 5 }, 'p1').ok).toBe(false);
    expect(reduce(adj, { type: 'fortify', from: 'Alaska', to: 'Alberta', count: 1 }, 'p1').ok).toBe(false);
    expect(reduce({ ...adj, phase: 'attack' }, { type: 'fortify', from: 'Alaska', to: 'NorthwestTerritory', count: 1 }, 'p1').ok).toBe(false);
    const r = reduce(adj, { type: 'fortify', from: 'Alaska', to: 'NorthwestTerritory', count: 4 }, 'p1');
    expect(r.ok && r.events[0]).toEqual({ type: 'armiesMoved', player: 'p1', from: 'Alaska', to: 'NorthwestTerritory', count: 4, reason: 'fortify' });
    const st = ok(r);
    expect(st.territories.NorthwestTerritory.armies).toBe(5);
    expect(currentPlayerId(st)).not.toBe('p1'); // fortify ends the turn
    expect(st.phase).toBe('reinforce');

    const con = scenario({ owners: owners as never, phase: 'fortify', settings: { fortify: 'connected' } });
    expect(fortifyTargets(con, 'Alaska').sort()).toEqual(['Greenland', 'NorthwestTerritory']);
    expect(act(con, { type: 'fortify', from: 'Alaska', to: 'Greenland', count: 2 }).territories.Greenland.armies).toBe(3);
  });

  it('endTurn rotates, skips eliminated players and increments turn on wrap', () => {
    const s = scenario({ players: 4, owners: { Alaska: ['p1', 2], Japan: ['p3', 1], Peru: ['p4', 1] }, phase: 'fortify', current: 'p1' });
    // put players in a known order
    s.players.sort((a, b) => a.id.localeCompare(b.id));
    s.current = 0;
    s.turn = 3;
    s.players[1].eliminated = true; // p2
    for (const t of TERRITORY_IDS) if (s.territories[t].owner === 'p2') s.territories[t].owner = 'p3';
    let st = act(s, { type: 'endTurn' });
    expect(currentPlayerId(st)).toBe('p3');
    expect(st.turn).toBe(3);
    expect(st.phase).toBe('reinforce');
    st = { ...st, phase: 'fortify', reinforcements: 0 };
    st = act(st, { type: 'endTurn' });
    expect(currentPlayerId(st)).toBe('p4');
    st = { ...st, phase: 'fortify', reinforcements: 0 };
    st = act(st, { type: 'endTurn' });
    expect(currentPlayerId(st)).toBe('p1');
    expect(st.turn).toBe(4);
    expect(st.conqueredThisTurn).toBe(false);
    expect(st.territoryBonusUsed).toBe(false);
  });

  it('endTurn is allowed from attack (draws the card) but not from reinforce', () => {
    const s = scenario({ owners: { Alaska: ['p1', 2] }, phase: 'attack' });
    s.conqueredThisTurn = true;
    const r = reduce(s, { type: 'endTurn' }, 'p1');
    expect(r.ok && types(r.events).slice(0, 2)).toEqual(['cardDrawn', 'phaseChanged']);
    const rr = reduce({ ...s, phase: 'reinforce', reinforcements: 3 }, { type: 'endTurn' }, 'p1');
    expect(rr.ok).toBe(false);
  });
});

describe('resign', () => {
  it('territories become neutral, cards discarded, turn advances', () => {
    const s = scenario({ players: 3, owners: { Alaska: ['p1', 4], Japan: ['p1', 2], Peru: ['p3', 1] }, phase: 'attack' });
    giveCards(s, 'p1', [cardIdFor('Alaska'), cardIdFor('Peru')]);
    const r = reduce(s, { type: 'resign' }, 'p1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const st = r.state;
    expect(st.players.find((p) => p.id === NEUTRAL)).toMatchObject({ isNeutral: true, color: '#A0A4A8' });
    expect(st.territories.Alaska).toEqual({ owner: NEUTRAL, armies: 4 });
    expect(st.players.find((p) => p.id === 'p1')).toMatchObject({ eliminated: true, cards: [] });
    expect(st.discard).toEqual(expect.arrayContaining([cardIdFor('Alaska'), cardIdFor('Peru')]));
    expect(currentPlayerId(st)).not.toBe('p1');
    expect(st.phase).toBe('reinforce');
    expect(checkInvariants(st)).toBeNull();
    // the remaining two keep playing; one more resign ends the game
    const st2 = act(st, { type: 'resign' });
    expect(st2.phase).toBe('gameOver');
    expect(st2.winner).not.toBeNull();
    expect(st2.players.filter((p) => p.id === NEUTRAL).length).toBe(1);
  });

  it('cannot resign during setup', () => {
    const s = createGame(newPlayers(3), { setup: 'manual' }, 2);
    expect(reduce(s, { type: 'resign' }, currentPlayerId(s)).ok).toBe(false);
  });
});

describe('illegal actions and purity', () => {
  it('rejects wrong actor, unknown things and actions in the wrong phase with messages', () => {
    const s = createGame(newPlayers(3), {}, 9);
    const me = currentPlayerId(s);
    const other = s.players.find((p) => p.id !== me)!.id;
    const cases: [Parameters<typeof reduce>[1], string][] = [
      [{ type: 'endTurn' }, me],
      [{ type: 'claim', territory: 'Alaska' }, me],
      [{ type: 'placeSetup', territory: 'Alaska' }, me],
      [{ type: 'occupy', count: 1 }, me],
      [{ type: 'endAttack' }, me],
      [{ type: 'fortify', from: 'Alaska', to: 'Alberta', count: 1 }, me],
      [{ type: 'placeReinforcements', territory: 'Atlantis' as TerritoryId, count: 1 }, me],
      [{ type: 'bogus' } as never, me],
      [{ type: 'endTurn' }, other],
      [{ type: 'endTurn' }, 'nobody'],
    ];
    for (const [a, actor] of cases) {
      const r = reduce(s, a, actor);
      expect(r.ok, JSON.stringify(a)).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(5);
    }
    const r = reduce(s, { type: 'endTurn' }, other);
    if (!r.ok) expect(r.error).toMatch(/not your turn/);
  });

  it('never mutates the input and increments version', () => {
    const s = createGame(newPlayers(3), {}, 9);
    const snapshot = structuredClone(s);
    const me = currentPlayerId(s);
    const t = placementTargets(s)[0];
    const r = reduce(s, { type: 'placeReinforcements', territory: t, count: 1 }, me);
    expect(s).toEqual(snapshot);
    expect(ok(r).version).toBe(s.version + 1);
  });

  it('every listed legal action is accepted (random walk)', () => {
    let s = createGame(newPlayers(4), { setup: 'manual' }, 1234);
    let pick = 7;
    for (let i = 0; i < 1500 && s.phase !== 'gameOver'; i++) {
      const me = currentPlayerId(s);
      const legal = legalActions(s, me);
      expect(legal.length).toBeGreaterThan(0);
      pick = (pick * 1103515245 + 12345) % 2147483648;
      // bias away from ending phases so the walk explores attacks
      const nonEnd = legal.filter((a) => a.type !== 'endAttack' && a.type !== 'endTurn');
      const pool = nonEnd.length && pick % 5 ? nonEnd : legal;
      const a = pool[pick % pool.length];
      const r = reduce(s, a, me);
      expect(r.ok, JSON.stringify(a) + (r.ok ? '' : r.error)).toBe(true);
      s = ok(r);
      expect(checkInvariants(s)).toBeNull();
    }
  });
});

describe('determinism', () => {
  it('same seed + same actions = same state', () => {
    const run = () => {
      let s = createGame(newPlayers(3), {}, 777);
      const states: GameState[] = [s];
      for (let i = 0; i < 300 && s.phase !== 'gameOver'; i++) {
        const me = currentPlayerId(s);
        const legal = legalActions(s, me);
        const attacks = legal.filter((a) => a.type === 'attack' && a.blitz);
        const a = attacks[0] ?? legal.find((x) => x.type === 'tradeCards') ?? legal.find((x) => x.type !== 'endTurn') ?? legal[0];
        s = act(s, a);
        states.push(s);
      }
      return states;
    };
    expect(run()).toEqual(run());
  });

  it('log is capped at 200 entries', () => {
    let s = createGame(newPlayers(4), {}, 3);
    for (let i = 0; i < 600 && s.phase !== 'gameOver'; i++) {
      const legal = legalActions(s, currentPlayerId(s));
      s = act(s, legal.find((a) => a.type === 'attack' && a.blitz) ?? legal.find((a) => a.type === 'tradeCards') ?? legal[0]);
      expect(s.log.length).toBeLessThanOrEqual(200);
    }
    expect(s.log.length).toBe(200);
  });
});
