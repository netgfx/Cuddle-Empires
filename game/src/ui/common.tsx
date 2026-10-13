import { useState, type ReactNode } from 'react';
import type { Player } from '../game/types';
import { ANIMAL_EMOJI, armyBreakdown, type Animal } from './util';

/** Unit icon PNG with emoji fallback when the image is missing. */
export function UnitIcon({ animal, size = 28, title }: { animal: Animal; size?: number; title?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className="unit-emoji" style={{ fontSize: size * 0.8, width: size, height: size }} title={title ?? animal}>{ANIMAL_EMOJI[animal]}</span>;
  }
  return (
    <img className="unit-img" src={`/assets/icons/${animal}.png`} width={size} height={size} alt={animal}
      title={title ?? animal} draggable={false} onError={() => setFailed(true)} />
  );
}

export function PlayerChip({ player, small, you }: { player: Player | undefined; small?: boolean; you?: boolean }) {
  if (!player) return <span className="chip chip-none">—</span>;
  return (
    <span className={`chip ${small ? 'chip-sm' : ''}`} style={{ ['--pc' as string]: player.color }}>
      <span className="chip-dot" />
      <span className="chip-name">{player.name}</span>
      {player.kind === 'bot' && <span className="chip-tag">bot</span>}
      {you && <span className="chip-tag">you</span>}
    </span>
  );
}

/** "🐼×2 🐴×1 🐶×3" breakdown of an army count. */
export function ArmyStack({ n, size = 22 }: { n: number; size?: number }) {
  const b = armyBreakdown(n);
  const parts: [Animal, number][] = [['panda', b.panda], ['pony', b.pony], ['dog', b.dog]];
  return (
    <span className="army-stack">
      {parts.filter(([, c]) => c > 0).map(([a, c]) => (
        <span key={a} className="army-part"><UnitIcon animal={a} size={size} />×{c}</span>
      ))}
      {n === 0 && <span className="muted">none</span>}
    </span>
  );
}

export function PanelBox({ title, onClose, className = '', children, testid }: {
  title: ReactNode; onClose?: () => void; className?: string; children: ReactNode; testid?: string;
}) {
  return (
    <section className={`panel ${className}`} data-testid={testid}>
      <header className="panel-head">
        <h3>{title}</h3>
        {onClose && <button className="icon-btn sm" onClick={onClose} aria-label="Close" data-testid={testid ? `${testid}-close` : undefined}>✕</button>}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

/** Numeric stepper + slider used by occupy/fortify dialogs. */
export function CountPicker({ min, max, value, onChange, testid }: {
  min: number; max: number; value: number; onChange: (n: number) => void; testid: string;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="count-picker">
      <button className="round-btn" onClick={() => onChange(clamp(value - 1))} disabled={value <= min} data-testid={`${testid}-minus`}>−</button>
      <input type="range" min={min} max={max} value={value} disabled={min === max}
        onChange={(e) => onChange(clamp(+e.target.value))} data-testid={`${testid}-slider`} />
      <button className="round-btn" onClick={() => onChange(clamp(value + 1))} disabled={value >= max} data-testid={`${testid}-plus`}>+</button>
      <span className="count-value" data-testid={`${testid}-value`}>{value}</span>
    </div>
  );
}
