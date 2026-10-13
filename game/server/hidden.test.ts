import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game/engine';
import type { GameEvent } from '../src/game/types';
import { eventsFor, viewFor } from './hidden';

const players = [
  { name: 'A', color: '#E63946', kind: 'human' as const },
  { name: 'B', color: '#3A86FF', kind: 'human' as const },
  { name: 'C', color: '#6CC24A', kind: 'bot' as const },
];

describe('hidden information', () => {
  const s = createGame(players, { setup: 'auto' }, 1234);
  s.players.find((p) => p.id === 'p1')!.cards = ['card-Alaska', 'wild-1'];
  s.players.find((p) => p.id === 'p2')!.cards = ['card-Peru', 'card-Egypt', 'card-Japan'];

  it('keeps own cards, hides others (count preserved), hides deck order and rng', () => {
    const v = viewFor(s, ['p1']);
    const p1 = v.players.find((p) => p.id === 'p1')!;
    const p2 = v.players.find((p) => p.id === 'p2')!;
    const p3 = v.players.find((p) => p.id === 'p3')!;
    expect(p1.cards).toEqual(['card-Alaska', 'wild-1']);
    expect(p2.cards).toHaveLength(3);
    expect(p2.cards.every((c) => /^hidden-\d+$/.test(c))).toBe(true);
    expect(p3.cards).toEqual([]);
    expect(v.deck).toHaveLength(s.deck.length);
    expect(v.deck.every((c) => c.startsWith('hidden-'))).toBe(true);
    // placeholders are unique within one view (safe as React keys)
    const all = [...p2.cards, ...v.deck];
    expect(new Set(all).size).toBe(all.length);
    expect(v.rng).toBe(0);
    expect(JSON.stringify([v.players, v.deck])).not.toMatch(/card-Peru|card-Egypt|card-Japan/);
    // the original is untouched
    expect(s.players.find((p) => p.id === 'p2')!.cards).toEqual(['card-Peru', 'card-Egypt', 'card-Japan']);
    expect(s.deck[0]).toMatch(/^(card-|wild-)/);
  });

  it('spectators see no hand at all', () => {
    const v = viewFor(s, []);
    expect(v.players.flatMap((p) => p.cards).every((c) => c.startsWith('hidden-'))).toBe(true);
  });

  it('blanks other players\' drawn cards and taken cards', () => {
    const events: GameEvent[] = [
      { type: 'cardDrawn', player: 'p2', card: 'card-Peru' },
      { type: 'cardDrawn', player: 'p1', card: 'card-Alaska' },
      { type: 'eliminated', player: 'p3', by: 'p2', cardsTaken: ['card-Japan', 'wild-2'] },
    ];
    const e1 = eventsFor(events, ['p1']);
    expect(e1[0]).toEqual({ type: 'cardDrawn', player: 'p2', card: '' });
    expect(e1[1]).toEqual(events[1]);
    expect(e1[2]).toEqual({ type: 'eliminated', player: 'p3', by: 'p2', cardsTaken: ['', ''] });
    const e2 = eventsFor(events, ['p2']);
    expect(e2[0]).toEqual(events[0]);
    expect(e2[2]).toEqual(events[2]);
  });
});
