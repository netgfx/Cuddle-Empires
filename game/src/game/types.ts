// Core game contract. The rules engine (engine.ts) is a pure reducer over these
// types, so the same code runs locally, in tests, and on the multiplayer server.

export type TerritoryId =
  | 'Alaska'
  | 'NorthwestTerritory'
  | 'Alberta'
  | 'Ontario'
  | 'Quebec'
  | 'WesternUS'
  | 'EasternUS'
  | 'CentralAmerica'
  | 'Greenland'
  | 'Venezuela'
  | 'Peru'
  | 'Brazil'
  | 'Argentina'
  | 'Scandinavia'
  | 'NorthernEurope'
  | 'WesternEurope'
  | 'SouthernEurope'
  | 'Ukraine'
  | 'Iceland'
  | 'GreatBritain'
  | 'NorthAfrica'
  | 'Egypt'
  | 'EastAfrica'
  | 'Congo'
  | 'SouthAfrica'
  | 'Madagascar'
  | 'Ural'
  | 'Siberia'
  | 'Yakutsk'
  | 'Kamchatka'
  | 'Irkutsk'
  | 'Mongolia'
  | 'Afghanistan'
  | 'China'
  | 'MiddleEast'
  | 'India'
  | 'Siam'
  | 'Japan'
  | 'Indonesia'
  | 'NewGuinea'
  | 'WesternAustralia'
  | 'EasternAustralia';

export type ContinentId = 'NorthAmerica' | 'SouthAmerica' | 'Europe' | 'Africa' | 'Asia' | 'Australia';

/** Card designs. In this cute version: infantry = dog, cavalry = pony, artillery = panda. */
export type CardUnit = 'infantry' | 'cavalry' | 'artillery';

export type PlayerId = string;
/** Owner id of the neutral armies in the 2-player variant. */
export const NEUTRAL: PlayerId = 'neutral';

export type PlayerKind = 'human' | 'bot' | 'remote';

export interface Player {
  id: PlayerId;
  name: string;
  /** Team colour (#rrggbb) used to tint pawns, arcs and UI. */
  color: string;
  kind: PlayerKind;
  isNeutral: boolean;
  eliminated: boolean;
  /** Card ids in hand. */
  cards: string[];
}

export interface Card {
  id: string;
  /** null for the 2 wild cards. */
  territory: TerritoryId | null;
  unit: CardUnit | 'wild';
}

export interface TerritoryState {
  /** null only while unclaimed during the 'setupClaim' phase. */
  owner: PlayerId | null;
  armies: number;
}

export type Phase =
  | 'setupClaim' // players take turns claiming one empty territory each
  | 'setupReinforce' // players take turns placing one army on their own territory
  | 'reinforce' // trade cards + place new armies
  | 'attack'
  | 'occupy' // must move armies into a just-captured territory
  | 'fortify'
  | 'gameOver';

export interface GameSettings {
  /** 'auto' deals territories randomly and spreads starting armies (fast start); 'manual' follows the book. */
  setup: 'manual' | 'auto';
  /** 'classic' 4,6,8,10,12,15,+5 · 'expert' 4,5,6,7… (+1 each). */
  cardProgression: 'classic' | 'expert';
  /** 'adjacent' = book rule (one move to an adjacent territory) · 'connected' = expert rule (through owned chain). */
  fortify: 'adjacent' | 'connected';
}

export const DEFAULT_SETTINGS: GameSettings = { setup: 'auto', cardProgression: 'classic', fortify: 'adjacent' };

export interface PendingOccupy {
  from: TerritoryId;
  to: TerritoryId;
  /** Must move at least the number of dice rolled in the last battle. */
  min: number;
  /** from.armies - 1 */
  max: number;
}

export interface BattleRoll {
  from: TerritoryId;
  to: TerritoryId;
  attacker: PlayerId;
  defender: PlayerId;
  /** Sorted high → low. */
  attackerDice: number[];
  defenderDice: number[];
  attackerLosses: number;
  defenderLosses: number;
}

export interface ReinforcementBreakdown {
  territories: number; // max(3, floor(owned/3))
  continents: { continent: ContinentId; bonus: number }[];
  total: number;
}

