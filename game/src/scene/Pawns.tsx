// Army pawns (instanced per kind), owner rings around the marker discs, and army count badges.
import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  Color, DynamicDrawUsage, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Quaternion,
  Shape, ShapeGeometry, TorusGeometry, Vector3, type Group,
} from 'three';
import { TERRITORY_IDS } from '../game/mapData';
import type { TerritoryId, TerritoryState } from '../game/types';
import { useGame } from '../state/gameStore';
import { usePawnModels, type PawnModel } from './pawnModels';
import {
  cachedColor, clusterLayout, clusterScale, composition, MAX_PIECES, PAWN_KINDS, playerColor, SOCKET, type PawnKind,
} from './sceneConfig';
import { fx, travellers, useDisplayedTerritories } from './sceneState';
import fontUrl from './fonts/Fredoka-SemiBold.ttf?url';

export const FONT_URL = fontUrl;
const LIFT = 0.003;
const CAPACITY = TERRITORY_IDS.length * MAX_PIECES + 16;
const noRaycast = () => null;

interface Piece { territory: TerritoryId; ox: number; oz: number; scale: number; yaw: number; color: Color }

// scratch objects (no per-frame allocations)
const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);
const _white = new Color('#ffffff');

function PawnInstances({ model, pieces, kind }: { model: PawnModel; pieces: Piece[]; kind: PawnKind }) {
  const body = useRef<InstancedMesh>(null);
  const team = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    for (const m of [body.current, team.current]) {
      if (!m) continue;
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.raycast = noRaycast;
      m.frustumCulled = false;
    }
  }, [model]);

  useFrame(() => {
    const b = body.current, t = team.current;
    if (!b || !t) return;
    let n = 0;
    for (let i = 0; i < pieces.length && n < CAPACITY; i++) {
      const pc = pieces[i];
      const f = fx[pc.territory];
      const sock = SOCKET[pc.territory];
      const sc = pc.scale * f.pop;
      _p.set(sock.x + pc.ox * f.pop, sock.y + f.hover * LIFT, sock.z + pc.oz * f.pop);
      _q.setFromAxisAngle(_up, pc.yaw);
      _s.setScalar(Math.max(sc, 1e-4));
      _m.compose(_p, _q, _s);
      b.setMatrixAt(n, _m);
      t.setMatrixAt(n, _m);
      t.setColorAt(n, pc.color);
      n++;
    }
    for (let i = 0; i < travellers.length && n < CAPACITY; i++) {
      const tr = travellers[i];
      if (tr.kind !== kind) continue;
      _q.setFromAxisAngle(_up, tr.yaw);
      _s.setScalar(Math.max(tr.scale, 1e-4));
      _m.compose(tr.pos, _q, _s);
      b.setMatrixAt(n, _m);
      t.setMatrixAt(n, _m);
      t.setColorAt(n, cachedColor(tr.color));
      n++;
    }
    b.count = n;
    t.count = n;
    b.instanceMatrix.needsUpdate = true;
    t.instanceMatrix.needsUpdate = true;
    if (t.instanceColor) t.instanceColor.needsUpdate = true;
  });

  // ensure instanceColor exists before first render
  useLayoutEffect(() => { team.current?.setColorAt(0, _white); }, [model]);

  return (
    <group>
      <instancedMesh ref={body} args={[model.body, model.bodyMat, CAPACITY]} castShadow receiveShadow />
      <instancedMesh ref={team} args={[model.team, model.teamMat, CAPACITY]} castShadow receiveShadow />
    </group>
  );
}

export function Pawns() {
  const models = usePawnModels();
  const terr = useDisplayedTerritories();
  const view = useGame((s) => s.view);

  const byKind = useMemo(() => {
    const out: Record<PawnKind, Piece[]> = { dog: [], pony: [], panda: [] };
    if (!terr) return out;
    for (const id of TERRITORY_IDS) {
      const t = terr[id];
      if (!t || !t.owner || t.armies <= 0) continue;
      const comp = composition(t.armies);
      const lay = clusterLayout(comp.length);
      const cs = clusterScale(comp.length);
      const color = cachedColor(playerColor(view, t.owner));
      comp.forEach((k, i) => {
        // deterministic little yaw jitter so a cluster looks hand-placed
        const yaw = (((id.charCodeAt(0) * 31 + i * 17) % 13) / 13 - 0.5) * 0.6;
        out[k].push({ territory: id, ox: lay[i][0] * cs, oz: lay[i][1] * cs, scale: cs, yaw, color });
      });
    }
    return out;
  }, [terr, view]);

  return (
    <group>
      {PAWN_KINDS.map((k) => models[k] && <PawnInstances key={k + (models[k]!.real ? 'r' : 'p')} kind={k} model={models[k]!} pieces={byKind[k]} />)}
    </group>
  );
}

