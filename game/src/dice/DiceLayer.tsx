// <DiceLayer/> — rendered inside the R3F <Canvas>. A cute wooden tray pops up in front of the
// camera (lower-middle of the screen) whenever a battle is played, the pre-simulated throw is
// replayed with per-die face offsets, then the dice line up by value and the losses are shown.
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { onEvent } from '../state/director';
import { diceJobs, playBattle, rollDice, sfx, type DiceJob } from './controller';
import { showFaceUp, quatConj, quatMul, type FaceValue, type Quat } from './faces';
import { DieModel, TrayModel, type DieSide } from './models';
import { initPhysics, poseAt, SIM_HZ, TRAY_RADIUS } from './sim';

const SLOTS: DieSide[] = ['attacker', 'attacker', 'attacker', 'defender', 'defender'];
/** Outer radius of the tray visual (rim) in tray units. */
const TRAY_OUTER = TRAY_RADIUS * 1.165;
const OPEN_TIME = 0.38;
const LINEUP_TIME = 0.55;
const HOLD_TIME = 0.9;
const CLOSE_DELAY = 0.3;
const COL_GAP = 1.4;
const ROW_Z = 1.05;

type Phase = 'idle' | 'throw' | 'lineup' | 'hold';

interface LabelState { key: number; attacker: { text: string; color: string } | null; defender: { text: string; color: string } | null; x: number }

let glowTex: THREE.Texture | null = null;
function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

const easeOutBack = (t: number) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const toQ = (q: Quat) => new THREE.Quaternion(q[0], q[1], q[2], q[3]);

interface SlotState {
  die: number; // index into job.sim.dice, -1 if unused
  from: THREE.Vector3; fromQ: THREE.Quaternion;
  to: THREE.Vector3; toQ: THREE.Quaternion;
  result: 'win' | 'lose' | null;
}

