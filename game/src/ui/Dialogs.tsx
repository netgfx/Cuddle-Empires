// Attack panel, occupy dialog and fortify dialog. They sit top-centre (under the
// HUD) so the lower-middle of the screen stays free for the dice tray.
import { useEffect, useState } from 'react';
import { useGame } from '../state/gameStore';
import { useUI } from '../state/uiStore';
import { CountPicker } from './common';
import { useCanAct } from './localStore';
import { currentPlayer, playerById, sel, sfx, tName, winOdds } from './util';

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8] };

function Die({ n, on, disabled, onClick, testid }: { n: number; on: boolean; disabled: boolean; onClick: () => void; testid: string }) {
  return (
    <button className={`die-btn ${on ? 'on' : ''}`} disabled={disabled} onClick={onClick} data-testid={testid} aria-label={`${n} dice`}>
      <span className="die-face">
        {Array.from({ length: 9 }, (_, i) => <span key={i} className={PIPS[n].includes(i) ? 'pip' : ''} />)}
      </span>
    </button>
  );
}

export function AttackPanel() {
  const view = useGame((s) => s.view);
  const busy = useGame((s) => s.busy);
  const canAct = useCanAct();
  const { selected, target, attackDice } = useUI();
  if (!view || view.phase !== 'attack' || !selected || !target || view.mustTrade || view.reinforcements > 0) return null;
  const from = view.territories[selected];
  const to = view.territories[target];
  const me = currentPlayer(view);
  if (!from || !to || from.owner !== me.id || to.owner === me.id) return null;
  const maxDice = sel.maxAttackDice(view, selected);
  const dice = Math.max(1, Math.min(attackDice, maxDice)) as 1 | 2 | 3;
  const odds = winOdds(from.armies, to.armies, dice);
  const defender = playerById(view, to.owner);
  const disabled = !canAct || busy || maxDice < 1;
  const ui = useUI.getState();
  const go = (blitz: boolean) => {
    sfx(blitz ? 'blitz' : 'attack');
    useGame.getState().dispatch({ type: 'attack', from: selected, to: target, dice, blitz });
  };
  const oddsLabel = odds > 0.85 ? 'Great odds' : odds > 0.6 ? 'Good odds' : odds > 0.4 ? 'Coin flip' : odds > 0.15 ? 'Risky' : 'Long shot';

  return (
    <div className="dialog attack-panel" data-testid="attack-panel">
      <div className="vs-line">
        <span className="vs-side" style={{ ['--pc' as string]: me.color }}>
          <span className="chip-dot" />{tName(selected)} <b>({from.armies})</b>
        </span>
        <span className="vs-arrow">➜</span>
        <span className="vs-side" style={{ ['--pc' as string]: defender?.color ?? '#aaa' }}>
          <span className="chip-dot" />{tName(target)} <b>({to.armies})</b>
        </span>
      </div>
      <div className="dice-row">
        <span className="muted">Dice</span>
        {[1, 2, 3].map((n) => (
          <Die key={n} n={n} on={dice === n} disabled={n > maxDice || disabled}
            onClick={() => { ui.setAttackDice(n as 1 | 2 | 3); sfx('click'); }} testid={`attack-dice-${n}`} />
        ))}
      </div>
      <div className="odds" data-testid="attack-odds" title="Chance to conquer if you blitz until the end">
        <div className="odds-bar"><span style={{ width: `${Math.round(odds * 100)}%` }} /></div>
        <span>{oddsLabel} · {Math.round(odds * 100)}% to conquer (blitz)</span>
      </div>
      <div className="row-btns">
        <button className="btn primary" disabled={disabled} onClick={() => go(false)} data-testid="attack-btn">🎲 Attack</button>
        <button className="btn warm" disabled={disabled} onClick={() => go(true)} data-testid="blitz-btn" title="Keep rolling until you win or run out">⚡ Blitz</button>
        <button className="btn ghost" onClick={() => { ui.setTarget(null); ui.focus({ kind: 'overview' }); }} data-testid="attack-cancel">Cancel</button>
      </div>
    </div>
  );
}

export function OccupyDialog() {
  const view = useGame((s) => s.view);
  const busy = useGame((s) => s.busy);
  const canAct = useCanAct();
  const o = view?.phase === 'occupy' ? view.pendingOccupy : null;
  const [count, setCount] = useState(o?.max ?? 1);
  const key = o ? `${o.from}-${o.to}-${o.min}-${o.max}` : '';
  useEffect(() => { if (o) setCount(o.max); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!view || !o) return null;
  return (
    <div className="dialog occupy-dialog pop-in" data-testid="occupy-dialog">
      <h3>🎉 {tName(o.to)} captured!</h3>
      <p className="muted">Move armies from {tName(o.from)} into {tName(o.to)} (at least {o.min}).</p>
      <CountPicker min={o.min} max={o.max} value={Math.max(o.min, Math.min(o.max, count))} onChange={setCount} testid="occupy" />
      <div className="row-btns">
        <button className="btn ghost sm" onClick={() => setCount(o.min)} data-testid="occupy-min">Min</button>
        <button className="btn ghost sm" onClick={() => setCount(o.max)} data-testid="occupy-max">Max</button>
        <button className="btn primary" disabled={!canAct || busy} data-testid="occupy-confirm"
          onClick={() => { sfx('march'); useGame.getState().dispatch({ type: 'occupy', count: Math.max(o.min, Math.min(o.max, count)) }); }}>
          Move {Math.max(o.min, Math.min(o.max, count))} in ➜
        </button>
      </div>
    </div>
  );
}

export function FortifyDialog() {
  const view = useGame((s) => s.view);
  const busy = useGame((s) => s.busy);
  const canAct = useCanAct();
  const { selected, target } = useUI();
  const max = view && selected ? view.territories[selected].armies - 1 : 1;
  const [count, setCount] = useState(max);
  useEffect(() => { setCount(Math.max(1, max)); }, [selected, target, max]);
  if (!view || view.phase !== 'fortify' || !selected || !target || max < 1) return null;
  const me = currentPlayer(view).id;
  if (view.territories[selected].owner !== me || view.territories[target].owner !== me) return null;
  if (!sel.fortifyTargets(view, selected).includes(target)) return null;
  const n = Math.max(1, Math.min(max, count));
  const ui = useUI.getState();
  return (
    <div className="dialog fortify-dialog pop-in" data-testid="fortify-dialog">
      <h3>🏰 Fortify</h3>
      <p className="muted">{tName(selected)} ({view.territories[selected].armies}) ➜ {tName(target)} ({view.territories[target].armies})</p>
      <CountPicker min={1} max={max} value={n} onChange={setCount} testid="fortify" />
      <p className="muted small">Fortifying ends your turn.</p>
      <div className="row-btns">
        <button className="btn ghost" onClick={() => ui.setTarget(null)} data-testid="fortify-cancel">Cancel</button>
        <button className="btn primary" disabled={!canAct || busy} data-testid="fortify-confirm"
          onClick={() => { sfx('march'); ui.clearSelection(); useGame.getState().dispatch({ type: 'fortify', from: selected, to: target, count: n }); }}>
          Move {n} &amp; end turn
        </button>
      </div>
    </div>
  );
}
