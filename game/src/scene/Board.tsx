// The map board: loads the GLB, wires territory picking and drives per-tile visual states.
import { useGLTF } from '@react-three/drei';
import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, type Mesh, type MeshStandardMaterial, type Object3D } from 'three';
import { TERRITORY_IDS } from '../game/mapData';
import type { TerritoryId } from '../game/types';
import { useGame } from '../state/gameStore';
import { highlightsFor, onTerritoryClick } from '../state/interaction';
import { useUI } from '../state/uiStore';
import { ATTACK_COLOR, cachedColor, FORTIFY_COLOR, MAP_URL } from './sceneConfig';
import { fx, useDisplayedTerritories } from './sceneState';
import { makeWaterMaterial, setShoreFromLand, waterUniforms } from './water';

const LIFT = 0.003;
const ID_SET = new Set<string>(TERRITORY_IDS);

function territoryOf(o: Object3D | null): TerritoryId | null {
  for (let p = o; p; p = p.parent) {
    if (p.name.startsWith('Territory_')) {
      const id = p.name.slice('Territory_'.length);
      return ID_SET.has(id) ? (id as TerritoryId) : null;
    }
  }
  return null;
}

interface Tile { id: TerritoryId; mesh: Mesh; mat: MeshStandardMaterial; baseY: number }

const _target = new Color();
const _tmp = new Color();

export function Board() {
  const { scene } = useGLTF(MAP_URL);
  const view = useGame((s) => s.view);
  const busy = useGame((s) => s.busy);
  const selected = useUI((s) => s.selected);
  const target = useUI((s) => s.target);
  const hovered = useUI((s) => s.hovered);
  const terr = useDisplayedTerritories();

  const tiles = useMemo(() => {
    const out: Tile[] = [];
    scene.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) { m.receiveShadow = true; m.castShadow = !/^(Ocean|Board)$/.test(m.name); }
      if (m.isMesh && m.name === 'Ocean' && (m.material as MeshStandardMaterial).name !== 'Water') m.material = makeWaterMaterial(m.material as MeshStandardMaterial);
      const id = m.isMesh && m.name.startsWith('Territory_') ? territoryOf(m) : null;
      if (!id) return;
      const mat = (m.material as MeshStandardMaterial).clone();
      mat.emissive = new Color('#000000');
      m.material = mat;
      out.push({ id, mesh: m, mat, baseY: m.position.y });
    });
    setShoreFromLand(out.map((t) => t.mesh));
    return out;
  }, [scene]);
  useEffect(() => () => { for (const t of tiles) t.mat.dispose(); }, [tiles]);

  // highlights recomputed when the inputs change (cheap; selectors are pure)
  const hl = useMemo(() => highlightsFor(view, selected), [view, selected, busy]); // eslint-disable-line react-hooks/exhaustive-deps
  const phase = view?.phase;
  const meId = view ? view.players[view.current]?.id : null;

  const state = useRef({ hl, selected, target, hovered, terr, view, phase, meId });
  state.current = { hl, selected, target, hovered, terr, view, phase, meId };

  // cursor
  useEffect(() => {
    const actionable = hovered && (hl.actionable.has(hovered) || hl.targets.has(hovered));
    document.body.style.cursor = actionable ? 'pointer' : 'auto';
    return () => { document.body.style.cursor = 'auto'; };
  }, [hovered, hl]);

  useFrame(({ clock }, dt) => {
    const s = state.current;
    const t = clock.elapsedTime;
    waterUniforms.uWaterTime.value = t;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    const k = Math.min(1, dt * 14);
    for (const tile of tiles) {
      const f = fx[tile.id];
      f.hover += ((s.hovered === tile.id ? 1 : s.selected === tile.id ? 1.6 : 0) - f.hover) * k;
      tile.mesh.position.y = tile.baseY + f.hover * LIFT;

      _target.setRGB(0, 0, 0);
      let intensity = 0;
      if (s.selected === tile.id) {
        _target.setRGB(1, 0.93, 0.62);
        intensity = 0.32 + 0.12 * pulse;
      } else if (s.target === tile.id || s.hl.targets.has(tile.id)) {
        _target.copy(cachedColor(s.phase === 'fortify' ? FORTIFY_COLOR : ATTACK_COLOR));
        intensity = s.target === tile.id ? 0.5 + 0.2 * pulse : 0.18 + 0.22 * pulse;
      } else if (s.hl.actionable.has(tile.id)) {
        _target.setRGB(1, 0.97, 0.85);
        intensity = 0.06 + 0.1 * pulse;
      }
      if (f.hover > 0.01) {
        _tmp.setRGB(1, 1, 1);
        _target.lerp(_tmp, intensity > 0 ? 0.2 : 1);
        intensity = Math.max(intensity, 0) + 0.16 * f.hover;
      }
      if (f.flash > 0.001) {
        _tmp.set(ATTACK_COLOR);
        _target.lerp(_tmp, f.flash);
        intensity = Math.max(intensity, 0.9 * f.flash);
      }
      tile.mat.emissive.copy(_target).multiplyScalar(intensity);
    }
  });

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    useUI.getState().setHovered(territoryOf(e.object));
  };
  const onOut = (e: ThreeEvent<PointerEvent>) => {
    const id = territoryOf(e.object);
    if (id && useUI.getState().hovered === id) useUI.getState().setHovered(null);
  };
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const id = territoryOf(e.object);
    if (useUI.getState().hovered !== id) useUI.getState().setHovered(id);
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta >= 4) return; // a drag, not a click
    const id = territoryOf(e.object);
    if (id) onTerritoryClick(id, { shift: e.shiftKey });
    else useUI.getState().clearSelection();
  };

  return (
    <primitive object={scene} onPointerOver={onOver} onPointerOut={onOut} onPointerMove={onMove} onClick={onClick} />
  );
}

useGLTF.preload(MAP_URL);
