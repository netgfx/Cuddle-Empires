// 2.5D camera: drei CameraControls with clamped angles/distance, overview fit to aspect,
// focus on territory / battle from ui.camera, keyboard pan/zoom, Home / double-click → overview.
import { CameraControls, CameraControlsImpl } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useRef } from 'react';
import { Box3, MathUtils, type PerspectiveCamera, Vector3 } from 'three';
import { useUI, type CameraFocus } from '../state/uiStore';
import { BOARD, cameraInfo, SOCKET } from './sceneConfig';

const DEG = Math.PI / 180;
const OVERVIEW_POLAR = 35 * DEG; // 55° elevation
const TARGET_Y = BOARD.top;
const ACTION = CameraControlsImpl.ACTION;

const _corner = new Vector3();
const CORNERS: [number, number, number][] = [];
for (const x of [-1, 1]) for (const z of [-1, 1]) for (const y of [0, 0.05]) CORNERS.push([x * (BOARD.halfW + 0.01), y, z * (BOARD.halfD + 0.01)]);

/** Distance at which the whole board (all frame corners) fits the viewport from the overview angle. */
function overviewDistance(cam: PerspectiveCamera): number {
  const probe = cam.clone();
  probe.aspect = cam.aspect;
  probe.updateProjectionMatrix();
  const fits = (d: number) => {
    const [px, py, pz, tx, ty, tz] = posFor(0, 0, d);
    probe.position.set(px, py, pz);
    probe.lookAt(tx, ty, tz);
    probe.updateMatrixWorld(true);
    for (const c of CORNERS) {
      _corner.set(c[0], c[1], c[2]).project(probe);
      if (Math.abs(_corner.x) > 0.97 || Math.abs(_corner.y) > 0.9) return false;
    }
    return true;
  };
  let lo = 0.5, hi = 12;
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
  return hi;
}

function posFor(tx: number, tz: number, dist: number, polar = OVERVIEW_POLAR, azimuth = 0): [number, number, number, number, number, number] {
  return [
    tx + dist * Math.sin(polar) * Math.sin(azimuth),
    TARGET_Y + dist * Math.cos(polar),
    tz + dist * Math.sin(polar) * Math.cos(azimuth),
    tx, TARGET_Y, tz,
  ];
}

export function CameraRig() {
  const ref = useRef<CameraControls>(null);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  const overviewDist = useRef(2.5);

  const apply = useCallback((focus: CameraFocus, smooth = true) => {
    const c = ref.current;
    if (!c) return;
    const ov = overviewDist.current;
    if (focus.kind === 'overview') {
      void c.setLookAt(...posFor(0, 0, ov), smooth);
    } else if (focus.kind === 'territory') {
      const p = SOCKET[focus.id];
      void c.setLookAt(...posFor(p.x, p.z, Math.min(ov, 0.75), 38 * DEG), smooth);
    } else {
      const a = SOCKET[focus.from], b = SOCKET[focus.to];
      let mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      let sep = Math.hypot(a.x - b.x, a.z - b.z);
      if (Math.abs(a.x - b.x) > BOARD.halfW) { mx = a.x; mz = a.z; sep = 0.3; } // wrap-around pair: frame the attacker
      const dist = MathUtils.clamp(sep * 2.6 + 0.6, 0.85, ov);
      // aim a little south of the pair so it sits in the upper-middle (the dice tray uses the lower-middle)
      void c.setLookAt(...posFor(mx, mz + dist * 0.09, dist, 40 * DEG), smooth);
    }
  }, []);

  // configure controls once
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.mouseButtons.left = ACTION.SCREEN_PAN;
    c.mouseButtons.right = ACTION.ROTATE;
    c.mouseButtons.middle = ACTION.DOLLY;
    c.mouseButtons.wheel = ACTION.DOLLY;
    c.touches.one = ACTION.TOUCH_SCREEN_PAN;
    c.touches.two = ACTION.TOUCH_DOLLY_TRUCK;
    c.touches.three = ACTION.TOUCH_ROTATE;
    c.dollyToCursor = true;
    c.smoothTime = 0.35;
    c.draggingSmoothTime = 0.12;
    c.minPolarAngle = 20 * DEG;
    c.maxPolarAngle = 70 * DEG;
    c.minAzimuthAngle = -35 * DEG;
    c.maxAzimuthAngle = 35 * DEG;
    c.minDistance = 0.25;
    c.setBoundary(new Box3(new Vector3(-BOARD.halfW + 0.05, TARGET_Y - 0.01, -BOARD.halfD + 0.05), new Vector3(BOARD.halfW - 0.05, TARGET_Y + 0.01, BOARD.halfD - 0.05)));
    c.boundaryFriction = 0.2;
  }, []);

  // refit on resize (keep current focus)
  useEffect(() => {
    camera.aspect = size.width / Math.max(1, size.height);
    camera.updateProjectionMatrix();
    overviewDist.current = overviewDistance(camera);
    cameraInfo.overview = overviewDist.current;
    if (ref.current) ref.current.maxDistance = overviewDist.current * 1.25;
    apply(useUI.getState().camera, false);
  }, [size.width, size.height, camera, apply]);

  // dev/e2e helper: project a territory's marker to client pixels
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __riskScene?: unknown };
    w.__riskScene = {
      project: (id: keyof typeof SOCKET) => {
        const v = SOCKET[id].clone().project(camera);
        const r = gl.domElement.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      },
    };
    return () => { delete w.__riskScene; };
  }, [camera, gl]);

  // react to ui.camera
  useEffect(() => useUI.subscribe((s, prev) => { if (s.camera !== prev.camera) apply(s.camera); }), [apply]);

  // Home / keyboard pan + zoom / double-click on empty space
  const keys = useRef(new Set<string>());
  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      if (e.key === 'Home') { useUI.getState().focus({ kind: 'overview' }); return; }
      if (e.key === '+' || e.key === '=') void ref.current?.dolly(overviewDist.current * 0.12, true);
      else if (e.key === '-' || e.key === '_') void ref.current?.dolly(-overviewDist.current * 0.12, true);
      keys.current.add(e.key.toLowerCase());
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    const dbl = () => {
      const ui = useUI.getState();
      if (ui.hovered) ui.focus({ kind: 'territory', id: ui.hovered });
      else ui.focus({ kind: 'overview' });
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    gl.domElement.addEventListener('dblclick', dbl);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      gl.domElement.removeEventListener('dblclick', dbl);
    };
  }, [gl]);

  useFrame((_, dt) => {
    const c = ref.current;
    const k = keys.current;
    if (!c || k.size === 0) return;
    const speed = c.distance * 0.9 * dt;
    let x = 0, z = 0;
    if (k.has('arrowleft') || k.has('a')) x -= speed;
    if (k.has('arrowright') || k.has('d')) x += speed;
    if (k.has('arrowup') || k.has('w')) z += speed;
    if (k.has('arrowdown') || k.has('s')) z -= speed;
    if (x) void c.truck(x, 0, true);
    if (z) void c.forward(z, true);
  });

  return <CameraControls ref={ref} makeDefault />;
}
