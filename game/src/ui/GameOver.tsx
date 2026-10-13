import { animate } from 'animejs';
import { useEffect, useMemo, useRef } from 'react';
import type { GameEvent, GameState } from '../game/types';
import { useGame } from '../state/gameStore';
import { useUI } from '../state/uiStore';
import { UnitIcon } from './common';
import { useLocal } from './localStore';
import { playerById, sfx } from './util';

interface Stat { conquered: number; attacks: number; lost: number; killed: number; traded: number; eliminated: number }

function statsFrom(history: GameEvent[], view: GameState) {
  const st: Record<string, Stat> = {};
  for (const p of view.players) st[p.id] = { conquered: 0, attacks: 0, lost: 0, killed: 0, traded: 0, eliminated: 0 };
  for (const e of history) {
    if (e.type === 'conquered' && st[e.player]) st[e.player].conquered++;
    if (e.type === 'battle') {
      const a = st[e.roll.attacker], d = st[e.roll.defender];
      if (a) { a.attacks++; a.lost += e.roll.attackerLosses; a.killed += e.roll.defenderLosses; }
      if (d) { d.lost += e.roll.defenderLosses; d.killed += e.roll.attackerLosses; }
    }
    if (e.type === 'cardsTraded' && st[e.player]) st[e.player].traded++;
    if (e.type === 'eliminated' && st[e.by]) st[e.by].eliminated++;
  }
  return st;
}

const CONFETTI = ['#E63946', '#3A86FF', '#6CC24A', '#FFBE0B', '#8E44AD', '#ff8fc7', '#7ee0d6'];

export function GameOver() {
  const view = useGame((s) => s.view);
  const history = useGame((s) => s.history);
  const flag = useLocal((s) => s.showGameOver);
  const confRef = useRef<HTMLDivElement>(null);
  const show = !!view && (view.phase === 'gameOver' || flag) && !!view.winner;
  const stats = useMemo(() => (view && show ? statsFrom(history, view) : null), [view, history, show]);

  useEffect(() => {
    if (!show || !confRef.current) return;
    const root = confRef.current;
    const bits: HTMLElement[] = [];
    for (let i = 0; i < 90; i++) {
      const b = document.createElement('span');
      b.className = 'confetti';
      b.style.left = `${Math.random() * 100}%`;
      b.style.background = CONFETTI[i % CONFETTI.length];
      b.style.width = `${6 + Math.random() * 8}px`;
      b.style.height = `${10 + Math.random() * 10}px`;
      root.appendChild(b);
      bits.push(b);
    }
    const anim = animate(bits, {
      y: () => [-40, innerHeight + 60], x: () => (Math.random() - 0.5) * 200, rotate: () => Math.random() * 720,
      duration: () => 2400 + Math.random() * 2200, delay: () => Math.random() * 1500, loop: true, ease: 'linear',
    });
    return () => { anim.pause(); bits.forEach((b) => b.remove()); };
  }, [show]);

  if (!show || !view || !stats) return null;
  const winner = playerById(view, view.winner);
  const rows = view.players.filter((p) => !p.isNeutral);
  return (
    <div className="gameover" data-testid="game-over">
      <div className="confetti-layer" ref={confRef} />
      <div className="gameover-card pop-in" style={{ ['--pc' as string]: winner?.color ?? '#ffbe0b' }}>
        <div className="go-animals"><UnitIcon animal="dog" size={56} /><UnitIcon animal="panda" size={80} /><UnitIcon animal="pony" size={56} /></div>
        <h1 data-testid="winner-name">🏆 {winner?.name} wins!</h1>
        <p className="muted">The whole world is cuddled. Round {view.turn}.</p>
        <table className="stats-table">
          <thead><tr><th>Player</th><th>Conquered</th><th>Attacks</th><th>Defeated</th><th>Lost</th><th>Sets</th><th>KOs</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className={p.id === view.winner ? 'win' : ''}>
                <td><span className="chip-dot" style={{ background: p.color }} /> {p.name}</td>
                <td>{stats[p.id].conquered}</td><td>{stats[p.id].attacks}</td><td>{stats[p.id].killed}</td>
                <td>{stats[p.id].lost}</td><td>{stats[p.id].traded}</td><td>{stats[p.id].eliminated}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn primary big" data-testid="new-game"
          onClick={() => { sfx('click'); useLocal.getState().set({ showGameOver: false, lastHuman: null, banner: null }); useUI.getState().clearSelection(); useGame.getState().leave(); }}>
          New game ✨
        </button>
      </div>
    </div>
  );
}
