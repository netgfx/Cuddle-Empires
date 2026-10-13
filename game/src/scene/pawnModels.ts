// Pawn model loader. Each pawn kind becomes two merged geometries:
//  - `body`: every non-team part, drawn with the model's own material
//  - `team`: every TeamColor_* part, drawn with a cloned material tinted per instance (instanceColor)
// Real GLBs are probed in /assets/pawns/<kind>.glb; when missing we build cute procedural
// placeholders, so swapping the files later needs no code change.
import { useEffect, useState } from 'react';
import {
  Box3, BufferAttribute, BufferGeometry, CapsuleGeometry, Color, CylinderGeometry, type Material, Matrix4,
  Mesh, MeshStandardMaterial, type Object3D, SphereGeometry, BoxGeometry, TorusGeometry, ConeGeometry, Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PawnKind } from './sceneConfig';

export interface PawnModel {
  kind: PawnKind;
  body: BufferGeometry;
  bodyMat: Material;
  team: BufferGeometry;
  teamMat: Material;
  /** True when loaded from a GLB. */
  real: boolean;
}

export const PAWN_URL: Record<PawnKind, string> = {
  dog: '/assets/pawns/dog.glb',
  pony: '/assets/pawns/pony.glb',
  panda: '/assets/pawns/panda.glb',
};
/** Normalised heights in metres. */
export const PAWN_HEIGHT: Record<PawnKind, number> = { dog: 0.032, pony: 0.038, panda: 0.045 };

async function exists(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    const ct = r.headers.get('content-type') ?? '';
    return r.ok && !ct.includes('text/html');
  } catch { return false; }
}

/** Scale + translate so the model stands on y=0, centred on its base, with the target height. */
function normaliseMatrix(geoms: BufferGeometry[], height: number): Matrix4 {
  const box = new Box3();
  for (const g of geoms) { g.computeBoundingBox(); box.union(g.boundingBox!); }
  const size = box.getSize(new Vector3());
  const s = height / Math.max(size.y, 1e-6);
  const c = box.getCenter(new Vector3());
  return new Matrix4().makeScale(s, s, s).multiply(new Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));
}

function mergeOrFirst(list: BufferGeometry[]): BufferGeometry {
  if (list.length === 0) return new BufferGeometry();
  const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
  return merged ?? list[0];
}

/** Strip attributes not shared by every geometry so mergeGeometries succeeds. */
function harmonise(list: BufferGeometry[]) {
  if (list.length === 0) return;
  const common = Object.keys(list[0].attributes).filter((k) => list.every((g) => g.getAttribute(k)));
  const allIndexed = list.every((g) => g.index);
  for (let i = 0; i < list.length; i++) {
    let g = list[i];
    if (!allIndexed && g.index) g = list[i] = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (!common.includes(k)) g.deleteAttribute(k);
  }
}

async function loadReal(kind: PawnKind): Promise<PawnModel> {
  const gltf = await new GLTFLoader().loadAsync(PAWN_URL[kind]);
  const root: Object3D = gltf.scene;
  root.updateMatrixWorld(true);
  const body: BufferGeometry[] = [];
  const team: BufferGeometry[] = [];
  let mat: Material | null = null;
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    // a TeamColor_* node or any ancestor of it
    let isTeam = false;
    for (let p: Object3D | null = m; p; p = p.parent) if (p.name.startsWith('TeamColor_')) { isTeam = true; break; }
    (isTeam ? team : body).push(g);
    if (!mat) mat = Array.isArray(m.material) ? m.material[0] : m.material;
  });
  const all = [...body, ...team];
  harmonise(all);
  const norm = normaliseMatrix(all, PAWN_HEIGHT[kind]);
  for (const g of all) g.applyMatrix4(norm);
  const bodyGeom = mergeOrFirst(body);
  const teamGeom = mergeOrFirst(team);
  const bodyMat = (mat ?? new MeshStandardMaterial()) as MeshStandardMaterial;
  const teamMat = bodyMat.clone();
  teamMat.color = new Color('#ffffff');
  // team parts are textured light grey: brighten slightly so the instance tint reads true
  teamMat.color.setScalar(1.08);
  return { kind, body: bodyGeom, bodyMat, team: teamGeom, teamMat, real: true };
}

// ------------------------------------------------------------ procedural placeholders

function part(g: BufferGeometry, color: string, m: Matrix4): BufferGeometry {
  const geo = g;
  geo.applyMatrix4(m);
  const n = geo.getAttribute('position').count;
  const c = new Color(color);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new BufferAttribute(arr, 3));
  return geo;
}
const T = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z);
const TS = (x: number, y: number, z: number, sx: number, sy = sx, sz = sx) => T(x, y, z).multiply(new Matrix4().makeScale(sx, sy, sz));
const TRx = (x: number, y: number, z: number, rx: number) => T(x, y, z).multiply(new Matrix4().makeRotationX(rx));

