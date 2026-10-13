// Headless, deterministic dice pre-simulation (Rapier WASM).
//
// For each battle we build a fresh tray world, throw N dice with seeded impulses, step at a
// fixed 1/120 s until everything rests, and record every pose. The engine decides the values;
// we then pick a cube-rotation "visual offset" per die so the face carrying the engine's value
// is the one that ended up on top. Replaying the recording with the offset applied gives a real
// physical tumble that always lands on the right number.
//
// Determinism: same seed → same world, same bodies created in the same order, same impulses.
// No trig in the setup (walls use exact sqrt-based constants, RNG is integer mulberry32), so
// every client running the same WASM build replays the identical throw. Correctness of the
// shown values never depends on that: each client computes its offsets from its own recording.
import RAPIER from '@dimforge/rapier3d-compat';
import { faceOffset, upFace, type FaceValue, type Quat } from './faces';

/** Edge length of a die in tray-local units. */
export const DIE_SIZE = 1;
/** Inner (felt) radius of the tray. */
export const TRAY_RADIUS = 4.5;
/** Visual rim height (physics walls go higher so nothing escapes). */
export const TRAY_RIM_HEIGHT = 1.75;
export const SIM_HZ = 120;
export const MAX_STEPS = 4 * SIM_HZ;
const GRAVITY = -42;
const WALL_SEGMENTS = 24;
const MAX_ATTEMPTS = 10;

let ready: Promise<void> | null = null;
let isReady = false;
export function initPhysics(): Promise<void> {
  if (!ready) ready = RAPIER.init().then(() => { isReady = true; });
  return ready;
}
export const physicsReady = () => isReady;

/** mulberry32 — integer-only, identical everywhere. */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash → uint32 seed. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface DieTrack {
  /** Value the engine rolled for this die. */
  value: FaceValue;
  side: 'attacker' | 'defender';
  /** Value whose face physically ended up on top of the rigid body. */
  restUp: FaceValue;
  /** Visual offset (mesh = body * offset). */
  offset: Quat;
}

export interface ThrowSim {
  seed: number;
  dice: DieTrack[];
  /** Number of recorded frames (frame 0 = initial pose). */
  frames: number;
  /** frames × dice × 7 floats: px py pz qx qy qz qw. */
  data: Float32Array;
  /** Frame of the first hard floor impact (for the clack sound). */
  impactFrame: number;
  /** True if the dice reached rest before the step cap. */
  settled: boolean;
  attempts: number;
}

export function poseAt(sim: ThrowSim, frame: number, die: number): { p: [number, number, number]; q: Quat } {
  const f = Math.max(0, Math.min(sim.frames - 1, frame));
  const o = (f * sim.dice.length + die) * 7;
  const d = sim.data;
  return { p: [d[o], d[o + 1], d[o + 2]], q: [d[o + 3], d[o + 4], d[o + 5], d[o + 6]] };
}

// cos/sin of k·15° from exact algebraic forms (sqrt is correctly rounded in IEEE-754).
function circleTable(): { c: number[]; s: number[] } {
  const r2 = Math.sqrt(2), r3 = Math.sqrt(3), r6 = Math.sqrt(6);
  const q = [1, (r6 + r2) / 4, r3 / 2, r2 / 2, 0.5, (r6 - r2) / 4, 0]; // cos 0..90 step 15
  const c: number[] = [], s: number[] = [];
  for (let k = 0; k < WALL_SEGMENTS; k++) {
    const quad = Math.floor(k / 6), i = k % 6;
    const ci = q[i], si = q[6 - i];
    if (quad === 0) { c.push(ci); s.push(si); }
    else if (quad === 1) { c.push(-si); s.push(ci); }
    else if (quad === 2) { c.push(-ci); s.push(-si); }
    else { c.push(si); s.push(-ci); }
  }
  return { c, s };
}
const CIRCLE = circleTable();

function buildWorld(): RAPIER.World {
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
  world.timestep = 1 / SIM_HZ;
  const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  // floor (top surface at y = 0)
  world.createCollider(RAPIER.ColliderDesc.cuboid(TRAY_RADIUS + 2, 0.5, TRAY_RADIUS + 2).setTranslation(0, -0.5, 0).setFriction(0.7).setRestitution(0.25), fixed);
  // ceiling
  world.createCollider(RAPIER.ColliderDesc.cuboid(TRAY_RADIUS + 2, 0.5, TRAY_RADIUS + 2).setTranslation(0, 7.5, 0), fixed);
  // round wall from 24 boxes; inner faces tangent to TRAY_RADIUS
  const halfT = 0.5;
  const halfW = TRAY_RADIUS * 0.27; // > tan(7.5°)·r so segments overlap
  for (let k = 0; k < WALL_SEGMENTS; k++) {
    const c = CIRCLE.c[k], s = CIRCLE.s[k];
    const d = TRAY_RADIUS + halfT;
    // rotate box about Y so its local X axis points radially: angle θ with cosθ=c, sinθ=s.
    // Rotation about Y by φ maps local X → (cosφ, 0, −sinφ); we want (c, 0, s) → φ = −θ.
    const ch = Math.sqrt(Math.max(0, (1 + c) / 2)); // |cos(θ/2)|
    let sh = Math.sqrt(Math.max(0, (1 - c) / 2)); // |sin(θ/2)|
    // θ/2 in [0°,180°): sin ≥ 0; cos sign = sign of (180° − θ) → handle via s sign
    let cw = ch;
    if (s < 0) { cw = -ch; } // θ in (180°,360°) → θ/2 in (90°,180°) → cos < 0
    sh = -sh; // φ = −θ
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfT, 5, halfW)
        .setTranslation(c * d, 4.5, s * d)
        .setRotation({ x: 0, y: sh, z: 0, w: cw })
        .setFriction(0.3).setRestitution(0.4),
      fixed,
    );
  }
  return world;
}

