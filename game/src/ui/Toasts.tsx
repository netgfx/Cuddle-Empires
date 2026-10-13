import { useEffect } from 'react';
import { useGame } from '../state/gameStore';
import { sfx } from './util';

export function Toasts() {
  const err = useGame((s) => s.lastError);
  const botTurn = useGame((s) => !!s.game && s.game.players[s.game.current].kind === 'bot');
  useEffect(() => {
    if (!err) return;
    if (!botTurn) sfx('error');
    const t = setTimeout(() => useGame.getState().clearError(), 3000);
    return () => clearTimeout(t);
  }, [err]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!err || botTurn) return null;
  return (
    <div className="toasts">
      <div className="toast pop-in" data-testid="toast" onClick={() => useGame.getState().clearError()}>🙊 {err}</div>
    </div>
  );
}
