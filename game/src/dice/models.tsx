// Die + tray visuals: real GLBs when present (/assets/dice/*.glb), procedural fallbacks otherwise.
// All visuals are normalised to the simulation units (die edge = DIE_SIZE, centred on the body;
// tray felt surface at y = 0 with radius TRAY_RADIUS).
import { RoundedBox, useGLTF } from '@react-three/drei';
import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FACE_NORMALS, FACE_VALUES, type FaceValue } from './faces';
import { DIE_SIZE, TRAY_RADIUS, TRAY_RIM_HEIGHT } from './sim';

export const DIE_URL = '/assets/dice/die.glb';
export const TRAY_URL = '/assets/dice/tray.glb';

export const ATTACKER_BODY = '#D62828';
export const DEFENDER_BODY = '#F4F1EA';
export const ATTACKER_PIPS = '#FFFFFF';
export const DEFENDER_PIPS = '#2B2B33';

const probeCache = new Map<string, Promise<boolean>>();
/** HEAD-probe an asset; Vite answers missing files with index.html (200, text/html) → treat as missing. */
export function probeAsset(url: string): Promise<boolean> {
  if (typeof window !== 'undefined' && (window as unknown as { __diceForceFallback?: boolean }).__diceForceFallback) return Promise.resolve(false);
  if (!probeCache.has(url)) {
    probeCache.set(url, fetch(url, { method: 'HEAD' })
      .then((r) => r.ok && !(r.headers.get('content-type') ?? '').includes('text/html'))
      .catch(() => false));
  }
  return probeCache.get(url)!;
}

export function useAsset(url: string): boolean | null {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => { let live = true; probeAsset(url).then((v) => { if (live) setOk(v); }); return () => { live = false; }; }, [url]);
  return ok;
}

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.warn('[dice] asset failed, using fallback', e); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** Real asset if available, fallback otherwise (also while probing/loading, and on load error). */
function WithAsset({ url, real, fallback }: { url: string; real: ReactNode; fallback: ReactNode }) {
  const ok = useAsset(url);
  if (!ok) return <>{fallback}</>;
  return <Boundary fallback={fallback}><Suspense fallback={fallback}>{real}</Suspense></Boundary>;
}

// ---------------------------------------------------------------- die

export type DieSide = 'attacker' | 'defender';

function tintMaterial(src: THREE.Material, color: string, dropMap: boolean): THREE.Material {
  const m = src.clone() as THREE.MeshStandardMaterial;
  if (dropMap && 'map' in m) m.map = null;
  if ('color' in m) m.color = new THREE.Color(color);
  m.needsUpdate = true;
  return m;
}

function GlbDie({ side }: { side: DieSide }) {
  const gltf = useGLTF(DIE_URL);
  const obj = useMemo(() => {
    const root = gltf.scene.clone(true);
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const isPips = /pip/i.test(mesh.name);
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (side === 'attacker') {
        // red body + white pips: drop the off-white atlas so the tint is clean
        mesh.material = tintMaterial(mat, isPips ? ATTACKER_PIPS : ATTACKER_BODY, true);
      } else {
        mesh.material = isPips ? tintMaterial(mat, '#FFFFFF', false) : tintMaterial(mat, DEFENDER_BODY, false);
      }
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });
    // normalise: centre on the body, edge = DIE_SIZE (asset origin is the bottom face)
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const s = DIE_SIZE / Math.max(size.x, size.y, size.z);
    const wrap = new THREE.Group();
    root.position.sub(centre);
    wrap.add(root);
    wrap.scale.setScalar(s);
    return wrap;
  }, [gltf, side]);
  return <primitive object={obj} />;
}

// pip layout in face (u, v) coordinates, ±1 = pip grid corners
const PIP_LAYOUT: Record<FaceValue, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
  5: [[-1, -1], [-1, 1], [0, 0], [1, -1], [1, 1]],
  6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
};

