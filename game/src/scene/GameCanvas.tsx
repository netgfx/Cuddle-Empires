// Root 3D view: canvas, lighting, table, board, pawns, arcs, effects, camera, dice.
import { Environment, Hud, Lightformer, PerspectiveCamera } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useMemo } from 'react';
import { CanvasTexture, NeutralToneMapping, RepeatWrapping, SRGBColorSpace } from 'three';
import { DiceLayer } from '../dice/DiceLayer';
import { AttackArcs } from './AttackArcs';
import { Board } from './Board';
import { CameraRig } from './CameraRig';
import { Effects, EventAnimations } from './Effects';
import { Labels } from './Labels';
import { Badges, OwnerRings, Pawns } from './Pawns';


const SKY = '#cfe6f2';

function useWoodTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const g = c.getContext('2d')!;
    g.fillStyle = '#e9cfa6';
    g.fillRect(0, 0, 512, 512);
    // soft planks + grain
    for (let p = 0; p < 4; p++) {
      g.fillStyle = p % 2 ? 'rgba(160,110,60,0.07)' : 'rgba(255,255,255,0.05)';
      g.fillRect(0, p * 128, 512, 128);
      g.fillStyle = 'rgba(120,80,40,0.18)';
      g.fillRect(0, p * 128, 512, 2);
    }
    for (let i = 0; i < 160; i++) {
      const y = Math.random() * 512;
      g.strokeStyle = `rgba(140,95,50,${0.03 + Math.random() * 0.06})`;
      g.lineWidth = 1 + Math.random() * 2;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x / 70 + i) * 3);
      g.stroke();
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(5, 5);
    t.anisotropy = 8;
    return t;
  }, []);
}

function Table() {
  const tex = useWoodTexture();
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.0005, 0]} receiveShadow raycast={() => null}>
      <planeGeometry args={[9, 9]} />
      <meshStandardMaterial map={tex} roughness={0.85} color="#ffffff" />
    </mesh>
  );
}

function Lights() {
  return (
    <>
      <hemisphereLight args={['#fff7ea', '#d8c3a5', 0.9]} />
      <directionalLight
        position={[-0.9, 2.4, 1.3]}
        intensity={2.1}
        color="#fff3df"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.004}
        shadow-camera-left={-1.3}
        shadow-camera-right={1.3}
        shadow-camera-top={0.9}
        shadow-camera-bottom={-0.9}
        shadow-camera-near={0.5}
        shadow-camera-far={5}
        shadow-radius={4}
      />
      <directionalLight position={[1.5, 1.2, -1]} intensity={0.35} color="#dce9ff" />
      <Environment resolution={64} frames={1}>
        <Lightformer form="rect" intensity={1.6} position={[0, 4, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[6, 6, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={0.8} position={[-4, 2, 2]} rotation={[0, Math.PI / 2, 0]} scale={[4, 2, 1]} color="#ffe9c8" />
        <Lightformer form="rect" intensity={0.6} position={[4, 2, -2]} rotation={[0, -Math.PI / 2, 0]} scale={[4, 2, 1]} color="#d6e8ff" />
      </Environment>
    </>
  );
}

export function GameCanvas() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: SKY }}>
      <Canvas
        shadows="soft"
        dpr={[1, 2]}
        camera={{ fov: 35, near: 0.01, far: 30, position: [0, 2, 2] }}
        gl={{ antialias: true, toneMapping: NeutralToneMapping }}
      >
        <color attach="background" args={[SKY]} />
        <fog attach="fog" args={[SKY, 4, 9]} />
        <Lights />
        <Table />
        <Suspense fallback={null}>
          <Board />
        </Suspense>
        <OwnerRings />
        <Pawns />
        <Suspense fallback={null}>
          <Badges />
          <Labels />
          <Effects />
        </Suspense>
        <AttackArcs />
        <EventAnimations />
        <CameraRig />
        {/* Dice render in their own pass after the board, so board badges/arcs (depthTest off) never draw over the tray. */}
        <Hud renderPriority={1}>
          <PerspectiveCamera makeDefault fov={35} near={0.01} far={10} position={[0, 0, 0]} />
          <hemisphereLight args={['#ffffff', '#b9a48a', 1.4]} />
          <directionalLight position={[0.5, 2, 1]} intensity={1.6} />
          <Suspense fallback={null}><DiceLayer /></Suspense>
        </Hud>
      </Canvas>
    </div>
  );
}
