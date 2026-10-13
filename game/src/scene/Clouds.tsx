// Decorative clouds: a few fluffy white puffs drifting very slowly across the board, left to right
// or right to left, each with a faint soft shadow on the map. Five prebuilt shapes (seeded, so they
// are the same every load), random lanes, heights and speeds. They fade near the camera and at the
// ends of their path, never take pointer events, and draw under the army badges and labels.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BufferGeometry, CanvasTexture, type Group, type Mesh, MeshStandardMaterial, MeshBasicMaterial, SphereGeometry, SRGBColorSpace } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BOARD } from './sceneConfig';

const SHAPES = 5;
const ACTIVE = 4;
const PATH_X = BOARD.halfW + 0.45; // clouds travel from -PATH_X to +PATH_X (or back)
const SHADOW_Y = BOARD.top + 0.012;
/** Light direction (matches the key light in GameCanvas) for offsetting the soft shadow. */
const LIGHT = { x: -0.9 / 2.4, z: 1.3 / 2.4 };

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One cloud: a row of base puffs (biggest in the middle), a few crown puffs, a squashed flat bottom. ~1 unit wide. */
function buildCloud(seed: number): BufferGeometry {
  const rnd = mulberry32(seed);
  const parts: BufferGeometry[] = [];
  const puff = (x: number, y: number, z: number, r: number) => {
    const g = new SphereGeometry(r, 20, 14);
    g.translate(x, y, z);
    parts.push(g);
  };
  const base = 3 + Math.floor(rnd() * 3); // 3..5 base puffs
  for (let i = 0; i < base; i++) {
    const u = base === 1 ? 0 : i / (base - 1) - 0.5; // -0.5..0.5
    const r = 0.17 + 0.1 * (1 - Math.abs(u) * 2) + rnd() * 0.04;
    puff(u * 0.72, r * 0.35, (rnd() - 0.5) * 0.12, r);
  }
  const crown = 1 + Math.floor(rnd() * 3); // 1..3 crown puffs
  for (let i = 0; i < crown; i++) {
    const u = crown === 1 ? (rnd() - 0.5) * 0.2 : (i / (crown - 1) - 0.5) * 0.4 + (rnd() - 0.5) * 0.08;
    puff(u, 0.2 + rnd() * 0.07, (rnd() - 0.5) * 0.08, 0.17 + rnd() * 0.07);
  }
  for (let i = 0; i < 2; i++) puff((rnd() - 0.5) * 0.5, 0.06, (i ? 1 : -1) * (0.1 + rnd() * 0.05), 0.13 + rnd() * 0.04); // depth
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  // flatten the underside so it sits like a cartoon cloud
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 0) pos.setY(i, y * 0.25);
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

function useShadowTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(40,60,90,1)');
    grad.addColorStop(0.55, 'rgba(40,60,90,0.55)');
    grad.addColorStop(1, 'rgba(40,60,90,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, []);
}

interface Drift {
  shape: number; dir: 1 | -1; x: number; z: number; y: number; size: number; speed: number;
  phase: number; delay: number; flip: boolean;
}

function spawn(d: Drift, rnd: () => number, midway: boolean) {
  d.shape = Math.floor(rnd() * SHAPES);
  d.dir = rnd() < 0.5 ? 1 : -1;
  d.z = (rnd() * 2 - 1) * (BOARD.halfD - 0.05);
  d.y = 0.32 + rnd() * 0.2;
  d.size = 0.14 + rnd() * 0.09;
  d.speed = 0.009 + rnd() * 0.008; // m/s: ~3–5 minutes per crossing
  d.phase = rnd() * Math.PI * 2;
  d.flip = rnd() < 0.5;
  d.x = midway ? (rnd() * 2 - 1) * BOARD.halfW : -d.dir * PATH_X;
  d.delay = midway ? 0 : 4 + rnd() * 18;
}

const ramp = (a: number, b: number, v: number) => Math.min(1, Math.max(0, (v - a) / (b - a)));