function placeholder(kind: PawnKind): PawnModel {
  const body: BufferGeometry[] = [];
  const team: BufferGeometry[] = [
    part(new CylinderGeometry(0.5, 0.54, 0.12, 24), '#ffffff', T(0, 0.06, 0)), // base disc
  ];
  const eye = '#2b2b2b';
  if (kind === 'dog') {
    const fur = '#e9c79a';
    body.push(part(new CapsuleGeometry(0.2, 0.3, 4, 12), fur, TRx(0, 0.42, -0.02, Math.PI / 2)));
    body.push(part(new SphereGeometry(0.24, 16, 12), fur, T(0, 0.78, 0.12)));
    body.push(part(new SphereGeometry(0.1, 10, 8), '#f6e6cf', T(0, 0.72, 0.33)));
    body.push(part(new SphereGeometry(0.035, 8, 6), eye, T(0, 0.76, 0.43)));
    body.push(part(new SphereGeometry(0.1, 10, 8), '#a4703f', TS(-0.2, 0.92, 0.08, 1, 1.5, 0.6)));
    body.push(part(new SphereGeometry(0.1, 10, 8), '#a4703f', TS(0.2, 0.92, 0.08, 1, 1.5, 0.6)));
    body.push(part(new SphereGeometry(0.035, 8, 6), eye, T(-0.09, 0.84, 0.33)));
    body.push(part(new SphereGeometry(0.035, 8, 6), eye, T(0.09, 0.84, 0.33)));
    for (const [x, z] of [[-0.12, 0.18], [0.12, 0.18], [-0.12, -0.2], [0.12, -0.2]]) body.push(part(new CylinderGeometry(0.06, 0.07, 0.22, 8), fur, T(x, 0.22, z)));
    team.push(part(new TorusGeometry(0.17, 0.05, 8, 18), '#ffffff', TRx(0, 0.6, 0.08, Math.PI / 2)));
  } else if (kind === 'pony') {
    const coat = '#f3b6c8';
    body.push(part(new BoxGeometry(0.34, 0.3, 0.6), coat, T(0, 0.48, 0)));
    for (const [x, z] of [[-0.12, 0.2], [0.12, 0.2], [-0.12, -0.2], [0.12, -0.2]]) body.push(part(new BoxGeometry(0.1, 0.36, 0.1), coat, T(x, 0.2, z)));
    body.push(part(new BoxGeometry(0.26, 0.32, 0.3), coat, T(0, 0.78, 0.3)));
    body.push(part(new BoxGeometry(0.08, 0.36, 0.3), '#8e5bd6', T(0, 0.82, 0.12)));
    body.push(part(new SphereGeometry(0.035, 8, 6), eye, T(-0.1, 0.84, 0.46)));
    body.push(part(new SphereGeometry(0.035, 8, 6), eye, T(0.1, 0.84, 0.46)));
    body.push(part(new ConeGeometry(0.05, 0.12, 6), coat, T(-0.08, 1.0, 0.26)));
    body.push(part(new ConeGeometry(0.05, 0.12, 6), coat, T(0.08, 1.0, 0.26)));
    team.push(part(new BoxGeometry(0.36, 0.06, 0.26), '#ffffff', T(0, 0.65, -0.04)));
    team.push(part(new TorusGeometry(0.14, 0.04, 8, 18), '#ffffff', TRx(0, 0.62, 0.28, Math.PI / 2)));
  } else {
    body.push(part(new SphereGeometry(0.34, 18, 14), '#fbfbf7', T(0, 0.45, 0)));
    body.push(part(new SphereGeometry(0.26, 18, 14), '#fbfbf7', T(0, 0.86, 0.04)));
    body.push(part(new SphereGeometry(0.09, 10, 8), '#262626', T(-0.18, 1.06, 0)));
    body.push(part(new SphereGeometry(0.09, 10, 8), '#262626', T(0.18, 1.06, 0)));
    body.push(part(new SphereGeometry(0.07, 10, 8), '#262626', TS(-0.1, 0.9, 0.22, 1, 1.3, 0.6)));
    body.push(part(new SphereGeometry(0.07, 10, 8), '#262626', TS(0.1, 0.9, 0.22, 1, 1.3, 0.6)));
    body.push(part(new SphereGeometry(0.12, 10, 8), '#262626', TS(-0.3, 0.5, 0.1, 0.8, 1.4, 0.8)));
    body.push(part(new SphereGeometry(0.12, 10, 8), '#262626', TS(0.3, 0.5, 0.1, 0.8, 1.4, 0.8)));
    body.push(part(new SphereGeometry(0.03, 8, 6), '#262626', T(0, 0.82, 0.3)));
    team.push(part(new TorusGeometry(0.2, 0.05, 8, 20), '#ffffff', TRx(0, 0.66, 0.02, Math.PI / 2)));
  }
  const all = [...body, ...team];
  harmonise(all);
  const norm = normaliseMatrix(all, PAWN_HEIGHT[kind]);
  for (const g of all) g.applyMatrix4(norm);
  const bodyMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  const teamMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
  return { kind, body: mergeOrFirst(body), bodyMat, team: mergeOrFirst(team), teamMat, real: false };
}

const cache = new Map<PawnKind, Promise<PawnModel>>();
export function loadPawn(kind: PawnKind): Promise<PawnModel> {
  let p = cache.get(kind);
  if (!p) {
    p = (async () => {
      if (await exists(PAWN_URL[kind])) {
        try { return await loadReal(kind); } catch (e) { console.warn('[pawns] failed to load', kind, e); }
      }
      return placeholder(kind);
    })();
    cache.set(kind, p);
  }
  return p;
}

/** Pawn models as they finish loading (real GLB, or placeholder when the file is missing). */
export function usePawnModels(): Partial<Record<PawnKind, PawnModel>> {
  const [models, setModels] = useState<Partial<Record<PawnKind, PawnModel>>>({});
  useEffect(() => {
    let alive = true;
    for (const k of ['dog', 'pony', 'panda'] as PawnKind[]) {
      void loadPawn(k).then((m) => { if (alive) setModels((s) => ({ ...s, [k]: m })); });
    }
    return () => { alive = false; };
  }, []);
  return models;
}
