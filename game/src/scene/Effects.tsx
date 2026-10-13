// Transient scene effects (floating "+N"/"-N" texts, star bursts) and the director
// event animations that drive pawns, rings, tiles and the camera.
import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, OctahedronGeometry, Quaternion, Vector3,
  type Group, type Mesh,
} from 'three';
import type { GameState, TerritoryId } from '../game/types';
import { waitDiceResult } from '../dice/controller';
import { onEvent } from '../state/director';
import { useGame } from '../state/gameStore';
import { useUI } from '../state/uiStore';
import { arcSegments } from './AttackArcs';
import { FONT_URL } from './Pawns';
import { ATTACK_COLOR, cachedColor, composition, playerColor, SOCKET, wait } from './sceneConfig';
import { displayed, fx, travellers, useDisplay, useEffectsStore, type Traveller } from './sceneState';
import { tween } from './tween';

const noRaycast = () => null;
const speed = () => Math.max(0.25, useUI.getState().animSpeed || 1);

// ------------------------------------------------------------ floating text

function FloatingText({ id, text, color, pos }: { id: number; text: string; color: string; pos: [number, number, number] }) {
  const g = useRef<Group>(null);
  const t = useRef<Mesh & { fillOpacity: number; outlineOpacity: number }>(null);
  useEffect(() => {
    const st = { y: 0, o: 0, s: 0.4 };
    const dur = 1000 / speed();
    const upd = () => {
      if (g.current) { g.current.position.y = pos[1] + st.y; g.current.scale.setScalar(st.s); }
      if (t.current) { t.current.fillOpacity = st.o; t.current.outlineOpacity = st.o; }
    };
    void Promise.all([
      tween(st, { y: [0, 0.03], s: [0.4, 1] }, dur, 'outBack(2)', upd),
      tween(st, { o: [0, 1] }, dur * 0.2, 'linear').then(() => wait(dur * 0.45)).then(() => tween(st, { o: [1, 0] }, dur * 0.35, 'inQuad', upd)),
    ]).then(() => useEffectsStore.getState().remove(id));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group ref={g} position={pos} scale={0.4}>
      <Billboard>
        <Text
          ref={t} font={FONT_URL} fontSize={0.026} color={color} outlineWidth={0.0025} outlineColor="#ffffff"
          anchorX="center" anchorY="middle" renderOrder={30} material-depthTest={false} material-toneMapped={false}
          raycast={noRaycast} fillOpacity={0}
        >
          {text}
        </Text>
      </Billboard>
    </group>
  );
}

// ------------------------------------------------------------ star burst

const BURST_N = 22;
const starGeom = new OctahedronGeometry(0.004, 0);
const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
const _p = new Vector3();

function Burst({ id, color, pos }: { id: number; color: string; pos: [number, number, number] }) {
  const mesh = useRef<InstancedMesh>(null);
  const mat = useMemo(() => new MeshBasicMaterial({ color, toneMapped: false, transparent: true }), [color]);
  const parts = useMemo(() => Array.from({ length: BURST_N }, (_, i) => {
    const a = (i / BURST_N) * Math.PI * 2 + Math.random() * 0.4;
    const up = 0.12 + Math.random() * 0.1;
    const out = 0.04 + Math.random() * 0.05;
    return { v: new Vector3(Math.cos(a) * out, up, Math.sin(a) * out), spin: Math.random() * 10, tint: i % 3 };
  }), []);
  const age = useRef(0);
  const life = 1.0 / speed();
  useEffect(() => {
    const m = mesh.current;
    if (m) {
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      const white = new Color('#ffffff'), gold = new Color('#ffd84d'), base = new Color(color);
      parts.forEach((p, i) => m.setColorAt(i, p.tint === 0 ? white : p.tint === 1 ? gold : base));
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    return () => mat.dispose();
  }, [mat, parts, color]);
  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    age.current += dt;
    const t = age.current / life;
    if (t >= 1) { m.visible = false; useEffectsStore.getState().remove(id); return; }
    const tt = t * life * speed();
    for (let i = 0; i < BURST_N; i++) {
      const p = parts[i];
      _p.set(pos[0] + p.v.x * tt, pos[1] + p.v.y * tt - 0.22 * tt * tt, pos[2] + p.v.z * tt);
      _q.setFromAxisAngle(_s.set(0.3, 1, 0.2).normalize(), p.spin * tt);
      _s.setScalar(1.4 * (1 - t * 0.7));
      _m.compose(_p, _q, _s);
      m.setMatrixAt(i, _m);
    }
    m.instanceMatrix.needsUpdate = true;
    mat.opacity = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
  });
  return <instancedMesh ref={mesh} args={[starGeom, mat, BURST_N]} raycast={noRaycast} frustumCulled={false} renderOrder={25} />;
}

export function Effects() {
  const effects = useEffectsStore((s) => s.effects);
  return (
    <group>
      {effects.map((e) => e.kind === 'text'
        ? <FloatingText key={e.id} id={e.id} text={e.text} color={e.color} pos={e.pos} />
        : <Burst key={e.id} id={e.id} color={e.color} pos={e.pos} />)}
    </group>
  );
}

// ------------------------------------------------------------ event animations

function floatText(id: TerritoryId, text: string, color: string) {
  const s = SOCKET[id];
  useEffectsStore.getState().add({ kind: 'text', text, color, pos: [s.x, s.y + 0.045, s.z] });
}
function burst(id: TerritoryId, color: string) {
  const s = SOCKET[id];
  useEffectsStore.getState().add({ kind: 'burst', color, pos: [s.x, s.y + 0.02, s.z] });
}
function cur(id: TerritoryId) {
  return displayed(useGame.getState().view, id) ?? { owner: null, armies: 0 };
}
function set(id: TerritoryId, owner: string | null, armies: number) {
  useDisplay.getState().setOverride(id, { owner, armies: Math.max(0, armies) });
}
function colorOf(state: GameState, player: string | null) { return playerColor(state, player); }

