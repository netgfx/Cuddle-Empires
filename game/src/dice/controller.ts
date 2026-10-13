// Dice job queue shared by the director hook, rollDice() and the rendered <DiceLayer/>.
import type { BattleRoll } from '../game/types';
import { useGame } from '../state/gameStore';
import { hashSeed, initPhysics, simulateThrow, type ThrowSim } from './sim';

export type SfxName = 'diceRoll' | 'diceLand' | 'battleWin' | 'battleLose';
export function sfx(name: SfxName) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('risk:sfx', { detail: name }));
}

export interface DiceJob {
  sim: ThrowSim;
  attackerDice: number[];
  defenderDice: number[];
  attackerLosses: number;
  defenderLosses: number;
  attackerColor: string;
  defenderColor: string;
  attackerName: string;
  defenderName: string;
  /** Global animation speed multiplier (uiStore.animSpeed). */
  speed: number;
  resolve: () => void;
}

export const DEFAULT_ATTACKER_COLOR = '#E63946';
export const DEFAULT_DEFENDER_COLOR = '#3A86FF';

const queue: DiceJob[] = [];
let mountedLayers = 0;
let resultWaiters: (() => void)[] = [];

export const diceJobs = {
  take: (): DiceJob | undefined => queue.shift(),
  get pending() { return queue.length; },
  /** Called by the layer when the line-up result (and loss labels) appears. */
  notifyResult() { const w = resultWaiters; resultWaiters = []; w.forEach((f) => f()); },
  mount() {
    mountedLayers++;
    return () => {
      mountedLayers--;
      if (mountedLayers <= 0) { while (queue.length) queue.shift()!.resolve(); diceJobs.notifyResult(); }
    };
  },
};

function playerInfo(id: string | undefined, fallbackColor: string, fallbackName: string) {
  const p = id ? useGame.getState().view?.players.find((x) => x.id === id) : undefined;
  return { color: p?.color ?? fallbackColor, name: p?.name ?? fallbackName };
}

/** Classic RISK comparison: highest vs highest, ties go to the defender. */
export function computeLosses(att: number[], def: number[]) {
  const a = [...att].sort((x, y) => y - x), d = [...def].sort((x, y) => y - x);
  let attackerLosses = 0, defenderLosses = 0;
  for (let i = 0; i < Math.min(a.length, d.length); i++) {
    if (a[i] > d[i]) defenderLosses++; else attackerLosses++;
  }
  return { attackerLosses, defenderLosses };
}

export interface RollOptions {
  speed?: number;
  attacker?: string;
  defender?: string;
  attackerLosses?: number;
  defenderLosses?: number;
}

/** Play a throw that lands on exactly these values. Resolves when the result display is done. */
export async function rollDice(attackerDice: number[], defenderDice: number[], seed: number, opts: RollOptions = {}): Promise<void> {
  if (mountedLayers <= 0) return;
  await initPhysics();
  const sim = simulateThrow(attackerDice, defenderDice, seed >>> 0);
  const losses = computeLosses(attackerDice, defenderDice);
  const a = playerInfo(opts.attacker, DEFAULT_ATTACKER_COLOR, 'Attacker');
  const d = playerInfo(opts.defender, DEFAULT_DEFENDER_COLOR, 'Defender');
  if (mountedLayers <= 0) return;
  return new Promise<void>((resolve) => {
    queue.push({
      sim,
      attackerDice,
      defenderDice,
      attackerLosses: opts.attackerLosses ?? losses.attackerLosses,
      defenderLosses: opts.defenderLosses ?? losses.defenderLosses,
      attackerColor: a.color,
      defenderColor: d.color,
      attackerName: a.name,
      defenderName: d.name,
      speed: Math.max(0.1, opts.speed ?? 1),
      resolve,
    });
  });
}

/** Seed for a battle: identical on every client (same roll + same game version). */
export function battleSeed(roll: BattleRoll, version: number, salt = 0): number {
  return hashSeed(`${roll.from}|${roll.to}|${roll.attacker}|${roll.defender}|${roll.attackerDice.join(',')}|${roll.defenderDice.join(',')}|v${version}|${salt}`);
}

/** Index of this battle within a run of consecutive battle events (blitz) — varies identical rolls. */
function battleRunIndex(): number {
  const h = useGame.getState().history;
  let n = 0;
  for (let i = h.length - 2; i >= 0 && h[i].type === 'battle'; i--) n++;
  return n;
}

export function playBattle(roll: BattleRoll, version: number, speed: number): Promise<void> {
  return rollDice(roll.attackerDice, roll.defenderDice, battleSeed(roll, version, battleRunIndex()), {
    speed,
    attacker: roll.attacker,
    defender: roll.defender,
    attackerLosses: roll.attackerLosses,
    defenderLosses: roll.defenderLosses,
  });
}

/** Resolves when the dice of the battle being played show their result (or at once if no dice layer is mounted). */
export function waitDiceResult(timeoutMs = 6000): Promise<void> {
  if (mountedLayers <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const t = setTimeout(resolve, timeoutMs);
    resultWaiters.push(() => { clearTimeout(t); resolve(); });
  });
}
