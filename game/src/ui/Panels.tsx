// Log, Help and Settings panels.
import { useState } from 'react';
import { useGame } from '../state/gameStore';
import { useUI, type MusicTrackId } from '../state/uiStore';
import { PanelBox, UnitIcon } from './common';
import { playerById } from './util';

export function LogPanel() {
  const view = useGame((s) => s.view);
  const open = useUI((s) => s.panels.log);
  if (!view || !open) return null;
  const entries = [...view.log].reverse().slice(0, 200);
  return (
    <PanelBox title="📜 Battle log" onClose={() => useUI.getState().setPanel('log', false)} testid="log-panel" className="log-panel">
      {entries.length === 0 && <p className="muted">Nothing happened yet.</p>}
      <ul className="log-list">
        {entries.map((e, i) => {
          const p = playerById(view, e.player);
          return (
            <li key={view.log.length - i} style={{ ['--pc' as string]: p?.color ?? '#bbb' }}>
              <span className="log-turn">R{e.turn}</span>
              <span className="chip-dot" />
              <span>{e.text}</span>
            </li>
          );
        })}
      </ul>
    </PanelBox>
  );
}

export function HelpPanel() {
  const open = useUI((s) => s.panels.help);
  if (!open) return null;
  const close = () => useUI.getState().setPanel('help', false);
  return (
    <div className="modal-backdrop soft" onClick={close}>
      <div onClick={(e) => e.stopPropagation()}>
        <PanelBox title="❓ How to play" onClose={close} testid="help-panel" className="help-panel">
          <div className="help-grid">
            <section>
              <h4>🎯 Goal</h4>
              <p>Conquer every territory on the map. Last army standing wins!</p>
              <h4>🔁 Your turn</h4>
              <ol>
                <li><b>Reinforce</b> — trade cards, then place your new armies.</li>
                <li><b>Attack</b> — as often as you like (optional).</li>
                <li><b>Fortify</b> — one move of armies, then your turn ends (optional).</li>
              </ol>
              <h4>🐶 Reinforcements</h4>
              <p>Territories ÷ 3 (minimum 3) + continent bonuses: North America 5, Europe 5, Asia 7, Africa 3, South America 2, Australia 2.</p>
              <h4>🃏 Cards</h4>
              <p>Capture at least one territory in a turn to earn a card. Trade a set of 3 — three of a kind, one of each, or any two + a wild.
                Classic sets are worth 4, 6, 8, 10, 12, 15, then +5 each; expert sets 4, 5, 6, 7… If a traded card shows a territory you own, +2 armies go there.
                With 5+ cards you must trade.</p>
            </section>
            <section>
              <h4>🎲 Attacking</h4>
              <p>Attack a neighbour from a territory with 2+ armies. Roll 1–3 dice (one less than your armies); the defender rolls 1–2.
                Highest dice are compared in pairs — the defender wins ties. Blitz ⚡ keeps rolling until you win or can't continue.
                Capture a territory and move at least as many armies in as dice you rolled.</p>
              <h4>🏰 Fortify</h4>
              <p>Move armies once from one territory to an adjacent one you own (or through a chain of your territories with the "connected" rule). Always leave one behind.</p>
              <h4>🏆 Winning</h4>
              <p>Eliminate a player and you take their cards. Own all 42 territories to win.</p>
              <h4>🐾 The animals</h4>
              <table className="animal-table">
                <tbody>
                  <tr><td><UnitIcon animal="dog" size={36} /></td><td>Dog</td><td><b>1</b> army</td></tr>
                  <tr><td><UnitIcon animal="pony" size={36} /></td><td>Pony</td><td><b>5</b> armies</td></tr>
                  <tr><td><UnitIcon animal="panda" size={36} /></td><td>Panda</td><td><b>10</b> armies</td></tr>
                </tbody>
              </table>
            </section>
          </div>
          <p className="muted small">Shortcuts: Esc closes panels and clears the selection · shift-click places all armies.</p>
        </PanelBox>
      </div>
    </div>
  );
}

const TRACKS: { id: MusicTrackId; label: string }[] = [
  { id: 'off', label: 'Off' }, { id: 'meadow', label: '🌼 Meadow' }, { id: 'march', label: '🥁 March' },
  { id: 'lullaby', label: '🌙 Lullaby' }, { id: 'adventure', label: '🗺️ Adventure' },
];

export function SettingsPanel() {
  const open = useUI((s) => s.panels.settings);
  const { music, musicVolume, sfxVolume, animSpeed, showLabels } = useUI();
  const inGame = useGame((s) => !!s.view);
  if (!open) return null;
  const ui = useUI.getState();
  return (
    <PanelBox title="⚙️ Settings" onClose={() => ui.setPanel('settings', false)} testid="settings-panel" className="settings-panel">
      <label className="set-row">Music
        <select value={music} onChange={(e) => ui.setPrefs({ music: e.target.value as MusicTrackId })} data-testid="settings-music">
          {TRACKS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </label>
      <label className="set-row">Music volume
        <input type="range" min={0} max={1} step={0.05} value={musicVolume} onChange={(e) => ui.setPrefs({ musicVolume: +e.target.value })} data-testid="settings-music-volume" />
      </label>
      <label className="set-row">Sound effects
        <input type="range" min={0} max={1} step={0.05} value={sfxVolume} onChange={(e) => ui.setPrefs({ sfxVolume: +e.target.value })} data-testid="settings-sfx-volume" />
      </label>
      <div className="set-row">Animation speed
        <span className="seg">
          {[1, 2, 4].map((s) => (
            <button key={s} className={animSpeed === s ? 'on' : ''} onClick={() => ui.setPrefs({ animSpeed: s })} data-testid={`settings-speed-${s}`}>{s}×</button>
          ))}
        </span>
      </div>
      <label className="set-row">Territory labels
        <input type="checkbox" checked={showLabels} onChange={(e) => ui.setPrefs({ showLabels: e.target.checked })} data-testid="settings-labels" />
      </label>
      {inGame && <LeaveButton />}
    </PanelBox>
  );
}

function LeaveButton() {
  const [ask, setAsk] = useState(false);
  const ui = useUI.getState();
  if (!ask) return <button className="btn danger" onClick={() => setAsk(true)} data-testid="leave-game">🚪 Leave game</button>;
  return (
    <div className="row-btns">
      <span className="muted">Leave this game?</span>
      <button className="btn ghost sm" onClick={() => setAsk(false)} data-testid="leave-game-cancel">Stay</button>
      <button className="btn danger sm" data-testid="leave-game-confirm"
        onClick={() => { useGame.getState().leave(); ui.clearSelection(); ui.setPanel('settings', false); setAsk(false); }}>Leave</button>
    </div>
  );
}