export interface LogEntry {
  turn: number;
  player: PlayerId | null;
  text: string;
}

export interface GameState {
  /** Increments on every accepted action; used for multiplayer sync. */
  version: number;
  /** Seeded PRNG state (mulberry32) — all randomness comes from here so games replay deterministically. */
  rng: number;
  settings: GameSettings;
  players: Player[];
  /** Index into players of whose turn it is. */
  current: number;
  /** 1-based round counter, increments when play passes back to the first player. */
  turn: number;
  phase: Phase;
  territories: Record<TerritoryId, TerritoryState>;
  /** Unplaced armies per player during setup phases. */
  setupPool: Record<PlayerId, number>;
  /** 2-player variant: how many own armies the current player still places this setup turn (2), then 1 neutral. */
  setupStep: { own: number; neutral: number } | null;
  /** Armies the current player still has to place in 'reinforce'. */
  reinforcements: number;
  /** Territory that must receive the +2 card bonus, if any is pending. */
  bonusTerritory: TerritoryId | null;
  /** Remaining draw pile (card ids, top = last element). */
  deck: string[];
  discard: string[];
  cards: Record<string, Card>;
  /** Number of sets traded in so far by anyone (drives the next set value). */
  setsTraded: number;
  /** True if the current player captured at least one territory this turn (earns a card). */
  conqueredThisTurn: boolean;
  /** True if a +2 territory bonus was already granted this turn (max one per turn). */
  territoryBonusUsed: boolean;
  /** Set when the current player must trade before doing anything else (5+ cards at turn start, or 6+ after an elimination). */
  mustTrade: boolean;
  pendingOccupy: PendingOccupy | null;
  lastBattle: BattleRoll | null;
  winner: PlayerId | null;
  log: LogEntry[];
}

// ---------------------------------------------------------------- actions

export type Action =
  | { type: 'claim'; territory: TerritoryId }
  | { type: 'placeSetup'; territory: TerritoryId } // one army (own territory; in 2-player, a neutral territory when it is the neutral step)
  | { type: 'tradeCards'; cards: [string, string, string] }
  | { type: 'placeReinforcements'; territory: TerritoryId; count: number }
  | { type: 'attack'; from: TerritoryId; to: TerritoryId; dice: 1 | 2 | 3; blitz?: boolean }
  | { type: 'occupy'; count: number }
  | { type: 'endAttack' } // → fortify (draws a card if conqueredThisTurn)
  | { type: 'fortify'; from: TerritoryId; to: TerritoryId; count: number } // ends the turn
  | { type: 'endTurn' } // skip fortify
  | { type: 'resign' };

/** Envelope used by transports: who sent it. */
export interface ActionEnvelope {
  action: Action;
  actor: PlayerId;
  /** Client-generated id so a sender can match the server's answer. */
  id?: string;
}

// ---------------------------------------------------------------- events (drive animations + log)

export type GameEvent =
  | { type: 'claimed'; player: PlayerId; territory: TerritoryId }
  | { type: 'armiesPlaced'; player: PlayerId; territory: TerritoryId; count: number }
  | { type: 'turnStarted'; player: PlayerId; turn: number; reinforcements: ReinforcementBreakdown }
  | { type: 'phaseChanged'; phase: Phase }
  | { type: 'cardsTraded'; player: PlayerId; cards: string[]; armies: number; bonusTerritory: TerritoryId | null }
  | { type: 'battle'; roll: BattleRoll }
  | { type: 'conquered'; player: PlayerId; from: TerritoryId; to: TerritoryId; previousOwner: PlayerId }
  | { type: 'armiesMoved'; player: PlayerId; from: TerritoryId; to: TerritoryId; count: number; reason: 'occupy' | 'fortify' }
  | { type: 'cardDrawn'; player: PlayerId; card: string }
  | { type: 'eliminated'; player: PlayerId; by: PlayerId; cardsTaken: string[] }
  | { type: 'gameOver'; winner: PlayerId };

export type ReduceResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };

export interface NewPlayer {
  id?: PlayerId;
  name: string;
  color: string;
  kind: PlayerKind;
}