let pipGeometry: THREE.BufferGeometry | null = null;
/** All 21 pips merged, placed according to FACE_NORMALS. */
function getPipGeometry(): THREE.BufferGeometry {
  if (pipGeometry) return pipGeometry;
  const parts: THREE.BufferGeometry[] = [];
  const h = DIE_SIZE / 2;
  for (const v of FACE_VALUES) {
    const n = new THREE.Vector3(...FACE_NORMALS[v]);
    const u = Math.abs(n.y) > 0.5 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const w = new THREE.Vector3().crossVectors(n, u);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    for (const [a, b] of PIP_LAYOUT[v]) {
      const g = new THREE.CircleGeometry(DIE_SIZE * 0.085, 20);
      g.applyQuaternion(q);
      const p = n.clone().multiplyScalar(h + 0.004).addScaledVector(u, a * DIE_SIZE * 0.25).addScaledVector(w, b * DIE_SIZE * 0.25);
      g.translate(p.x, p.y, p.z);
      parts.push(g);
    }
  }
  pipGeometry = mergeGeometries(parts)!;
  return pipGeometry;
}

function FallbackDie({ side }: { side: DieSide }) {
  const pips = useMemo(getPipGeometry, []);
  const attacker = side === 'attacker';
  return (
    <group>
      <RoundedBox args={[DIE_SIZE, DIE_SIZE, DIE_SIZE]} radius={DIE_SIZE * 0.14} smoothness={4}>
        <meshStandardMaterial color={attacker ? ATTACKER_BODY : DEFENDER_BODY} roughness={0.35} />
      </RoundedBox>
      <mesh geometry={pips}>
        <meshStandardMaterial color={attacker ? ATTACKER_PIPS : DEFENDER_PIPS} roughness={0.5} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
    </group>
  );
}

export function DieModel({ side }: { side: DieSide }) {
  return <WithAsset url={DIE_URL} real={<GlbDie side={side} />} fallback={<FallbackDie side={side} />} />;
}

// ---------------------------------------------------------------- tray

function GlbTray() {
  const gltf = useGLTF(TRAY_URL);
  const obj = useMemo(() => {
    const root = gltf.scene.clone(true);
    root.updateMatrixWorld(true);
    let felt: THREE.Object3D | null = null;
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) { mesh.castShadow = false; mesh.receiveShadow = false; }
      if (/felt/i.test(o.name) && (o as THREE.Mesh).isMesh) felt = o;
    });
    // scale so the felt radius = TRAY_RADIUS and the felt top sits at y = 0
    const fb = new THREE.Box3().setFromObject(felt ?? root);
    const fs = fb.getSize(new THREE.Vector3());
    const s = (TRAY_RADIUS * 2) / Math.max(fs.x, fs.z);
    const wrap = new THREE.Group();
    const fc = fb.getCenter(new THREE.Vector3());
    root.position.set(-fc.x, -(felt ? fb.max.y : fb.min.y), -fc.z);
    wrap.add(root);
    wrap.scale.setScalar(s);
    return wrap;
  }, [gltf]);
  return <primitive object={obj} />;
}

function FallbackTray() {
  const rim = useMemo(() => {
    const r = TRAY_RADIUS, H = TRAY_RIM_HEIGHT, t = 0.55;
    const pts: THREE.Vector2[] = [];
    pts.push(new THREE.Vector2(0, -0.35));
    pts.push(new THREE.Vector2(r + t, -0.35));
    // outer wall up to a rounded lip, then down the inside
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI;
      pts.push(new THREE.Vector2(r + t / 2 + Math.cos(a) * (t / 2), H + Math.sin(a) * (t / 2) * 0.8));
    }
    pts.push(new THREE.Vector2(r, 0));
    pts.push(new THREE.Vector2(0, 0));
    return new THREE.LatheGeometry(pts, 64);
  }, []);
  return (
    <group>
      <mesh geometry={rim}>
        <meshStandardMaterial color="#C98B55" roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.005}>
        <circleGeometry args={[TRAY_RADIUS, 64]} />
        <meshStandardMaterial color="#3F9466" roughness={0.95} />
      </mesh>
    </group>
  );
}

export function TrayModel() {
  return <WithAsset url={TRAY_URL} real={<GlbTray />} fallback={<FallbackTray />} />;
}
