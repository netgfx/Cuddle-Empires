// Save / load modal for local games, the HUD save indicator and the Ctrl+S quick save.
import { useEffect, useRef, useState } from 'react';
import type { Phase } from '../game/types';
import { useGame } from '../state/gameStore';
import { canSaveNow, useSaves, type SaveSummary } from '../state/saves';
import { useUI } from '../state/uiStore';
import { PanelBox, UnitIcon } from './common';
import { useLocal } from './localStore';
import { sfx } from './util';

const PHASE_LABEL: Record<Phase, string> = {
  setupClaim: '🚩 Claiming', setupReinforce: '🐶 Deploying', reinforce: '🐶 Reinforce', attack: '⚔️ Attack',
  occupy: '⚔️ Attack', fortify: '🏰 Fortify', gameOver: '🏆 Game over',
};

const fullDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const timeOnly = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

function when(ts: number, now: number): string {
  const s = Math.round((now - ts) / 1000); // negative for saves made after `now` last ticked
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  const d = new Date(ts);
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return `today ${timeOnly.format(d)}`;
  today.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return `yesterday ${timeOnly.format(d)}`;
  return fullDate.format(d);
}

/** Saves the running local game and confirms with a popup (used by Ctrl+S). */
export async function quickSave() {
  if (!canSaveNow()) return;
  const file = await useSaves.getState().save();
  if (file) {
    sfx('click');
    useLocal.getState().popup('💾 Game saved!', '#3cb88f', 2000);
  } else {
    sfx('error');
    useLocal.getState().popup(`🙊 ${useSaves.getState().error ?? 'Could not save'}`, '#ec5b4f', 3200);
  }
}

/** Spinner / check overlay on the HUD's save button. */
export function SaveBadge() {
  const status = useSaves((s) => s.status);
  if (status === 'saving') return <span className="save-ring" data-testid="save-indicator" aria-label="Saving" />;
  if (status === 'saved') return <span className="badge ok pop-in" data-testid="save-indicator-done">✓</span>;
  if (status === 'error') return <span className="badge">!</span>;
  return null;
}

export function SavesPanel() {
  const open = useUI((s) => s.panels.saves);
  if (!open) return null;
  return <SavesModal />;
}

