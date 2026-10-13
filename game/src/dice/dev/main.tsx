// Dev harness for <DiceLayer/>: http://localhost:5173/src/dice/dev/dice.html
//   ?att=6,3,1&def=5,3&seed=42  values / seed     ?auto=0 don't auto-roll
//   ?view=top                   top-down camera    ?blitz=4 roll N throws back to back
//   ?speed=2                    animation speed    ?orbit=1 slowly orbit the camera (tray must follow)
import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { createRoot } from 'react-dom/client';
import { DiceLayer, rollDice } from '../index';

const q = new URLSearchParams(location.search);
const nums = (s: string | null, d: number[]) => (s ? s.split(',').map(Number) : d);
const att = nums(q.get('att'), [6, 3, 1]);
const def = nums(q.get('def'), [5, 3]);
const seed = Number(q.get('seed') ?? 42);
const speed = Number(q.get('speed') ?? 1);
const top = q.get('view') === 'top';
if (q.get('fallback') === '1') (window as unknown as { __diceForceFallback: boolean }).__diceForceFallback = true; // ?fallback=1 → procedural die/tray

async function run() {
  const n = Number(q.get('blitz') ?? 1);
  const w = window as unknown as { __diceDone?: number };
  w.__diceDone = 0;
  for (let i = 0; i < n; i++) {
    await rollDice(i === 0 ? att : [((i * 5) % 6) + 1, ((i * 2) % 6) + 1, 1].slice(0, att.length), def, seed + i, { speed });
    w.__diceDone = i + 1;
  }
}

function Orbit() {
  useFrame(({ camera, clock }) => {
    if (q.get('orbit') !== '1') return;
    const t = clock.elapsedTime * 0.3;
    camera.position.set(Math.sin(t) * 30, 22, Math.cos(t) * 30);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

function Board() {
  // stand-in for the map so we can see the tray floats above it
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[60, 40]} />
        <meshStandardMaterial color="#7CC6A4" />
      </mesh>
      {[-12, -4, 4, 12].map((x) => (
        <mesh key={x} position={[x, 1, (x % 8) - 2]} castShadow>
          <cylinderGeometry args={[2.5, 3, 2, 24]} />
          <meshStandardMaterial color="#F2C48D" />
        </mesh>
      ))}
    </group>
  );
}

function App() {
  return (
    <>
      <div id="bar">
        <button onClick={() => void rollDice(att, def, Math.floor(Math.random() * 1e9), { speed })}>Roll {att.join(' ')} vs {def.join(' ')}</button>
        <button onClick={() => { for (let i = 0; i < 4; i++) void rollDice([((i * 5) % 6) + 1, 4, 2], [3, (i % 6) + 1], 100 + i, { speed }); }}>Blitz ×4</button>
      </div>
      <Canvas camera={{ position: top ? [0, 40, 0.001] : [0, 22, 30], fov: 45 }} dpr={[1, 2]}>
        <color attach="background" args={['#BFE3F2']} />
        <hemisphereLight args={['#ffffff', '#88aa88', 1.2]} />
        <directionalLight position={[10, 20, 8]} intensity={1.6} />
        <Board />
        <OrbitControls makeDefault />
        <Orbit />
        <DiceLayer tilt={q.get('tilt') ? Number(q.get('tilt')) : undefined} />
      </Canvas>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
if (q.get('auto') !== '0') setTimeout(() => void run(), 600);
