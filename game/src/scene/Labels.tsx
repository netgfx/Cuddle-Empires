// Territory name labels, lying flat on the tiles just south of the marker disc.
// They fade out when the camera is far away so the overview stays clean.
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Mesh } from 'three';
import { TERRITORIES, TERRITORY_IDS } from '../game/mapData';
import type { TerritoryId } from '../game/types';
import { useUI } from '../state/uiStore';
import { FONT_URL } from './Pawns';
import { cameraInfo, SOCKET } from './sceneConfig';
import { fx } from './sceneState';

/** Labels that sit better above (north of) the disc than below it. */
const NUDGE: Partial<Record<TerritoryId, [number, number]>> = {
  Iceland: [0, -0.03], Japan: [0.0, 0.034], Madagascar: [0, 0.034], GreatBritain: [-0.004, 0.032],
  Indonesia: [0, 0.03], NewGuinea: [0, 0.03],
};

const noRaycast = () => null;
type TextMesh = Mesh & { fillOpacity: number; outlineOpacity: number };

function Label({ id }: { id: TerritoryId }) {
  const ref = useRef<TextMesh>(null);
  const s = SOCKET[id];
  const [dx, dz] = NUDGE[id] ?? [0, 0.03];
  useFrame(({ camera }) => {
    const m = ref.current;
    if (!m) return;
    const d = camera.position.distanceTo(s);
    // fully visible when zoomed in, hidden at the overview; the hovered territory is always readable
    const ov = cameraInfo.overview;
    let a = Math.min(1, Math.max(0, (ov * 0.8 - d) / (ov * 0.25)));
    a = Math.min(1, Math.max(a, fx[id].hover));
    m.scale.setScalar(Math.min(1.4, Math.max(1, d / 1.1)));
    m.fillOpacity = a;
    m.outlineOpacity = a * 0.8;
    m.visible = a > 0.02;
    m.position.y = s.y + 0.0012 + fx[id].hover * 0.003;
  });
  return (
    <Text
      ref={ref}
      font={FONT_URL}
      position={[s.x + dx, s.y + 0.0012, s.z + dz]}
      rotation={[-Math.PI / 2, 0, 0]}
      fontSize={0.0105}
      maxWidth={0.11}
      textAlign="center"
      anchorX="center"
      anchorY="middle"
      color="#ffffff"
      outlineWidth={0.0012}
      outlineColor="#2a2f3a"
      raycast={noRaycast}
      renderOrder={5}
    >
      {TERRITORIES[id].name}
    </Text>
  );
}

export function Labels() {
  const show = useUI((s) => s.showLabels);
  if (!show) return null;
  return <group>{TERRITORY_IDS.map((id) => <Label key={id} id={id} />)}</group>;
}
