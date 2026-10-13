import { CONTINENTS } from '../game/mapData';
import { useGame } from '../state/gameStore';
import { useUI } from '../state/uiStore';
import { continentsHeld, ownedBy, sel, totalArmies } from './util';

export function Scoreboard() {
  const view = useGame((s) => s.view);
  const open = useUI((s) => s.panels.scoreboard);
  if (!view) return null;
  const players = view.players.filter((p) => !p.isNeutral || view.players.filter((x) => !x.isNeutral).length === 2);
  const cur = view.players[view.current];
  return (
    <div className={`scoreboard ${open ? 'open' : 'closed'}`} data-testid="scoreboard">
      <button className="score-head" onClick={() => useUI.getState().togglePanel('scoreboard')} data-testid="scoreboard-header">
        <span>🏆 Players</span><span className={`caret ${open ? 'up' : ''}`}>▾</span>
      </button>
      <div className="score-body-wrap">
        <div className="score-body">
          {players.map((p) => {
            const terr = ownedBy(view, p.id).length;
            const armies = totalArmies(view, p.id);
            const conts = continentsHeld(view, p.id);
            const next = p.isNeutral || p.eliminated ? null : sel.reinforcementsFor(view, p.id).total;
            const isCur = p.id === cur.id && view.phase !== 'gameOver';
            return (
              <div key={p.id} className={`score-row ${isCur ? 'current' : ''} ${p.eliminated ? 'elim' : ''} ${p.isNeutral ? 'neutral' : ''}`}
                style={{ ['--pc' as string]: p.color }} data-testid={`score-row-${p.id}`}>
                <div className="score-name">
                  <span className="chip-dot" />
                  <span className="nm">{p.name}</span>
                  {p.kind === 'bot' && <span className="chip-tag">bot</span>}
                  {isCur && <span className="turn-flag">▶</span>}
                </div>
                <div className="score-stats">
                  <span title="Territories">🗺️ {terr}</span>
                  <span title="Armies">🐶 {armies}</span>
                  {!p.isNeutral && <span title="Cards in hand">🃏 {p.cards.length}</span>}
                  {next !== null && <span title="Next reinforcement estimate" className="next">+{next}</span>}
                </div>
                {conts.length > 0 && (
                  <div className="score-conts">
                    {conts.map((c) => (
                      <span key={c} className="cont-chip" style={{ background: CONTINENTS[c].color }} title={`${CONTINENTS[c].name} +${CONTINENTS[c].bonus}`}>
                        {CONTINENTS[c].name.split(' ').map((w) => w[0]).join('')}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
