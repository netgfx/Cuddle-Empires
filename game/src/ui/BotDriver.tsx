// Drives bot seats: when the current player is a bot and nothing is animating,
// ask ../game/bot for an action and dispatch it. Falls back to a trivial policy
// when the bot module is missing or keeps producing illegal actions.
import { useEffect, useRef } from 'react';
import type { Action, GameState, PlayerId } from '../game/types';
import { useGame } from '../state/gameStore';
import { useUI } from '../state/uiStore';
import { sel } from './util';

type ChooseFn = (s: GameState, player: PlayerId) => Action | Promise<Action>;

// glob → missing module just means "no bot yet" instead of a build error
const botMods = import.meta.glob<{ chooseBotAction?: ChooseFn }>('../game/bot.ts');
let choose: ChooseFn | null | undefined;
async function loadBot(): Promise<ChooseFn | null> {
  if (choose !== undefined) return choose;
  const loader = Object.values(botMods)[0];
  try { choose = loader ? (await loader()).chooseBotAction ?? null : null; } catch (e) { console.warn('[BotDriver] bot module failed', e); choose = null; }
  return choose;
}

/** Minimal legal-ish fallback so a game never wedges. */
function fallbackAction(g: GameState, me: PlayerId): Action {
  switch (g.phase) {
    case 'setupClaim':
    case 'setupReinforce': {
      const t = sel.placementTargets(g)[0];
      return g.phase === 'setupClaim' ? { type: 'claim', territory: t } : { type: 'placeSetup', territory: t };
    }
    case 'reinforce':
    case 'attack': {
      if (g.mustTrade) {
        const s = sel.findSets(g, me)[0];
        if (s) return { type: 'tradeCards', cards: s };
      }
      if (g.reinforcements > 0) return { type: 'placeReinforcements', territory: sel.placementTargets(g)[0], count: g.reinforcements };
      return { type: 'endAttack' };
    }
    case 'occupy':
      return { type: 'occupy', count: g.pendingOccupy?.max ?? 1 };
    default:
      return { type: 'endTurn' };
  }
}

function escapeAction(g: GameState, me: PlayerId): Action {
  if (g.phase === 'attack' && !g.mustTrade && g.reinforcements === 0) return { type: 'endAttack' };
  if (g.phase === 'fortify') return { type: 'endTurn' };
  return fallbackAction(g, me);
}

export function BotDriver() {
  const game = useGame((s) => s.game);
  const busy = useGame((s) => s.busy);
  const lastError = useGame((s) => s.lastError);
  const speed = useUI((s) => s.animSpeed);
  const fails = useRef(0);
  const lastVersion = useRef(-1);

  // count consecutive errors while a bot is acting
  useEffect(() => {
    if (lastError && game && game.players[game.current].kind === 'bot') fails.current++;
  }, [lastError]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!game || busy || game.phase === 'gameOver') return;
    if (useGame.getState().transport?.mode === 'online') return; // the room server drives bot seats
    const p = game.players[game.current];
    if (p.kind !== 'bot' || p.isNeutral) return;
    if (game.version !== lastVersion.current) { lastVersion.current = game.version; if (!lastError) fails.current = 0; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const store = useGame.getState();
      const g = store.game;
      if (cancelled || !g || store.busy || g.version !== game.version) return;
      let action: Action;
      try {
        if (fails.current >= 3) action = fails.current >= 6 ? { type: 'endTurn' } : escapeAction(g, p.id);
        else {
          const fn = await loadBot();
          action = fn ? await fn(g, p.id) : fallbackAction(g, p.id);
        }
      } catch (e) {
        console.warn('[BotDriver]', e);
        fails.current++;
        action = escapeAction(g, p.id);
      }
      if (cancelled) return;
      const now = useGame.getState();
      if (now.game?.version !== game.version || now.busy) return;
      if (now.lastError) now.clearError();
      now.dispatch(action);
    }, 400 / speed);
    return () => { cancelled = true; clearTimeout(t); };
  }, [game, busy, speed, lastError]);

  return null;
}