function SavesModal() {
  const saves = useSaves((s) => s.saves);
  const status = useSaves((s) => s.status);
  const storeError = useSaves((s) => s.error);
  const lastSavedId = useSaves((s) => s.lastSavedId);
  const inGame = useGame((s) => !!s.game);
  const canSave = useGame((s) => !!s.game && s.transport?.mode === 'local' && s.game.phase !== 'gameOver');
  const online = useGame((s) => s.transport?.mode === 'online');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmLoad, setConfirmLoad] = useState<SaveSummary | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    useSaves.getState().refresh();
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Ctrl+S while the modal is open saves under the typed name (UIRoot leaves it to us).
  const saveRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's' && !e.repeat) saveRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const close = () => useUI.getState().setPanel('saves', false);

  const save = async () => {
    setError(null);
    const file = await useSaves.getState().save(label);
    if (file) { sfx('click'); setLabel(''); } else { sfx('error'); setError(useSaves.getState().error); }
  };

  useEffect(() => {
    saveRef.current = () => { if (canSave && !confirmLoad && useSaves.getState().status !== 'saving') void save(); };
  });

  const load = (s: SaveSummary) => {
    setConfirmLoad(null);
    setError(null);
    try {
      const file = useSaves.getState().load(s.id);
      const ui = useUI.getState();
      ui.clearSelection();
      ui.focus({ kind: 'overview' });
      for (const p of ['saves', 'settings', 'help', 'territory'] as const) ui.setPanel(p, false);
      sfx('start');
      setTimeout(() => useLocal.getState().popup(`📂 Loaded “${file.label}” · round ${file.round}`, '#3cb88f', 2600), 150);
    } catch (e) {
      sfx('error');
      setError((e as Error).message);
      useSaves.getState().refresh();
    }
  };

  const askLoad = (s: SaveSummary) => {
    sfx('click');
    if (inGame) setConfirmLoad(s);
    else load(s);
  };

  const saveThenLoad = async (s: SaveSummary) => {
    const file = await useSaves.getState().save();
    if (file) load(s);
    else { setConfirmLoad(null); setError(useSaves.getState().error); }
  };

  const shownError = error ?? (status === 'error' ? storeError : null);

  return (
    <div className="modal-backdrop soft" onClick={close} data-testid="saves-backdrop">
      <div onClick={(e) => e.stopPropagation()}>
        <PanelBox title="💾 Saved games" onClose={close} testid="saves-panel" className="saves-panel">
          {canSave && (
            <form className="save-bar" onSubmit={(e) => { e.preventDefault(); void save(); }}>
              <input className="name-input" value={label} maxLength={40} placeholder="Name this save (optional)"
                onChange={(e) => setLabel(e.target.value)} disabled={status === 'saving'} data-testid="save-label" aria-label="Save name" />
              <button type="submit" className={`btn save-btn ${status === 'saved' ? 'done' : 'primary'}`} disabled={status === 'saving'} data-testid="save-game">
                {status === 'saving' ? <><span className="spinner" /> Saving…</> : status === 'saved' ? '✅ Saved!' : '💾 Save game'}
              </button>
            </form>
          )}
          {online && <p className="saves-note" data-testid="saves-online-note">🌍 Online games can't be saved — saving works in local games only.</p>}
          {shownError && <p className="saves-error" role="alert" data-testid="saves-error">🙊 {shownError}</p>}

          <div className="saves-head">
            <span className="muted small">{saves.length ? `${saves.length} saved ${saves.length === 1 ? 'game' : 'games'} on this device` : ''}</span>
            {canSave && <span className="muted small">Tip: Ctrl+S saves instantly</span>}
          </div>

          {saves.length === 0 ? (
            <div className="saves-empty" data-testid="saves-empty">
              <UnitIcon animal="panda" size={56} />
              <p><b>No saved games yet</b></p>
              <p className="muted small">{canSave ? 'Save this game to pick it up later.' : 'Start a local game and save it from the 💾 button.'}</p>
            </div>
          ) : (
            <ul className="saves-list" data-testid="saves-list">
              {saves.map((s) => {
                const total = s.players.reduce((n, p) => n + p.territories, 0) || 1;
                const turn = s.players.find((p) => p.id === s.current);
                return (
                  <li key={s.id} className={`save-row ${s.id === lastSavedId && status === 'saved' ? 'fresh' : ''}`} data-testid="save-row">
                    <div className="save-main">
                      <div className="save-title">
                        <span className="save-label" title={s.label}>{s.label}</span>
                        <span className="save-time" title={fullDate.format(new Date(s.savedAt))}>{when(s.savedAt, now)}</span>
                      </div>
                      <div className="save-players">
                        {s.players.filter((p) => !p.neutral).map((p) => (
                          <span key={p.id} className={`save-player ${p.eliminated ? 'elim' : ''} ${p.id === s.current ? 'turn' : ''}`}
                            style={{ ['--pc' as string]: p.color }} title={`${p.name}: ${p.territories} territories, ${p.armies} armies`}>
                            <span className="chip-dot" />{p.name}{p.kind === 'bot' && <span className="chip-tag">bot</span>}
                          </span>
                        ))}
                      </div>
                      <div className="save-share" aria-hidden>
                        {s.players.filter((p) => p.territories > 0).map((p) => (
                          <span key={p.id} style={{ flexGrow: p.territories, background: p.color }} />
                        ))}
                        {s.players.every((p) => p.territories === 0) && <span style={{ flexGrow: total }} />}
                      </div>
                      <div className="save-meta muted small">
                        Round {s.round} · {PHASE_LABEL[s.phase]}{turn && s.phase !== 'gameOver' ? ` · ${turn.name}'s turn` : ''}
                      </div>
                    </div>
                    <div className="save-actions">
                      {confirmDelete === s.id ? (
                        <>
                          <span className="muted small">Delete?</span>
                          <button className="btn ghost sm" onClick={() => setConfirmDelete(null)} data-testid="save-delete-cancel">No</button>
                          <button className="btn danger sm" data-testid="save-delete-confirm"
                            onClick={() => { useSaves.getState().remove(s.id); setConfirmDelete(null); sfx('click'); }}>Delete</button>
                        </>
                      ) : (
                        <>
                          <button className="btn primary sm" onClick={() => askLoad(s)} disabled={status === 'saving'} data-testid="save-load">📂 Load</button>
                          <button className="icon-btn sm" onClick={() => setConfirmDelete(s.id)} aria-label={`Delete ${s.label}`} title="Delete save" data-testid="save-delete">🗑️</button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {confirmLoad && (
            <div className="saves-confirm" role="alertdialog" aria-labelledby="load-confirm-title" data-testid="load-confirm">
              <div className="saves-confirm-card pop-in">
                <div className="saves-confirm-emoji">⚠️</div>
                <h3 id="load-confirm-title">Load “{confirmLoad.label}”?</h3>
                <p className="muted">
                  {online ? 'You will leave the online game you are playing.' : 'The game you are playing now will be replaced. Anything since your last save will be lost.'}
                </p>
                <div className="row-btns">
                  <button className="btn ghost" onClick={() => setConfirmLoad(null)} data-testid="load-confirm-cancel" autoFocus>Keep playing</button>
                  {canSave && (
                    <button className="btn warm" onClick={() => void saveThenLoad(confirmLoad)} disabled={status === 'saving'} data-testid="load-confirm-save">
                      {status === 'saving' ? <><span className="spinner" /> Saving…</> : '💾 Save first, then load'}
                    </button>
                  )}
                  <button className="btn danger" onClick={() => load(confirmLoad)} disabled={status === 'saving'} data-testid="load-confirm-ok">Load anyway</button>
                </div>
              </div>
            </div>
          )}
        </PanelBox>
      </div>
    </div>
  );
}
