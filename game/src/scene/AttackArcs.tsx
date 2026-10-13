// Curved dashed arcs: attack (attacker colour), fortify (green), and soft previews on hover.
import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { ConeGeometry, Quaternion, QuadraticBezierCurve3, Vector3, type Mesh } from 'three';
import type { TerritoryId } from '../game/types';
import { useGame } from '../state/gameStore';
import { highlightsFor } from '../state/interaction';
import { useUI } from '../state/uiStore';
import { BOARD, FORTIFY_COLOR, isWrapPair, playerColor, SOCKET } from './sceneConfig';
import { displayed, useDisplay } from './sceneState';

const SEG = 36;
const coneGeom = new ConeGeometry(0.011, 0.026, 14);
coneGeom.translate(0, -0.013, 0); // tip at origin
const _up = new Vector3(0, 1, 0);
const noRaycast = () => null;

/** One or two point lists from a → b (two when wrapping around the board edge). */
export function arcSegments(a: TerritoryId, b: TerritoryId, lift = 0.012, endLift = lift): Vector3[][] {
  const pa = SOCKET[a].clone().setY(SOCKET[a].y + lift);
  const pb = SOCKET[b].clone().setY(SOCKET[b].y + endLift);
  const arc = (p0: Vector3, p1: Vector3, h: number) => {
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    mid.y += h;
    return new QuadraticBezierCurve3(p0, mid, p1).getPoints(SEG);
  };
  if (isWrapPair(a, b)) {
    const edge = BOARD.halfW + 0.09;
    const outX = pa.x < 0 ? -edge : edge;
    const zMid = (pa.z + pb.z) / 2;
    const out = new Vector3(outX, pa.y + 0.03, zMid);
    const inn = new Vector3(-outX, pb.y + 0.03, zMid);
    return [arc(pa, out, 0.06), arc(inn, pb, 0.06)];
  }
  const d = pa.distanceTo(pb);
  return [arc(pa, pb, 0.09 + d * 0.3)];
}

function Arc({ from, to, color, opacity, width }: { from: TerritoryId; to: TerritoryId; color: string; opacity: number; width: number }) {
  const segs = useMemo(() => arcSegments(from, to, 0.03, 0.036), [from, to]);
  const lines = useRef<({ material: { dashOffset: number } } | null)[]>([]);
  const cone = useRef<Mesh>(null);
  const last = segs[segs.length - 1];
  const tip = last[last.length - 1];
  const dir = useMemo(() => tip.clone().sub(last[last.length - 3]).normalize(), [tip, last]);
  const quat = useMemo(() => new Quaternion().setFromUnitVectors(_up, dir), [dir]);
  useFrame((_, dt) => {
    for (const l of lines.current) if (l) l.material.dashOffset -= dt * 0.06;
    if (cone.current) {
      const s = 1 + 0.12 * Math.sin(performance.now() / 160);
      cone.current.scale.setScalar(s);
    }
  });
  return (
    <group>
      {segs.map((pts, i) => [0, 1].map((layer) => (
        <Line
          key={`${i}-${layer}`}
          ref={(r) => {
            const l = r as unknown as { material: { dashOffset: number; depthTest: boolean } } | null;
            if (l) l.material.depthTest = false;
            lines.current[i * 2 + layer] = l;
          }}
          points={pts}
          // layer 0: dark under-stroke for contrast on any continent colour
          color={layer === 0 ? '#1d2433' : color}
          lineWidth={layer === 0 ? width + 3.5 : width}
          dashed
          dashSize={0.018}
          gapSize={0.01}
          transparent
          opacity={layer === 0 ? opacity * 0.35 : opacity}
          renderOrder={14 + layer}
          raycast={noRaycast}
        />
      )))}
      <mesh ref={cone} geometry={coneGeom} position={tip} quaternion={quat} renderOrder={16} raycast={noRaycast}>
        <meshBasicMaterial color={color} transparent opacity={opacity} depthTest={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function AttackArcs() {
  const view = useGame((s) => s.view);
  const busy = useGame((s) => s.busy);
  const selected = useUI((s) => s.selected);
  const target = useUI((s) => s.target);
  const hovered = useUI((s) => s.hovered);
  const battle = useDisplay((s) => s.battle);
  const hl = useMemo(() => highlightsFor(view, selected), [view, selected, busy]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!view) return null;
  if (battle && !(selected === battle.from && target === battle.to)) {
    return <Arc from={battle.from} to={battle.to} color={playerColor(view, battle.player)} opacity={0.95} width={6} />;
  }
  if (!selected) return null;
  const phase = view.phase;
  if (phase !== 'attack' && phase !== 'fortify' && phase !== 'occupy') return null;
  const fortify = phase === 'fortify';
  const color = fortify ? FORTIFY_COLOR : playerColor(view, displayed(view, selected)?.owner);
  return (
    <group>
      {target && target !== selected && <Arc from={selected} to={target} color={color} opacity={1} width={6} />}
      {hovered && hovered !== target && hovered !== selected && hl.targets.has(hovered) && (
        <Arc from={selected} to={hovered} color={color} opacity={0.55} width={4} />
      )}
    </group>
  );
}
