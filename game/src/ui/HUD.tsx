import type { GameState, Phase, TerritoryId } from '../game/types';
import { useGame } from '../state/gameStore';
import { useUI, type PanelId } from '../state/uiStore';
import { PlayerChip } from './common';
import { useCanAct, useHandOwner, useMySeat } from './localStore';
import { currentPlayer, sfx, sel, tName } from './util';

const STEPS: { id: 'reinforce' | 'attack' | 'fortify'; label: string; icon: string }[] = [
  { id: 'reinforce', label: 'Reinforce', icon: '🐶' },
  { id: 'attack', label: 'Attack', icon: '⚔️' },
  { id: 'fortify', label: 'Fortify', icon: '🏰' },
];

function stepOf(p: Phase): 'reinforce' | 'attack' | 'fortify' | null {
  if (p === 'reinforce') return 'reinforce';
  if (p === 'attack' || p === 'occupy') return 'attack';
  if (p === 'fortify') return 'fortify';
  return null;
}

const TOGGLES: { id: PanelId; icon: string; label: string }[] = [
  { id: 'scoreboard', icon: '🏆', label: 'Scoreboard' },
  { id: 'cards', icon: '🃏', label: 'Cards' },
  { id: 'territory', icon: '🗺️', label: 'Territory info' },
  { id: 'log', icon: '📜', label: 'Log' },
  { id: 'help', icon: '❓', label: 'Help' },
  { id: 'settings', icon: '⚙️', label: 'Settings' },
];

export function instructionFor(v: GameState, canAct: boolean, selected: TerritoryId | null, target: TerritoryId | null): string {
  const p = currentPlayer(v);
  if (v.phase === 'gameOver') return 'Game over!';
  if (!canAct) return p.kind === 'bot' ? `${p.name} is thinking…` : `Waiting for ${p.name}…`;
  switch (v.phase) {
    case 'setupClaim': {
      const left = Object.values(v.territories).filter((t) => t.owner === null).length;
      return `Claim an empty territory — click any unclaimed land (${left} left)`;
    }
    case 'setupReinforce': {
      if (v.setupStep && v.setupStep.own === 0 && v.setupStep.neutral > 0) return 'Place 1 neutral army on a grey territory';
      const pool = v.setupPool[p.id] ?? 0;
      return `Place 1 army on one of your territories (${pool} left in your pool)`;
    }
    case 'reinforce':
      if (v.mustTrade) return 'You have too many cards — trade a set first!';
      return `Place ${v.reinforcements} more ${v.reinforcements === 1 ? 'army' : 'armies'} — click your territories (shift-click: all)`;
    case 'attack':
      if (v.mustTrade) return 'You have 6+ cards — trade sets before continuing';
      if (v.reinforcements > 0) return `Place ${v.reinforcements} bonus ${v.reinforcements === 1 ? 'army' : 'armies'} from your trade`;
      if (selected && target) return `Attack ${tName(target)} from ${tName(selected)} — choose your dice!`;
      if (selected && v.territories[selected]?.owner === p.id) {
        return v.territories[selected].armies > 1
          ? `Now pick an enemy neighbour of ${tName(selected)} to attack`
          : 'Select one of your territories with 2+ armies to attack from';
      }
      return 'Select one of your territories with 2+ armies to attack from';
    case 'occupy': {
      const o = v.pendingOccupy;
      return o ? `Move at least ${o.min} ${o.min === 1 ? 'army' : 'armies'} into ${tName(o.to)}` : 'Move armies in';
    }
    case 'fortify':
      if (selected && target) return `Move armies from ${tName(selected)} to ${tName(target)}`;
      if (selected) return `Pick ${v.settings.fortify === 'connected' ? 'a connected' : 'a neighbouring'} territory of yours to move armies into`;
      return 'Fortify (optional): pick a territory with 2+ armies, or end your turn';
    default:
      return '';
  }
}