// ------------------------------------------------------------ owner rings

const ringGeom = new TorusGeometry(0.0185, 0.0019, 8, 40);
ringGeom.rotateX(Math.PI / 2);

export function OwnerRings() {
  const terr = useDisplayedTerritories();
  const view = useGame((s) => s.view);
  const owners = useRef<Partial<Record<TerritoryId, TerritoryState>>>({});
  owners.current = terr ?? {};
  const viewRef = useRef(view);
  viewRef.current = view;

  const rings = useMemo(() => TERRITORY_IDS.map((id) => {
    const mat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, emissive: '#000000' });
    const mesh = new Mesh(ringGeom, mat);
    mesh.position.copy(SOCKET[id]);
    mesh.raycast = noRaycast;
    mesh.castShadow = true;
    return { id, mesh, mat };
  }), []);
  useEffect(() => () => { for (const r of rings) r.mat.dispose(); }, [rings]);

  useFrame(() => {
    for (const r of rings) {
      const t = owners.current[r.id];
      const f = fx[r.id];
      r.mesh.visible = !!t?.owner;
      if (!t?.owner) continue;
      const c = cachedColor(playerColor(viewRef.current, t.owner));
      if (f.ringMix >= 1) r.mat.color.copy(c);
      else r.mat.color.copy(f.ringFrom).lerp(c, f.ringMix);
      r.mat.emissive.copy(r.mat.color).multiplyScalar(0.25 + f.ringPulse * 0.6);
      r.mesh.position.y = SOCKET[r.id].y + 0.0006 + f.hover * LIFT;
      r.mesh.scale.setScalar(1 + f.ringPulse * 0.35);
    }
  });

  return <group>{rings.map((r) => <primitive key={r.id} object={r.mesh} />)}</group>;
}

// ------------------------------------------------------------ army count badges

function pillGeometry(w: number, h: number) {
  const r = h / 2, x = -w / 2, y = -h / 2;
  const s = new Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + r, r, Math.PI / 2, (3 * Math.PI) / 2, false);
  return new ShapeGeometry(s, 10);
}
const BADGE_H = 0.019;
const pills = [pillGeometry(0.022, BADGE_H), pillGeometry(0.03, BADGE_H), pillGeometry(0.038, BADGE_H)];
const outlinePills = [pillGeometry(0.0255, BADGE_H + 0.0035), pillGeometry(0.0335, BADGE_H + 0.0035), pillGeometry(0.0415, BADGE_H + 0.0035)];
const badgeOutlineMat = new MeshBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true, toneMapped: false });

function Badge({ id, armies, color }: { id: TerritoryId; armies: number; color: string }) {
  const g = useRef<Group>(null);
  const mat = useMemo(() => new MeshBasicMaterial({ color, depthTest: false, transparent: true, toneMapped: false }), [color]);
  useEffect(() => () => mat.dispose(), [mat]);
  const digits = String(armies).length;
  const idx = Math.min(digits, 3) - 1;
  const s = SOCKET[id];
  useFrame(({ camera }) => {
    const gr = g.current;
    if (!gr) return;
    // keep badges readable at the overview without being huge up close
    const k = Math.min(1.9, Math.max(0.85, camera.position.distanceTo(s) / 1.15));
    gr.scale.setScalar(k * (1 + fx[id].hover * 0.15));
    gr.position.y = s.y + 0.048 + 0.012 * (k - 1) + fx[id].hover * (LIFT + 0.004);
  });
  return (
    <group ref={g} position={[s.x, s.y + 0.05, s.z]}>
      <Billboard>
        <mesh geometry={outlinePills[idx]} material={badgeOutlineMat} renderOrder={20} raycast={noRaycast} />
        <mesh geometry={pills[idx]} material={mat} renderOrder={21} raycast={noRaycast} position={[0, 0, 0.0002]} />
        <Text
          font={FONT_URL} fontSize={0.015} color="#ffffff" anchorX="center" anchorY="middle"
          position={[0, 0.0006, 0.0004]} renderOrder={22} outlineWidth={0.0011} outlineColor="#1d2433" outlineOpacity={0.35}
          material-depthTest={false} material-toneMapped={false} raycast={noRaycast}
        >
          {String(armies)}
        </Text>
      </Billboard>
    </group>
  );
}

export function Badges() {
  const terr = useDisplayedTerritories();
  const view = useGame((s) => s.view);
  if (!terr) return null;
  return (
    <group>
      {TERRITORY_IDS.map((id) => {
        const t = terr[id];
        if (!t?.owner || t.armies <= 0) return null;
        return <Badge key={id} id={id} armies={t.armies} color={playerColor(view, t.owner)} />;
      })}
    </group>
  );
}
