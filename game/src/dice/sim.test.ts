import { beforeAll, describe, expect, it } from 'vitest';
import { FACE_NORMALS, FACE_VALUES, quatMul, quatRotate, showFaceUp, type FaceValue } from './faces';
import { DIE_SIZE, TRAY_RADIUS, hashSeed, initPhysics, poseAt, simulateThrow } from './sim';

const sameBits = (x: Float32Array, y: Float32Array) => x.length === y.length && new Uint32Array(x.buffer).every((v, i) => v === new Uint32Array(y.buffer)[i]);

beforeAll(async () => { await initPhysics(); });

/** Value shown on top of the rendered die = face whose (body · offset)-rotated normal points up. */
function shownTop(q: [number, number, number, number], offset: [number, number, number, number]): { value: FaceValue; dot: number } {
  const m = quatMul(q, offset);
  let best: FaceValue = 1, dot = -2;
  for (const v of FACE_VALUES) {
    const d = quatRotate(m, FACE_NORMALS[v])[1];
    if (d > dot) { dot = d; best = v; }
  }
  return { value: best, dot };
}

describe('dice pre-simulation', () => {
  it('is deterministic for the same seed', () => {
    const a = simulateThrow([6, 3, 1], [5, 3], 12345);
    const b = simulateThrow([6, 3, 1], [5, 3], 12345);
    expect(a.frames).toBe(b.frames);
    expect(a.attempts).toBe(b.attempts);
    expect(sameBits(a.data, b.data)).toBe(true);
    expect(a.dice.map((d) => d.offset)).toEqual(b.dice.map((d) => d.offset));
    const c = simulateThrow([6, 3, 1], [5, 3], 999);
    expect(sameBits(c.data, a.data)).toBe(false);
  });

  it('every die comes to rest flat inside the tray', () => {
    for (let s = 0; s < 25; s++) {
      const sim = simulateThrow([5, 4, 2], [6, 1], hashSeed('rest' + s));
      expect(sim.settled).toBe(true);
      expect(sim.frames).toBeLessThanOrEqual(4 * 120 + 1);
      for (let i = 0; i < sim.dice.length; i++) {
        const { p } = poseAt(sim, sim.frames - 1, i);
        expect(Math.hypot(p[0], p[2])).toBeLessThan(TRAY_RADIUS);
        expect(p[1]).toBeGreaterThan(0);
        expect(p[1]).toBeLessThan(DIE_SIZE * 0.5 + 0.2);
      }
    }
  });

  it('offset puts the requested value on top for all 6 values × many seeds', () => {
    for (const v of FACE_VALUES) {
      for (let s = 0; s < 8; s++) {
        const att = [v, ((v + s) % 6) + 1, ((v + 2 * s) % 6) + 1];
        const def = [((v + 3) % 6) + 1, v];
        const sim = simulateThrow(att, def, hashSeed(`v${v}s${s}`));
        const wanted = [...att, ...def];
        sim.dice.forEach((d, i) => {
          const { q } = poseAt(sim, sim.frames - 1, i);
          const top = shownTop(q, d.offset);
          expect(top.value).toBe(wanted[i]);
          expect(top.dot).toBeGreaterThan(0.98);
        });
      }
    }
  });

  it('line-up orientation shows each value on top', () => {
    for (const v of FACE_VALUES) expect(quatRotate(showFaceUp(v), FACE_NORMALS[v])[1]).toBeCloseTo(1, 6);
  });
});