export function HUD() {
  const view = useGame((s) => s.view);
  const busy = useGame((s) => s.busy);
  const canAct = useCanAct();
  const mySeat = useMySeat();
  const { selected, target, placeCount, panels } = useUI();
  if (!view) return null;
  const p = currentPlayer(view);
  const step = stepOf(view.phase);
  const setupLabel = view.phase === 'setupClaim' ? 'Claim territories' : view.phase === 'setupReinforce' ? 'Deploy armies' : null;
  const dispatch = useGame.getState().dispatch;
  const ui = useUI.getState();
  const showPlace = (view.phase === 'reinforce' || (view.phase === 'attack' && view.reinforcements > 0)) && !view.mustTrade;
  const placeOptions: { n: number; label: string }[] = [{ n: 1, label: '1' }, { n: 3, label: '3' }, { n: 5, label: '5' }, { n: 999, label: 'All' }];
  const disabled = !canAct || busy;

  return (
    <>
      <div className="hud-top" data-testid="hud">
        <div className="hud-left">
          <span className="hud-turn" style={{ ['--pc' as string]: p.color }}>
            <PlayerChip player={p} />
          </span>
          <span className="hud-round" data-testid="hud-round">Round {view.turn}</span>
        </div>
        <div className="hud-steps" data-testid="hud-phase" data-phase={view.phase}>
          {setupLabel ? (
            <span className="step on setup">{view.phase === 'setupClaim' ? '🚩' : '🐶'} {setupLabel}</span>
          ) : view.phase === 'gameOver' ? (
            <span className="step on">🏆 Game over</span>
          ) : (
            STEPS.map((st, i) => (
              <span key={st.id} className="step-wrap">
                {i > 0 && <span className="step-arrow">→</span>}
                <span className={`step ${step === st.id ? 'on' : ''} ${STEPS.findIndex((x) => x.id === step) > i ? 'done' : ''}`}>
                  <span className="step-icon">{st.icon}</span>{st.label}
                </span>
              </span>
            ))
          )}
        </div>
        <div className="hud-toggles">
          {TOGGLES.map((t) => (
            <button key={t.id} className={`icon-btn ${panels[t.id] ? 'on' : ''}`} title={t.label} aria-label={t.label}
              onClick={() => { ui.togglePanel(t.id); sfx('click'); }} data-testid={`panel-toggle-${t.id}`}>
              {t.icon}
              {t.id === 'cards' && <CardBadge />}
            </button>
          ))}
        </div>
      </div>

      <div className="hud-instr-wrap">
        <div className={`hud-instr ${canAct ? 'active' : ''}`} style={{ ['--pc' as string]: p.color }}>
          <span className="instr-text" data-testid="instruction">{instructionFor(view, mySeat, selected, target)}</span>
          {showPlace && mySeat && (
            <span className="place-step" data-testid="place-count">
              {placeOptions.map((o) => (
                <button key={o.n} className={placeCount === o.n || (o.n === 999 && placeCount >= 999) ? 'on' : ''}
                  disabled={disabled} onClick={() => ui.setPlaceCount(o.n)} data-testid={`place-count-${o.label.toLowerCase()}`}>{o.label}</button>
              ))}
            </span>
          )}
          {view.phase === 'attack' && !view.mustTrade && view.reinforcements === 0 && (
            <button className="btn warm" disabled={disabled} data-testid="end-attack"
              onClick={() => { ui.clearSelection(); dispatch({ type: 'endAttack' }); sfx('click'); }}>End attack ➜</button>
          )}
          {view.phase === 'fortify' && (
            <button className="btn warm" disabled={disabled} data-testid="end-turn"
              onClick={() => { ui.clearSelection(); dispatch({ type: 'endTurn' }); sfx('click'); }}>
              {selected ? 'Skip fortify · End turn' : 'End turn ➜'}
            </button>
          )}
        </div>
        {view.phase === 'reinforce' && canAct && !view.mustTrade && <ReinforceHint view={view} />}
      </div>
    </>
  );
}

function ReinforceHint({ view }: { view: GameState }) {
  const p = currentPlayer(view);
  const sets = sel.findSets(view, p.id);
  if (!sets.length) return null;
  return (
    <button className="hud-sub" onClick={() => useUI.getState().setPanel('cards', true)} data-testid="hint-trade">
      🃏 You can trade a set for +{sel.nextSetValue(view)} armies
    </button>
  );
}

function CardBadge() {
  const owner = useHandOwner();
  const n = useGame((s) => s.view?.players.find((p) => p.id === owner)?.cards.length ?? 0);
  return n > 0 ? <span className="badge">{n}</span> : null;
}
