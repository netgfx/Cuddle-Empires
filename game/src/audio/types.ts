// Shared audio types. MusicTrackId must stay in sync with src/state/uiStore.ts.

export type MusicTrackId = 'off' | 'meadow' | 'march' | 'lullaby' | 'adventure';

export type PlayableTrackId = Exclude<MusicTrackId, 'off'>;

export type SfxName =
  | 'click'
  | 'hover'
  | 'place'
  | 'diceRoll'
  | 'diceLand'
  | 'battleWin'
  | 'battleLose'
  | 'conquer'
  | 'cardDraw'
  | 'cardTrade'
  | 'turn'
  | 'eliminated'
  | 'victory'
  | 'error';

export const TRACK_IDS: readonly MusicTrackId[] = ['off', 'meadow', 'march', 'lullaby', 'adventure'];

export const PLAYABLE_TRACK_IDS: readonly PlayableTrackId[] = ['meadow', 'march', 'lullaby', 'adventure'];

export const SFX_NAMES: readonly SfxName[] = [
  'click',
  'hover',
  'place',
  'diceRoll',
  'diceLand',
  'battleWin',
  'battleLose',
  'conquer',
  'cardDraw',
  'cardTrade',
  'turn',
  'eliminated',
  'victory',
  'error',
];

export function isSfxName(v: unknown): v is SfxName {
  return typeof v === 'string' && (SFX_NAMES as readonly string[]).includes(v);
}
