// Die face layout + tiny quaternion helpers (pure math, no three/rapier) shared by
// the simulation, the renderer and the tests.

export type Vec3 = [number, number, number];
/** [x, y, z, w] */
export type Quat = [number, number, number, number];
export type FaceValue = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Body-local outward normal of the face carrying each value (glTF axes, Y up).
 * Matches /assets/dice/die.glb as exported by the generator (1 = top, 2 = front, 3 = right).
 * If the real asset turns out different, fix it HERE only — sim, offsets, fallback pips and
 * line-up all derive from this table.
 */
export const FACE_NORMALS: Record<FaceValue, Vec3> = {
  1: [0, 1, 0],
  6: [0, -1, 0],
  2: [0, 0, 1],
  5: [0, 0, -1],
  3: [1, 0, 0],
  4: [-1, 0, 0],
};

export const FACE_VALUES: FaceValue[] = [1, 2, 3, 4, 5, 6];

export const QUAT_IDENTITY: Quat = [0, 0, 0, 1];

export function quatMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function quatConj(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

export function quatRotate(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const [vx, vy, vz] = v;
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ];
}

/** Which value's face points most upward (+Y) for a body with orientation q; also returns that face's up-dot. */
export function upFace(q: Quat): { value: FaceValue; dot: number } {
  let best: FaceValue = 1;
  let bestDot = -Infinity;
  for (const v of FACE_VALUES) {
    const d = quatRotate(q, FACE_NORMALS[v])[1];
    if (d > bestDot) { bestDot = d; best = v; }
  }
  return { value: best, dot: bestDot };
}

const S = Math.SQRT1_2;

/**
 * One of the 24 cube rotations mapping axis-aligned unit vector `from` onto `to`
 * (both must be ±X/±Y/±Z). Exact constants — no trig, so results are bit-identical everywhere.
 */
export function cubeRotation(from: Vec3, to: Vec3): Quat {
  const dot = from[0] * to[0] + from[1] * to[1] + from[2] * to[2];
  if (dot > 0.5) return [0, 0, 0, 1];
  if (dot < -0.5) {
    // 180° about any cube axis perpendicular to `from`
    const axis: Vec3 = Math.abs(from[1]) > 0.5 ? [0, 0, 1] : [0, 1, 0];
    return [axis[0], axis[1], axis[2], 0];
  }
  // 90° about from × to
  const ax = from[1] * to[2] - from[2] * to[1];
  const ay = from[2] * to[0] - from[0] * to[2];
  const az = from[0] * to[1] - from[1] * to[0];
  return [ax * S, ay * S, az * S, S];
}

/**
 * Visual offset for a die whose rigid body came to rest with face `restUp` (a value) pointing up:
 * mesh orientation = body * offset puts `wanted`'s face where `restUp`'s face is.
 */
export function faceOffset(restUp: FaceValue, wanted: FaceValue): Quat {
  return cubeRotation(FACE_NORMALS[wanted], FACE_NORMALS[restUp]);
}

/** Neat orientation (mesh space) with `value` on top, used for the line-up. */
export function showFaceUp(value: FaceValue): Quat {
  return cubeRotation(FACE_NORMALS[value], [0, 1, 0]);
}