/** `tilt`: degrees the tray faces the viewer (52 default; 90 = straight top-down view of the felt, for checking faces). */
export function DiceLayer({ tilt = 52 }: { tilt?: number } = {}) {
  const root = useRef<THREE.Group>(null);
  const tray = useRef<THREE.Group>(null);
  const slotOuter = useRef<(THREE.Group | null)[]>([]);
  const slotInner = useRef<(THREE.Group | null)[]>([]);
  const shadows = useRef<(THREE.Mesh | null)[]>([]);
  const glows = useRef<(THREE.Mesh | null)[]>([]);
  const light = useRef<THREE.PointLight>(null);
  const [label, setLabel] = useState<LabelState | null>(null);

  const st = useRef({
    open: 0, // 0 closed … 1 open (linear progress)
    phase: 'idle' as Phase,
    job: null as DiceJob | null,
    t: 0,
    rate: 1,
    closeTimer: 0,
    landed: false,
    chain: 0,
    slots: SLOTS.map((): SlotState => ({ die: -1, from: new THREE.Vector3(), fromQ: new THREE.Quaternion(), to: new THREE.Vector3(), toQ: new THREE.Quaternion(), result: null })),
  });

  // register with the director + expose test hook
  useEffect(() => {
    void initPhysics();
    const unmount = diceJobs.mount();
    const off = onEvent('battle', (ev, ctx) => playBattle(ev.roll, ctx.after.version, ctx.speed || 1));
    if (import.meta.env.DEV) (window as unknown as { __riskDice: unknown }).__riskDice = { rollDice };
    return () => { off(); unmount(); };
  }, []);

  const glowMat = useMemo(() => SLOTS.map(() => new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })), []);
  const shadowMat = useMemo(() => new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#000000', transparent: true, depthWrite: false, opacity: 0.35 }), []);

  const tmpV = useMemo(() => new THREE.Vector3(), []);
  const tmpQ = useMemo(() => new THREE.Quaternion(), []);
  const tmpS = useMemo(() => new THREE.Vector3(), []);
  const labelShown = useRef(false);
  const pendingLabel = useRef<LabelState | null>(null);
  const tiltQ = useMemo(() => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(tilt)), [tilt]);
  const mWorld = useMemo(() => new THREE.Matrix4(), []);
  const mParentInv = useMemo(() => new THREE.Matrix4(), []);

  function startJob(job: DiceJob) {
    const s = st.current;
    const chained = s.open >= 1 && (s.phase === 'idle' && s.closeTimer > 0);
    s.chain = chained ? s.chain + 1 : 0;
    s.rate = job.speed * (s.chain > 0 ? 2 : 1);
    s.job = job;
    s.phase = 'throw';
    s.t = 0;
    s.landed = false;
    setLabel(null);
    const counts = { attacker: 0, defender: 0 };
    s.slots.forEach((sl) => { sl.die = -1; sl.result = null; });
    job.sim.dice.forEach((d, i) => {
      const slot = d.side === 'attacker' ? counts.attacker++ : 3 + counts.defender++;
      if (slot < SLOTS.length) s.slots[slot].die = i;
    });
    s.slots.forEach((sl, i) => {
      const inner = slotInner.current[i];
      if (inner && sl.die >= 0) inner.quaternion.copy(toQ(job.sim.dice[sl.die].offset));
      inner?.scale.setScalar(1);
    });
    sfx('diceRoll');
  }

  function startLineup(job: DiceJob) {
    const s = st.current;
    s.phase = 'lineup';
    s.t = 0;
    const sim = job.sim;
    const att = sim.dice.map((d, i) => ({ d, i })).filter((x) => x.d.side === 'attacker').sort((a, b) => b.d.value - a.d.value);
    const def = sim.dice.map((d, i) => ({ d, i })).filter((x) => x.d.side === 'defender').sort((a, b) => b.d.value - a.d.value);
    const cols = Math.max(att.length, def.length);
    const x0 = -((cols - 1) / 2) * COL_GAP - 0.55;
    const rank = new Map<number, number>();
    att.forEach((x, k) => rank.set(x.i, k));
    def.forEach((x, k) => rank.set(x.i, k));
    const pairs = Math.min(att.length, def.length);
    s.slots.forEach((sl, si) => {
      if (sl.die < 0) return;
      const d = sim.dice[sl.die];
      const outer = slotOuter.current[si]!;
      sl.from.copy(outer.position);
      sl.fromQ.copy(outer.quaternion);
      const k = rank.get(sl.die)!;
      sl.to.set(x0 + k * COL_GAP, 0.5, d.side === 'attacker' ? -ROW_Z : ROW_Z);
      // outer · offset = showFaceUp(value)  →  outer = showFaceUp · offset⁻¹
      sl.toQ.copy(toQ(quatMul(showFaceUp(d.value as FaceValue), quatConj(d.offset))));
      if (k < pairs) {
        const a = att[k].d.value, dv = def[k].d.value;
        const attackerWins = a > dv;
        sl.result = (d.side === 'attacker') === attackerWins ? 'win' : 'lose';
      }
    });
    const labelX = x0 + (cols - 1) * COL_GAP + 1.45;
    pendingLabel.current = ({
      key: Math.random(),
      x: labelX,
      attacker: job.attackerLosses > 0 ? { text: `-${job.attackerLosses}`, color: job.attackerColor } : null,
      defender: job.defenderLosses > 0 ? { text: `-${job.defenderLosses}`, color: job.defenderColor } : null,
    });
  }

  useFrame((state, rawDt) => {
    const s = st.current;
    const dt = Math.min(rawDt, 0.05);
    const g = root.current, tr = tray.current;
    if (!g || !tr) return;

    // ---- queue / state machine
    if (!s.job && diceJobs.pending > 0 && (s.phase === 'idle')) {
      const next = diceJobs.take()!;
      startJob(next);
    }
    const job = s.job;
    const wantOpen = !!job || s.closeTimer > 0 || diceJobs.pending > 0;
    const openSpeed = (job?.speed ?? 1) / OPEN_TIME;
    s.open = clamp01(s.open + (wantOpen ? 1 : -1) * dt * openSpeed);
    if (!job && s.closeTimer > 0) s.closeTimer -= dt * 1;
    if (!wantOpen && labelShown.current) { labelShown.current = false; setLabel(null); }

    if (job && s.open > 0.55) {
      s.t += dt * s.rate;
      if (s.phase === 'throw') {
        const f = s.t * SIM_HZ;
        if (!s.landed && f >= job.sim.impactFrame) { s.landed = true; sfx('diceLand'); }
        if (f >= job.sim.frames - 1) startLineup(job);
      } else if (s.phase === 'lineup') {
        if (s.t >= LINEUP_TIME) {
          s.phase = 'hold'; s.t = 0;
          if (pendingLabel.current) { labelShown.current = true; setLabel(pendingLabel.current); pendingLabel.current = null; }
          diceJobs.notifyResult();
          sfx(job.defenderLosses >= job.attackerLosses ? 'battleWin' : 'battleLose');
        }
      } else if (s.phase === 'hold') {
        if (s.t >= HOLD_TIME) {
          s.phase = 'idle';
          s.job = null;
          s.closeTimer = CLOSE_DELAY / job.speed;
          job.resolve();
        }
      }
    }

    // ---- place the tray in front of the camera
    g.visible = s.open > 0.001;
    if (!g.visible) return;
    const cam = state.camera;
    let visH: number, visW: number, d: number;
    if ((cam as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const pc = cam as THREE.PerspectiveCamera;
      // just past the near plane so board geometry (the battle camera gets close) never covers the tray
      d = Math.max(pc.near * 6, 0.02);
      visH = 2 * d * Math.tan(THREE.MathUtils.degToRad(pc.fov) / 2) / (pc.zoom || 1);
      visW = visH * pc.aspect;
    } else {
      const oc = cam as THREE.OrthographicCamera;
      d = Math.max(oc.near + 1, 1);
      visH = (oc.top - oc.bottom) / oc.zoom;
      visW = (oc.right - oc.left) / oc.zoom;
    }
    const width = Math.min(visW * 0.3, visH * 0.52);
    const scale = width / (2 * TRAY_OUTER);
    const eased = wantOpen ? easeOutBack(s.open) : easeInOut(s.open);
    const yRest = -visH / 2 + width * 0.5 + visH * 0.035;
    const y = yRest - (1 - eased) * (visH * 0.55 + width * 0.3);
    tmpV.set(0, y, -d).applyQuaternion(cam.quaternion).add(cam.position);
    tmpQ.copy(cam.quaternion).multiply(tiltQ);
    mWorld.compose(tmpV, tmpQ, tmpS.setScalar(scale));
    if (g.parent) { g.parent.updateWorldMatrix(true, false); mParentInv.copy(g.parent.matrixWorld).invert(); mWorld.premultiply(mParentInv); }
    mWorld.decompose(g.position, g.quaternion, g.scale);
    if (light.current) light.current.distance = 30 * scale;

    // ---- dice
    s.slots.forEach((sl, i) => {
      const outer = slotOuter.current[i], inner = slotInner.current[i];
      const sh = shadows.current[i], gl = glows.current[i];
      if (!outer || !inner || !sh || !gl) return;
      const active = !!job && sl.die >= 0 || (!job && sl.die >= 0 && s.phase === 'idle');
      outer.visible = active;
      sh.visible = active;
      gl.visible = active && sl.result !== null && (s.phase === 'hold' || s.phase === 'lineup' || !job);
      if (!active) return;
      if (job && s.phase === 'throw') {
        const f = s.t * SIM_HZ;
        const f0 = Math.floor(f), a = f - f0;
        const p0 = poseAt(job.sim, f0, sl.die), p1 = poseAt(job.sim, f0 + 1, sl.die);
        outer.position.set(p0.p[0] + (p1.p[0] - p0.p[0]) * a, p0.p[1] + (p1.p[1] - p0.p[1]) * a, p0.p[2] + (p1.p[2] - p0.p[2]) * a);
        outer.quaternion.copy(toQ(p0.q)).slerp(toQ(p1.q), a);
      } else if (job && s.phase === 'lineup') {
        const stagger = (i % 3) * 0.06;
        const k = easeInOut(clamp01((s.t - stagger) / (LINEUP_TIME - 0.12)));
        outer.position.lerpVectors(sl.from, sl.to, k);
        outer.position.y += Math.sin(Math.PI * k) * 1.1;
        outer.quaternion.slerpQuaternions(sl.fromQ, sl.toQ, k);
      } else if (job && s.phase === 'hold') {
        outer.position.copy(sl.to);
        outer.quaternion.copy(sl.toQ);
        const k = clamp01(s.t / 0.25);
        if (sl.result === 'win') {
          outer.position.y = 0.5 + Math.sin(Math.min(1, s.t / 0.35) * Math.PI) * 0.45;
          inner.scale.setScalar(1 + 0.12 * Math.sin(Math.min(1, s.t / 0.35) * Math.PI));
        } else if (sl.result === 'lose') {
          inner.scale.setScalar(1 - 0.12 * k);
          outer.position.y = 0.5 - 0.06 * k;
          outer.position.x = sl.to.x + Math.sin(s.t * 60) * 0.05 * (1 - k);
        }
      }
      // blob shadow + glow on the felt
      const hgt = Math.max(0, outer.position.y - 0.5);
      sh.position.set(outer.position.x, 0.012, outer.position.z);
      sh.scale.setScalar(1.7 + hgt * 0.35);
      (sh.material as THREE.MeshBasicMaterial).opacity = 0.42 / (1 + hgt * 0.6);
      gl.position.set(sl.to.x, 0.02, sl.to.z);
      const gm = gl.material as THREE.MeshBasicMaterial;
      const pulse = s.phase === 'hold' ? clamp01(s.t / 0.2) : s.phase === 'lineup' ? clamp01((s.t - LINEUP_TIME * 0.6) / (LINEUP_TIME * 0.4)) : 1;
      gm.color.set(sl.result === 'win' ? '#FFD34D' : '#FF4B5C');
      gm.opacity = (sl.result === 'win' ? 1 : 0.75) * pulse;
      gl.scale.setScalar(sl.result === 'win' ? 2.6 + Math.sin(state.clock.elapsedTime * 6) * 0.12 : 2.2);
    });
  });

  return (
    <group ref={root} visible={false}>
      <group ref={tray}>
        <TrayModel />
        <pointLight ref={light} position={[1.5, 7, 3]} intensity={2.2} decay={0} distance={30} />
        <pointLight position={[-3, 4, -2]} intensity={0.6} decay={0} distance={30} />
        {SLOTS.map((side, i) => (
          <group key={i}>
            <mesh ref={(m) => { shadows.current[i] = m; }} rotation-x={-Math.PI / 2} material={shadowMat} renderOrder={1}>
              <planeGeometry args={[1, 1]} />
            </mesh>
            <mesh ref={(m) => { glows.current[i] = m; }} rotation-x={-Math.PI / 2} material={glowMat[i]} renderOrder={2} visible={false}>
              <planeGeometry args={[1, 1]} />
            </mesh>
            <group ref={(o) => { slotOuter.current[i] = o; }} visible={false}>
              <group ref={(o) => { slotInner.current[i] = o; }}>
                <DieModel side={side} />
              </group>
            </group>
          </group>
        ))}
        {label && (
          <>
            {label.attacker && <LossLabel key={`a${label.key}`} position={[label.x, 0.6, -ROW_Z]} {...label.attacker} />}
            {label.defender && <LossLabel key={`d${label.key}`} position={[label.x, 0.6, ROW_Z]} {...label.defender} />}
          </>
        )}
      </group>
    </group>
  );
}

function LossLabel({ position, text, color }: { position: [number, number, number]; text: string; color: string }) {
  return (
    <Html position={position} center zIndexRange={[40, 30]} style={{ pointerEvents: 'none' }}>
      <div
        style={{
          fontFamily: "'Fredoka', 'Nunito', system-ui, sans-serif",
          fontWeight: 700,
          fontSize: 30,
          lineHeight: 1,
          color: '#fff',
          background: color,
          padding: '4px 12px 6px',
          borderRadius: 999,
          border: '3px solid #fff',
          boxShadow: '0 4px 0 rgba(0,0,0,0.18), 0 6px 14px rgba(0,0,0,0.25)',
          textShadow: '0 2px 0 rgba(0,0,0,0.25)',
          whiteSpace: 'nowrap',
          animation: 'riskDicePop 0.35s cubic-bezier(.3,1.6,.5,1) both',
        }}
      >
        {text}
        <style>{'@keyframes riskDicePop{from{transform:scale(0.2) translateY(10px);opacity:0}to{transform:scale(1);opacity:1}}'}</style>
      </div>
    </Html>
  );
}