export function Clouds() {
  const geos = useMemo(() => Array.from({ length: SHAPES }, (_, i) => buildCloud(17 + i * 101)), []);
  const shadowTex = useShadowTexture();
  const mats = useMemo(() => Array.from({ length: ACTIVE }, () => new MeshStandardMaterial({
    color: '#ffffff', emissive: '#f4f8ff', emissiveIntensity: 0.32, roughness: 1, metalness: 0,
    transparent: true, depthWrite: false, // badges and labels stay readable on top
  })), []);
  const shadowMats = useMemo(() => Array.from({ length: ACTIVE }, () => new MeshBasicMaterial({
    map: shadowTex, transparent: true, depthWrite: false, opacity: 0, toneMapped: false,
  })), [shadowTex]);
  useEffect(() => () => {
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    for (const m of shadowMats) m.dispose();
    shadowTex.dispose();
  }, [geos, mats, shadowMats, shadowTex]);

  const drifts = useMemo(() => {
    const rnd = Math.random;
    return Array.from({ length: ACTIVE }, (_, i) => {
      const d = {} as Drift;
      spawn(d, rnd, i < ACTIVE - 1); // most start on the board, one waits off-screen
      return d;
    });
  }, []);

  const groups = useRef<(Group | null)[]>([]);
  const clouds = useRef<(Mesh | null)[]>([]);
  const shadows = useRef<(Mesh | null)[]>([]);

  useFrame(({ camera, clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const t = clock.elapsedTime;
    for (let i = 0; i < ACTIVE; i++) {
      const d = drifts[i], g = groups.current[i], cloud = clouds.current[i], shadow = shadows.current[i];
      if (!g || !cloud || !shadow) continue;
      if (d.delay > 0) { d.delay -= dt; g.visible = false; continue; }
      d.x += d.dir * d.speed * dt;
      if (d.x * d.dir > PATH_X) { spawn(d, Math.random, false); g.visible = false; continue; }
      g.visible = true;
      if (cloud.geometry !== geos[d.shape]) cloud.geometry = geos[d.shape];

      const bob = Math.sin(t * 0.35 + d.phase) * 0.006;
      const breathe = 1 + Math.sin(t * 0.5 + d.phase * 1.7) * 0.02;
      cloud.position.set(d.x, d.y + bob, d.z);
      cloud.scale.set(d.size * (d.flip ? -1 : 1) * breathe, d.size * breathe, d.size * 0.8 * breathe);

      // fade in/out at the ends of the path, and away when the camera comes close
      const edge = 1 - ramp(BOARD.halfW + 0.05, PATH_X, Math.abs(d.x));
      const near = ramp(0.45, 1.05, camera.position.distanceTo(cloud.position));
      const a = edge * near;
      mats[i].opacity = 0.9 * a;
      cloud.visible = a > 0.01;

      // soft shadow on the map, offset along the key light
      const h = d.y - SHADOW_Y;
      shadow.position.set(d.x + LIGHT.x * h, SHADOW_Y, d.z + LIGHT.z * h);
      shadow.scale.set(d.size * 1.25, d.size * 0.75, 1);
      shadowMats[i].opacity = 0.085 * edge * (0.4 + 0.6 * near);
      shadow.visible = Math.abs(shadow.position.x) < BOARD.halfW + 0.1 && Math.abs(shadow.position.z) < BOARD.halfD + 0.1;
    }
  });

  return (
    <>
      {drifts.map((d, i) => (
        <group key={i} ref={(el) => { groups.current[i] = el; }} visible={false}>
          <mesh ref={(el) => { clouds.current[i] = el; }} geometry={geos[d.shape]} material={mats[i]} raycast={() => null} renderOrder={2} />
          <mesh ref={(el) => { shadows.current[i] = el; }} material={shadowMats[i]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null} renderOrder={1}>
            <circleGeometry args={[1, 32]} />
          </mesh>
        </group>
      ))}
    </>
  );
}