async function pop(id: TerritoryId, sp: number, from = 0.45) {
  fx[id].pop = from;
  await tween(fx[id], { pop: [from, 1] }, 650 / sp, 'outElastic(1, .55)');
}

/** Move a few travelling pawns along an arc from → to. */
async function hop(from: TerritoryId, to: TerritoryId, count: number, color: string, sp: number) {
  const segs = arcSegments(from, to, 0.0);
  const path = segs.flat();
  const comp = composition(count).slice(0, 3);
  const dist = SOCKET[from].distanceTo(SOCKET[to]);
  const dur = Math.min(700, Math.max(320, 300 + dist * 900)) / sp;
  const trs: Traveller[] = comp.map((kind) => ({ kind, color, pos: SOCKET[from].clone(), scale: 0.9, yaw: 0 }));
  const dx = SOCKET[to].x - SOCKET[from].x;
  const yaw = Math.abs(dx) > 1 ? (dx > 0 ? -Math.PI / 2 : Math.PI / 2) : Math.atan2(dx, SOCKET[to].z - SOCKET[from].z);
  for (const t of trs) { t.yaw = yaw; travellers.push(t); }
  const st = { t: 0 };
  const segLen = path.length - 1;
  const upd = () => {
    trs.forEach((tr, i) => {
      const u = Math.min(1, Math.max(0, st.t - i * 0.08) / (1 - 0.08 * (trs.length - 1)));
      const f = u * segLen;
      const k = Math.min(segLen - 1, Math.floor(f));
      tr.pos.lerpVectors(path[k], path[k + 1], f - k);
      // little bounce on top of the arc
      tr.pos.y += Math.abs(Math.sin(u * Math.PI * 3)) * 0.008;
      tr.pos.x += (i - (trs.length - 1) / 2) * 0.012;
    });
  };
  await tween(st, { t: [0, 1] }, dur, 'inOutSine', upd);
  for (const t of trs) { const i = travellers.indexOf(t); if (i >= 0) travellers.splice(i, 1); }
}

export function EventAnimations() {
  useEffect(() => {
    const offs = [
      onEvent('claimed', async (ev, ctx) => {
        const sp = ctx.speed || 1;
        set(ev.territory, ev.player, Math.max(1, cur(ev.territory).armies));
        fx[ev.territory].ringFrom.set('#ffffff');
        fx[ev.territory].ringMix = 0;
        void tween(fx[ev.territory], { ringMix: [0, 1] }, 400 / sp);
        await pop(ev.territory, sp, 0.2);
      }),
      onEvent('armiesPlaced', async (ev, ctx) => {
        const sp = ctx.speed || 1;
        const c = cur(ev.territory);
        set(ev.territory, ev.player, c.armies + ev.count);
        floatText(ev.territory, `+${ev.count}`, colorOf(ctx.after, ev.player));
        await pop(ev.territory, sp);
      }),
      onEvent('battle', async (ev, ctx) => {
        const sp = ctx.speed || 1;
        const { from, to, attackerLosses, defenderLosses } = ev.roll;
        const cam = useUI.getState().camera;
        if (!(cam.kind === 'battle' && cam.from === from && cam.to === to)) useUI.getState().focus({ kind: 'battle', from, to });
        useDisplay.getState().setBattle({ from, to, player: ev.roll.attacker });
        await waitDiceResult(6000 / sp); // losses appear when the dice tray shows the result
        const anims: Promise<void>[] = [];
        for (const [id, loss] of [[from, attackerLosses], [to, defenderLosses]] as [TerritoryId, number][]) {
          if (loss <= 0) continue;
          const c = cur(id);
          set(id, c.owner, c.armies - loss);
          floatText(id, `-${loss}`, ATTACK_COLOR);
          fx[id].flash = 1;
          anims.push(tween(fx[id], { flash: [1, 0] }, 500 / sp, 'inQuad'));
          anims.push(pop(id, sp * 1.3, 0.8));
        }
        await Promise.all(anims);
      }),
      onEvent('conquered', async (ev, ctx) => {
        const sp = ctx.speed || 1;
        const f = fx[ev.to];
        f.ringFrom.copy(cachedColor(colorOf(ctx.before ?? ctx.after, ev.previousOwner)));
        f.ringMix = 0;
        set(ev.to, ev.player, 0);
        const color = colorOf(ctx.after, ev.player);
        burst(ev.to, color);
        f.ringPulse = 1;
        await Promise.all([
          tween(f, { ringMix: [0, 1] }, 600 / sp, 'inOutQuad'),
          tween(f, { ringPulse: [1, 0] }, 800 / sp, 'outQuad'),
        ]);
      }),
      onEvent('armiesMoved', async (ev, ctx) => {
        const sp = ctx.speed || 1;
        const a = cur(ev.from);
        set(ev.from, a.owner, a.armies - ev.count);
        await hop(ev.from, ev.to, ev.count, colorOf(ctx.after, ev.player), sp);
        const b = cur(ev.to);
        set(ev.to, ev.player, b.armies + ev.count);
        await pop(ev.to, sp * 1.6, 0.7);
      }),
      onEvent('turnStarted', async (_ev, ctx) => {
        useUI.getState().focus({ kind: 'overview' });
        await wait(450 / (ctx.speed || 1));
      }),
    ];
    return () => { for (const off of offs) off(); };
  }, []);
  return null;
}
