// RISK card deck: 42 territory cards (unit printed per territory in mapData) + 2 wilds.
import { TERRITORY_IDS, TERRITORIES } from './mapData';
import type { Card, GameSettings, TerritoryId } from './types';

export const WILD_CARD_IDS = ['wild-1', 'wild-2'] as const;
export const TOTAL_CARDS = TERRITORY_IDS.length + WILD_CARD_IDS.length; // 44

export const cardIdFor = (t: TerritoryId) => `card-${t}`;

/** Every card in the game, keyed by id. */
export function buildCards(): Record<string, Card> {
  const cards: Record<string, Card> = {};
  for (const t of TERRITORY_IDS) cards[cardIdFor(t)] = { id: cardIdFor(t), territory: t, unit: TERRITORIES[t].card };
  for (const id of WILD_CARD_IDS) cards[id] = { id, territory: null, unit: 'wild' };
  return cards;
}

/** 3 of the same unit, 1 of each unit, or any 2 + a wild. */
export function isSetOf(cards: Card[]): boolean {
  if (cards.length !== 3) return false;
  if (cards.some((c) => c.unit === 'wild')) return true;
  const units = new Set(cards.map((c) => c.unit));
  return units.size === 1 || units.size === 3;
}

const CLASSIC = [4, 6, 8, 10, 12, 15];

/** Armies for the set traded after `setsTraded` earlier sets (0-based index). */
export function setValue(progression: GameSettings['cardProgression'], setsTraded: number): number {
  if (progression === 'expert') return 4 + setsTraded;
  if (setsTraded < CLASSIC.length) return CLASSIC[setsTraded];
  return 15 + 5 * (setsTraded - CLASSIC.length + 1);
}
