import { describe, expect, it } from 'vitest';
import { createGame, reduce } from '../game/engine';
import { TERRITORY_IDS } from '../game/mapData';
import { newPlayers } from '../game/testUtils';
import { buildSave, deleteSave, listSaves, readSave, restoreState, validateSave, writeSave, type KV } from './saves';

function memoryKV(limit = Infinity): KV & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      const used = [...map].reduce((n, [key, val]) => n + (key === k ? 0 : val.length), 0);
      if (used + v.length > limit) throw new DOMException('full', 'QuotaExceededError');
      map.set(k, v);
    },
    removeItem: (k) => { map.delete(k); },
  };
}

const game = () => createGame([...newPlayers(2), { name: 'Robo', color: '#FFBE0B', kind: 'bot' }], { setup: 'auto' }, 42);

describe('save files', () => {
  it('snapshots every player with their territories and armies', () => {
    const s = game();
    const save = buildSave(s, '', 1000);
    expect(Object.keys(save.players)).toEqual(['player-1', 'player-2', 'player-3']);
    const names = s.players.map((p) => p.name); // seat order is shuffled by the engine
    expect(save.label).toBe(`${names[0]}, ${names[1]} & ${names[2]}`);
    const p1 = save.players['player-1'];
    expect(p1.name).toBe(names[0]);
    const owned = TERRITORY_IDS.filter((t) => s.territories[t].owner === p1.id);
    expect(p1.data.territories).toHaveLength(owned.length);
    expect(p1.data.territories[0]).toEqual({ id: owned[0], name: expect.any(String), armies: s.territories[owned[0]].armies });
    const all = Object.values(save.players).flatMap((p) => p.data.territories);
    expect(all).toHaveLength(TERRITORY_IDS.length);
  });

  it('is detached from the live state', () => {
    const s = game();
    const save = buildSave(s);
    s.territories.Alaska.armies = 99;
    expect(save.state.territories.Alaska.armies).not.toBe(99);
  });

  it('round-trips through storage and plays on exactly like the original', () => {
    const kv = memoryKV();
    const s = game();
    const save = buildSave(s, 'Sunday game', 5000);
    writeSave(save, kv);

    const list = listSaves(kv);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: save.id, label: 'Sunday game', savedAt: 5000, round: s.turn, phase: s.phase });
    expect(list[0].players.map((p) => p.name)).toEqual(s.players.map((p) => p.name));

    const restored = restoreState(readSave(save.id, kv));
    expect(restored).toEqual(s);
    const me = s.players[s.current].id;
    const target = TERRITORY_IDS.find((t) => s.territories[t].owner === me)!;
    const a = reduce(s, { type: 'placeReinforcements', territory: target, count: 1 }, me);
    const b = reduce(restored, { type: 'placeReinforcements', territory: target, count: 1 }, me);
    expect(b).toEqual(a);
  });

  it('lists newest first and deletes both the file and the index entry', () => {
    const kv = memoryKV();
    const a = buildSave(game(), 'old', 1000);
    const b = buildSave(game(), 'new', 2000);
    writeSave(a, kv);
    writeSave(b, kv);
    expect(listSaves(kv).map((s) => s.label)).toEqual(['new', 'old']);
    deleteSave(a.id, kv);
    expect(listSaves(kv).map((s) => s.label)).toEqual(['new']);
    expect(() => readSave(a.id, kv)).toThrow(/no longer exists/);
  });

  it('reports a full storage clearly and leaves no half-written save', () => {
    const kv = memoryKV(2000);
    expect(() => writeSave(buildSave(game()), kv)).toThrow(/Storage is full/);
    expect(listSaves(kv)).toEqual([]);
    expect(kv.map.size).toBe(0);
  });

  it('rejects files that are not valid saves', () => {
    const kv = memoryKV();
    expect(validateSave(null)).toMatch(/Not a Risk save/);
    expect(validateSave({ format: 'risk3d-save', version: 99 })).toMatch(/newer version/);
    const broken = buildSave(game());
    delete (broken.state.territories as Partial<typeof broken.state.territories>).Alaska;
    expect(validateSave(broken)).toMatch(/territories/);
    kv.setItem('risk3d-save:bad', '{nope');
    expect(() => readSave('bad', kv)).toThrow(/corrupted/);
  });

  it('survives a corrupted index', () => {
    const kv = memoryKV();
    kv.setItem('risk3d-saves', 'not json');
    expect(listSaves(kv)).toEqual([]);
    writeSave(buildSave(game(), 'fresh'), kv);
    expect(listSaves(kv).map((s) => s.label)).toEqual(['fresh']);
  });
});
