// Deterministic seeded PRNG (mulberry32). The generator state lives in
// `GameState.rng`, so every shuffle / die roll is replayable from the seed.

export interface RngHolder { rng: number }

/** Normalises any number into a 32-bit integer seed. */
export function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 0x9e3779b9 | 0;
  return Math.floor(seed) | 0;
}

/** One mulberry32 step: returns a float in [0, 1) and the next generator state. */
export function mulberry32(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next };
}

/** Float in [0, 1); advances `h.rng`. */
export function random(h: RngHolder): number {
  const r = mulberry32(h.rng);
  h.rng = r.state;
  return r.value;
}

/** Integer in [0, n). */
export function randInt(h: RngHolder, n: number): number {
  return Math.floor(random(h) * n);
}

/** A six-sided die: 1..6. */
export function rollDie(h: RngHolder): number {
  return randInt(h, 6) + 1;
}

/** Fisher–Yates shuffle in place; returns the same array. */
export function shuffle<T>(h: RngHolder, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(h, i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}
