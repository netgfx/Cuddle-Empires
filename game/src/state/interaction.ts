// Interaction controller: turns clicks on territories into game actions or UI
// selection, depending on the phase. Scene and UI both call into this.
import {
  attackSources, attackTargets, fortifyTargets, maxAttackDice, placementTargets,
} from '../game/engine';
import type { GameState, TerritoryId } from '../game/types';
import { useGame } from './gameStore';
import { useUI } from './uiStore';

/** Can the local user act right now (game running, not animating, their seat)? */
export function canInteract(): boolean {
  const { game, busy, transport } = useGame.getState();
  if (!game || busy || !transport || game.phase === 'gameOver') return false;
  const p = game.players[game.current];
  return p.kind === 'human' && transport.seats.includes(p.id);
}

export function onTerritoryClick(id: TerritoryId, opts: { shift?: boolean } = {}) {
  const game = useGame.getState().game;
  const ui = useUI.getState();
  ui.setPanel('territory', true);
  if (!game || !canInteract()) { ui.select(id); return; }
  const me = game.players[game.current].id;
  const owned = game.territories[id].owner === me;
  const dispatch = useGame.getState().dispatch;

  switch (game.phase) {
    case 'setupClaim':
      if (game.territories[id].owner === null) dispatch({ type: 'claim', territory: id });
      return;
    case 'setupReinforce':
      if (placementTargets(game).includes(id)) dispatch({ type: 'placeSetup', territory: id });
      return;
    case 'reinforce': {
      if (game.mustTrade) { ui.setPanel('cards', true); return; }
      if (!owned) { ui.select(id); return; }
      const count = opts.shift ? game.reinforcements : Math.min(ui.placeCount, game.reinforcements);
      ui.select(id);
      dispatch({ type: 'placeReinforcements', territory: id, count });
      return;
    }
    case 'attack': {
      if (game.mustTrade) { ui.setPanel('cards', true); return; }
      if (game.reinforcements > 0 && owned) { // armies from a mid-turn trade (after an elimination)
        dispatch({ type: 'placeReinforcements', territory: id, count: opts.shift ? game.reinforcements : Math.min(ui.placeCount, game.reinforcements) });
        return;
      }
      if (owned) {
        if (attackSources(game).includes(id)) {
          ui.select(id);
          ui.setAttackDice(Math.min(3, maxAttackDice(game, id)) as 1 | 2 | 3);
        } else ui.select(id);
        return;
      }
      if (ui.selected && attackTargets(game, ui.selected).includes(id)) {
        ui.setTarget(id);
        ui.focus({ kind: 'battle', from: ui.selected, to: id });
        return;
      }
      // clicking an enemy with exactly one possible source auto-selects it
      const sources = attackSources(game).filter((s) => attackTargets(game, s).includes(id));
      if (sources.length >= 1) {
        const best = sources.sort((a, b) => game.territories[b].armies - game.territories[a].armies)[0];
        ui.select(best);
        ui.setAttackDice(Math.min(3, maxAttackDice(game, best)) as 1 | 2 | 3);
        ui.setTarget(id);
        ui.focus({ kind: 'battle', from: best, to: id });
      } else ui.select(id);
      return;
    }
    case 'fortify': {
      if (owned && ui.selected && ui.selected !== id && fortifyTargets(game, ui.selected).includes(id)) {
        ui.setTarget(id);
        return;
      }
      if (owned && game.territories[id].armies > 1) ui.select(id);
      else ui.select(id);
      return;
    }
    default:
      ui.select(id);
  }
}

export interface Highlights {
  /** Territories the user can click as the primary action now. */
  actionable: Set<TerritoryId>;
  /** Valid targets for the current selection (attack / fortify). */
  targets: Set<TerritoryId>;
}

/** What the board should highlight for the state being displayed. */
export function highlightsFor(view: GameState | null, selected: TerritoryId | null): Highlights {
  const empty: Highlights = { actionable: new Set(), targets: new Set() };
  if (!view || !canInteract()) return empty;
  try {
    switch (view.phase) {
      case 'setupClaim':
      case 'setupReinforce':
        return { actionable: new Set(placementTargets(view)), targets: new Set() };
      case 'reinforce':
        return { actionable: new Set(view.mustTrade ? [] : placementTargets(view)), targets: new Set() };
      case 'attack':
        if (view.reinforcements > 0) return { actionable: new Set(placementTargets(view)), targets: new Set() };
        return {
          actionable: new Set(attackSources(view)),
          targets: new Set(selected && view.territories[selected].owner === view.players[view.current].id ? attackTargets(view, selected) : []),
        };
      case 'fortify': {
        const me = view.players[view.current].id;
        const src = (Object.keys(view.territories) as TerritoryId[]).filter((t) => view.territories[t].owner === me && view.territories[t].armies > 1 && fortifyTargets(view, t).length > 0);
        return {
          actionable: new Set(src),
          targets: new Set(selected && view.territories[selected].owner === me ? fortifyTargets(view, selected) : []),
        };
      }
      default:
        return empty;
    }
  } catch {
    return empty;
  }
}
