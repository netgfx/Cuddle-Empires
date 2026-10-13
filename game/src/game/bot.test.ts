import { describe, expect, it } from 'vitest';
import { chooseBotAction, simulateGame } from './bot';
import { createGame, currentPlayerId, reduce } from './engine';
import { TERRITORY_IDS } from './mapData';
import type { GameSettings, GameState } from './types';
import { checkInvariants, newPlayers } from './testUtils';

function playChecked(seed: number, n: number, settings: Partial<GameSettings>, maxActions = 20000): { state: GameState; actions: number } {
  let s = createGame(newPlayers(n, 'bot'), settings, seed);
  let actions = 0;
  let setupDone = false;
  while (s.phase !== 'gameOver' && actions < maxActions) {
    const me = currentPlayerId(s);
    const a = chooseBotAction(s, me);
    const r = reduce(s, a, me);
    if (!r.ok) throw new Error(`illegal bot action ${JSON.stringify(a)}: ${r.error}`);
    s = r.state;
    actions++;
    const err = checkInvariants(s);
    if (err) throw new Error(`invariant broken after ${JSON.stringify(a)}: ${err}`);
    if (!setupDone && s.phase !== 'setupClaim' && s.phase !== 'setupReinforce') setupDone = true;
  }
  return { state: s, actions };
}

describe('bot games', () => {
  const variants: Partial<GameSettings>[] = [
    {},
    { setup: 'manual' },
    { setup: 'manual', cardProgression: 'expert', fortify: 'connected' },
  ];
  let games = 0;
  for (let n = 2; n <= 6; n++) {
    for (let i = 0; i < 7; i++) {
      const seed = 1000 * n + i * 37 + 1;
      const settings = variants[i % variants.length];
      it(`${n} players · seed ${seed} · ${JSON.stringify(settings)}`, () => {
        const { state } = playChecked(seed, n, settings);
        expect(state.phase).toBe('gameOver');
        expect(state.winner).toMatch(/^p\d$/);
        const winner = state.players.find((p) => p.id === state.winner)!;
        expect(winner.eliminated).toBe(false);
        expect(state.players.filter((p) => !p.isNeutral && !p.eliminated).map((p) => p.id)).toEqual([state.winner]);
        expect(TERRITORY_IDS.every((t) => state.territories[t].owner === state.winner || state.territories[t].owner === 'neutral')).toBe(true);
      });
      games++;
    }
  }
  it('ran 30+ games', () => expect(games).toBeGreaterThanOrEqual(30));

  it('simulateGame is deterministic and finishes', () => {
    const a = simulateGame(42, 4);
    const b = simulateGame(42, 4);
    expect(a.state.phase).toBe('gameOver');
    expect(a.actions).toBe(b.actions);
    expect(a.state).toEqual(b.state);
    const c = simulateGame(43, 4);
    expect(c.state).not.toEqual(a.state);
  });
});