function normQuat(x: number, y: number, z: number, w: number): Quat {
  const n = Math.sqrt(x * x + y * y + z * z + w * w) || 1;
  return [x / n, y / n, z / n, w / n];
}

interface Attempt { data: Float32Array; frames: number; impactFrame: number; settled: boolean; ok: boolean; finals: Quat[] }

function runAttempt(n: number, sides: ('attacker' | 'defender')[], seed: number): Attempt {
  const rng = makeRng(seed);
  const r = (a: number, b: number) => a + (b - a) * rng();
  const world = buildWorld();
  const bodies: RAPIER.RigidBody[] = [];
  const h = DIE_SIZE / 2;
  const counts = { attacker: sides.filter((s) => s === 'attacker').length, defender: sides.filter((s) => s === 'defender').length };
  const idx = { attacker: 0, defender: 0 };
  for (let i = 0; i < n; i++) {
    const side = sides[i];
    const dir = side === 'attacker' ? 1 : -1; // attackers come from −X, defenders from +X
    const k = idx[side]++;
    const lane = (k - (counts[side] - 1) / 2) * 1.25;
    const q = normQuat(r(-1, 1), r(-1, 1), r(-1, 1), r(-1, 1));
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(-dir * r(3.0, 3.3), r(1.6, 2.6) + k * 0.25, lane + r(-0.25, 0.25))
      .setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] })
      .setLinvel(dir * r(6.5, 9.5), r(0.5, 3), r(-1.6, 1.6))
      .setAngvel({ x: r(-22, 22), y: r(-10, 10), z: r(-22, 22) })
      .setLinearDamping(0.15)
      .setAngularDamping(0.6)
      .setCanSleep(true);
    const b = world.createRigidBody(desc);
    world.createCollider(
      RAPIER.ColliderDesc.roundCuboid(h - 0.06, h - 0.06, h - 0.06, 0.06).setDensity(1).setFriction(0.55).setRestitution(0.3),
      b,
    );
    bodies.push(b);
  }

  const buf = new Float32Array((MAX_STEPS + 1) * n * 7);
  const write = (f: number) => {
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      const t = b.translation(), q = b.rotation();
      const o = (f * n + i) * 7;
      buf[o] = t.x; buf[o + 1] = t.y; buf[o + 2] = t.z;
      buf[o + 3] = q.x; buf[o + 4] = q.y; buf[o + 5] = q.z; buf[o + 6] = q.w;
    }
  };
  write(0);
  let frames = 1, calm = 0, settled = false, impactFrame = -1;
  const prevVy = bodies.map((b) => b.linvel().y);
  for (let step = 1; step <= MAX_STEPS; step++) {
    world.step();
    write(step);
    frames = step + 1;
    let still = true;
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      const v = b.linvel(), w = b.angvel();
      if (impactFrame < 0 && prevVy[i] < -4 && v.y > prevVy[i] + 3) impactFrame = step;
      prevVy[i] = v.y;
      if (!b.isSleeping() && (v.x * v.x + v.y * v.y + v.z * v.z > 0.01 || w.x * w.x + w.y * w.y + w.z * w.z > 0.03)) still = false;
    }
    calm = still ? calm + 1 : 0;
    if (step > 40 && calm >= 12) { settled = true; break; }
  }

  let ok = settled;
  const finals: Quat[] = [];
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    const t = b.translation();
    const o = ((frames - 1) * n + i) * 7;
    const q: Quat = [buf[o + 3], buf[o + 4], buf[o + 5], buf[o + 6]];
    finals.push(q);
    if (upFace(q).dot < 0.985) ok = false; // leaning on a wall / another die
    if (t.y > h + 0.15) ok = false; // stacked
    if (t.x * t.x + t.z * t.z > TRAY_RADIUS * TRAY_RADIUS) ok = false;
  }
  world.free();
  return { data: buf.slice(0, frames * n * 7), frames, impactFrame: impactFrame < 0 ? 10 : impactFrame, settled, ok, finals };
}

/**
 * Pre-simulate a throw. `attackerDice` / `defenderDice` are the engine's values.
 * Requires `await initPhysics()` first.
 */
export function simulateThrow(attackerDice: number[], defenderDice: number[], seed: number): ThrowSim {
  if (!isReady) throw new Error('dice: call initPhysics() before simulateThrow()');
  const values = [...attackerDice, ...defenderDice].map((v) => Math.max(1, Math.min(6, Math.round(v))) as FaceValue);
  const sides = [...attackerDice.map(() => 'attacker' as const), ...defenderDice.map(() => 'defender' as const)];
  const n = values.length;
  let att: Attempt | null = null;
  let attempts = 0;
  for (let a = 0; a < MAX_ATTEMPTS; a++) {
    attempts = a + 1;
    att = runAttempt(n, sides, (seed + Math.imul(a, 0x9e3779b1)) >>> 0);
    if (att.ok) break;
  }
  const res = att!;
  const dice: DieTrack[] = values.map((value, i) => {
    const restUp = upFace(res.finals[i]).value;
    return { value, side: sides[i], restUp, offset: faceOffset(restUp, value) };
  });
  return { seed, dice, frames: res.frames, data: res.data, impactFrame: res.impactFrame, settled: res.settled, attempts };
}
