// Scene-only dev entry (http://localhost:5173/src/scene/dev/scene.html): mounts the board with a
// local 4-player game (all human seats so highlights show). ?armies=big boosts army counts.
import { createRoot } from 'react-dom/client';
import { TERRITORY_IDS } from '../../game/mapData';
import { useGame } from '../../state/gameStore';
import { useUI } from '../../state/uiStore';
import { GameCanvas } from '../GameCanvas';

const params = new URLSearchParams(location.search);
useGame.getState().startLocal([
  { name: 'Rosie', color: '#E63946', kind: 'human' },
  { name: 'Blue', color: '#3A86FF', kind: 'human' },
  { name: 'Lime', color: '#6CC24A', kind: 'human' },
  { name: 'Sunny', color: '#FFBE0B', kind: 'human' },
], { setup: 'auto' }, Number(params.get('seed') ?? 7));

if (params.get('armies') === 'big') {
  const g = useGame.getState().game!;
  const terr = { ...g.territories };
  TERRITORY_IDS.forEach((id, i) => { terr[id] = { ...terr[id], armies: [1, 3, 5, 7, 9, 12, 17, 23, 36, 49][i % 10] }; });
  const s = { ...g, territories: terr };
  useGame.setState({ game: s, view: s });
}
useUI.setState({ selected: null, target: null, hovered: null, camera: { kind: 'overview' } });

createRoot(document.getElementById('root')!).render(<GameCanvas />);
