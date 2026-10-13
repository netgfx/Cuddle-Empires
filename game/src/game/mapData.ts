// AUTO-GENERATED from risk-map-v1/model.glb (assetgen_meta.risk_map). Do not edit by hand.
// Territory ids match the GLB node names: Territory_<id>, socket_<id>.
import type { ContinentId, TerritoryId, CardUnit } from './types';

export interface ContinentDef { id: ContinentId; name: string; color: string; bonus: number; territories: TerritoryId[] }
export interface TerritoryDef { id: TerritoryId; name: string; continent: ContinentId; node: string; socket: string; /** glTF/three.js coords (Y up), metres */ pawn: [number, number, number]; card: CardUnit }

export const CONTINENTS: Record<ContinentId, ContinentDef> = {
  NorthAmerica: { id: 'NorthAmerica', name: 'North America', color: '#E5B73E', bonus: 5, territories: ["Alaska", "NorthwestTerritory", "Alberta", "Ontario", "Quebec", "WesternUS", "EasternUS", "CentralAmerica", "Greenland"] as TerritoryId[] },
  SouthAmerica: { id: 'SouthAmerica', name: 'South America', color: '#C83232', bonus: 2, territories: ["Venezuela", "Peru", "Brazil", "Argentina"] as TerritoryId[] },
  Europe: { id: 'Europe', name: 'Europe', color: '#2B6CC4', bonus: 5, territories: ["Scandinavia", "NorthernEurope", "WesternEurope", "SouthernEurope", "Ukraine", "Iceland", "GreatBritain"] as TerritoryId[] },
  Africa: { id: 'Africa', name: 'Africa', color: '#9C6E46', bonus: 3, territories: ["NorthAfrica", "Egypt", "EastAfrica", "Congo", "SouthAfrica", "Madagascar"] as TerritoryId[] },
  Asia: { id: 'Asia', name: 'Asia', color: '#368A47', bonus: 7, territories: ["Ural", "Siberia", "Yakutsk", "Kamchatka", "Irkutsk", "Mongolia", "Afghanistan", "China", "MiddleEast", "India", "Siam", "Japan"] as TerritoryId[] },
  Australia: { id: 'Australia', name: 'Australia', color: '#964796', bonus: 2, territories: ["Indonesia", "NewGuinea", "WesternAustralia", "EasternAustralia"] as TerritoryId[] },
};

export const TERRITORIES: Record<TerritoryId, TerritoryDef> = {
  Alaska: { id: 'Alaska', name: 'Alaska', continent: 'NorthAmerica', node: 'Territory_Alaska', socket: 'socket_Alaska', pawn: [-0.792, 0.044, -0.2992], card: 'infantry' },
  NorthwestTerritory: { id: 'NorthwestTerritory', name: 'Northwest Territory', continent: 'NorthAmerica', node: 'Territory_NorthwestTerritory', socket: 'socket_NorthwestTerritory', pawn: [-0.616, 0.044, -0.2992], card: 'cavalry' },
  Alberta: { id: 'Alberta', name: 'Alberta', continent: 'NorthAmerica', node: 'Territory_Alberta', socket: 'socket_Alberta', pawn: [-0.6688, 0.044, -0.1936], card: 'artillery' },
  Ontario: { id: 'Ontario', name: 'Ontario', continent: 'NorthAmerica', node: 'Territory_Ontario', socket: 'socket_Ontario', pawn: [-0.528, 0.044, -0.2112], card: 'infantry' },
  Quebec: { id: 'Quebec', name: 'Quebec', continent: 'NorthAmerica', node: 'Territory_Quebec', socket: 'socket_Quebec', pawn: [-0.3872, 0.044, -0.2112], card: 'cavalry' },
  WesternUS: { id: 'WesternUS', name: 'Western United States', continent: 'NorthAmerica', node: 'Territory_WesternUS', socket: 'socket_WesternUS', pawn: [-0.616, 0.044, -0.088], card: 'artillery' },
  EasternUS: { id: 'EasternUS', name: 'Eastern United States', continent: 'NorthAmerica', node: 'Territory_EasternUS', socket: 'socket_EasternUS', pawn: [-0.4752, 0.044, -0.1056], card: 'infantry' },
  CentralAmerica: { id: 'CentralAmerica', name: 'Central America', continent: 'NorthAmerica', node: 'Territory_CentralAmerica', socket: 'socket_CentralAmerica', pawn: [-0.5456, 0.044, 0.0352], card: 'cavalry' },
  Greenland: { id: 'Greenland', name: 'Greenland', continent: 'NorthAmerica', node: 'Territory_Greenland', socket: 'socket_Greenland', pawn: [-0.2112, 0.044, -0.352], card: 'artillery' },
  Venezuela: { id: 'Venezuela', name: 'Venezuela', continent: 'SouthAmerica', node: 'Territory_Venezuela', socket: 'socket_Venezuela', pawn: [-0.4752, 0.044, 0.176], card: 'infantry' },
  Peru: { id: 'Peru', name: 'Peru', continent: 'SouthAmerica', node: 'Territory_Peru', socket: 'socket_Peru', pawn: [-0.4928, 0.044, 0.264], card: 'cavalry' },
  Brazil: { id: 'Brazil', name: 'Brazil', continent: 'SouthAmerica', node: 'Territory_Brazil', socket: 'socket_Brazil', pawn: [-0.3872, 0.044, 0.2464], card: 'artillery' },
  Argentina: { id: 'Argentina', name: 'Argentina', continent: 'SouthAmerica', node: 'Territory_Argentina', socket: 'socket_Argentina', pawn: [-0.44, 0.044, 0.3696], card: 'infantry' },
  Scandinavia: { id: 'Scandinavia', name: 'Scandinavia', continent: 'Europe', node: 'Territory_Scandinavia', socket: 'socket_Scandinavia', pawn: [0.088, 0.044, -0.2992], card: 'cavalry' },
  NorthernEurope: { id: 'NorthernEurope', name: 'Northern Europe', continent: 'Europe', node: 'Territory_NorthernEurope', socket: 'socket_NorthernEurope', pawn: [0.0528, 0.044, -0.176], card: 'artillery' },
  WesternEurope: { id: 'WesternEurope', name: 'Western Europe', continent: 'Europe', node: 'Territory_WesternEurope', socket: 'socket_WesternEurope', pawn: [-0.0352, 0.044, -0.1232], card: 'infantry' },
  SouthernEurope: { id: 'SouthernEurope', name: 'Southern Europe', continent: 'Europe', node: 'Territory_SouthernEurope', socket: 'socket_SouthernEurope', pawn: [0.088, 0.044, -0.0968], card: 'cavalry' },
  Ukraine: { id: 'Ukraine', name: 'Ukraine', continent: 'Europe', node: 'Territory_Ukraine', socket: 'socket_Ukraine', pawn: [0.176, 0.044, -0.2288], card: 'artillery' },
  Iceland: { id: 'Iceland', name: 'Iceland', continent: 'Europe', node: 'Territory_Iceland', socket: 'socket_Iceland', pawn: [-0.132, 0.044, -0.2552], card: 'infantry' },
  GreatBritain: { id: 'GreatBritain', name: 'Great Britain', continent: 'Europe', node: 'Territory_GreatBritain', socket: 'socket_GreatBritain', pawn: [-0.1056, 0.044, -0.176], card: 'cavalry' },
  NorthAfrica: { id: 'NorthAfrica', name: 'North Africa', continent: 'Africa', node: 'Territory_NorthAfrica', socket: 'socket_NorthAfrica', pawn: [-0.0704, 0.044, 0.088], card: 'artillery' },
  Egypt: { id: 'Egypt', name: 'Egypt', continent: 'Africa', node: 'Territory_Egypt', socket: 'socket_Egypt', pawn: [0.0528, 0.044, 0.0264], card: 'infantry' },
  EastAfrica: { id: 'EastAfrica', name: 'East Africa', continent: 'Africa', node: 'Territory_EastAfrica', socket: 'socket_EastAfrica', pawn: [0.1232, 0.044, 0.1408], card: 'cavalry' },
  Congo: { id: 'Congo', name: 'Congo', continent: 'Africa', node: 'Territory_Congo', socket: 'socket_Congo', pawn: [0.0352, 0.044, 0.2112], card: 'artillery' },
  SouthAfrica: { id: 'SouthAfrica', name: 'South Africa', continent: 'Africa', node: 'Territory_SouthAfrica', socket: 'socket_SouthAfrica', pawn: [0.0528, 0.044, 0.3344], card: 'infantry' },
  Madagascar: { id: 'Madagascar', name: 'Madagascar', continent: 'Africa', node: 'Territory_Madagascar', socket: 'socket_Madagascar', pawn: [0.2253, 0.044, 0.3203], card: 'cavalry' },
  Ural: { id: 'Ural', name: 'Ural', continent: 'Asia', node: 'Territory_Ural', socket: 'socket_Ural', pawn: [0.352, 0.044, -0.2816], card: 'artillery' },
  Siberia: { id: 'Siberia', name: 'Siberia', continent: 'Asia', node: 'Territory_Siberia', socket: 'socket_Siberia', pawn: [0.4576, 0.044, -0.3344], card: 'infantry' },
  Yakutsk: { id: 'Yakutsk', name: 'Yakutsk', continent: 'Asia', node: 'Territory_Yakutsk', socket: 'socket_Yakutsk', pawn: [0.5984, 0.044, -0.3696], card: 'cavalry' },
  Kamchatka: { id: 'Kamchatka', name: 'Kamchatka', continent: 'Asia', node: 'Territory_Kamchatka', socket: 'socket_Kamchatka', pawn: [0.7216, 0.044, -0.3168], card: 'artillery' },
  Irkutsk: { id: 'Irkutsk', name: 'Irkutsk', continent: 'Asia', node: 'Territory_Irkutsk', socket: 'socket_Irkutsk', pawn: [0.5632, 0.044, -0.2728], card: 'infantry' },
  Mongolia: { id: 'Mongolia', name: 'Mongolia', continent: 'Asia', node: 'Territory_Mongolia', socket: 'socket_Mongolia', pawn: [0.616, 0.044, -0.176], card: 'cavalry' },
  Afghanistan: { id: 'Afghanistan', name: 'Afghanistan', continent: 'Asia', node: 'Territory_Afghanistan', socket: 'socket_Afghanistan', pawn: [0.3872, 0.044, -0.1408], card: 'artillery' },
  China: { id: 'China', name: 'China', continent: 'Asia', node: 'Territory_China', socket: 'socket_China', pawn: [0.5104, 0.044, -0.0792], card: 'infantry' },
  MiddleEast: { id: 'MiddleEast', name: 'Middle East', continent: 'Asia', node: 'Territory_MiddleEast', socket: 'socket_MiddleEast', pawn: [0.2728, 0.044, -0.0176], card: 'cavalry' },
  India: { id: 'India', name: 'India', continent: 'Asia', node: 'Territory_India', socket: 'socket_India', pawn: [0.44, 0.044, 0.0264], card: 'artillery' },
  Siam: { id: 'Siam', name: 'Siam', continent: 'Asia', node: 'Territory_Siam', socket: 'socket_Siam', pawn: [0.5808, 0.044, 0.044], card: 'infantry' },
  Japan: { id: 'Japan', name: 'Japan', continent: 'Asia', node: 'Territory_Japan', socket: 'socket_Japan', pawn: [0.8061, 0.044, -0.176], card: 'cavalry' },
  Indonesia: { id: 'Indonesia', name: 'Indonesia', continent: 'Australia', node: 'Territory_Indonesia', socket: 'socket_Indonesia', pawn: [0.5808, 0.044, 0.2112], card: 'artillery' },
  NewGuinea: { id: 'NewGuinea', name: 'New Guinea', continent: 'Australia', node: 'Territory_NewGuinea', socket: 'socket_NewGuinea', pawn: [0.7621, 0.044, 0.1971], card: 'infantry' },
  WesternAustralia: { id: 'WesternAustralia', name: 'Western Australia', continent: 'Australia', node: 'Territory_WesternAustralia', socket: 'socket_WesternAustralia', pawn: [0.6424, 0.044, 0.3432], card: 'cavalry' },
  EasternAustralia: { id: 'EasternAustralia', name: 'Eastern Australia', continent: 'Australia', node: 'Territory_EasternAustralia', socket: 'socket_EasternAustralia', pawn: [0.7568, 0.044, 0.3432], card: 'artillery' },
};

export const TERRITORY_IDS = Object.keys(TERRITORIES) as TerritoryId[];
export const CONTINENT_IDS = Object.keys(CONTINENTS) as ContinentId[];

/** The 83 official borders (undirected). */
export const BORDERS: [TerritoryId, TerritoryId][] = [["Alaska", "NorthwestTerritory"], ["Alaska", "Alberta"], ["Alaska", "Kamchatka"], ["NorthwestTerritory", "Alberta"], ["NorthwestTerritory", "Ontario"], ["NorthwestTerritory", "Greenland"], ["Greenland", "Ontario"], ["Greenland", "Quebec"], ["Greenland", "Iceland"], ["Alberta", "Ontario"], ["Alberta", "WesternUS"], ["Ontario", "WesternUS"], ["Ontario", "EasternUS"], ["Ontario", "Quebec"], ["Quebec", "EasternUS"], ["WesternUS", "EasternUS"], ["WesternUS", "CentralAmerica"], ["EasternUS", "CentralAmerica"], ["CentralAmerica", "Venezuela"], ["Venezuela", "Peru"], ["Venezuela", "Brazil"], ["Peru", "Brazil"], ["Peru", "Argentina"], ["Brazil", "Argentina"], ["Brazil", "NorthAfrica"], ["NorthAfrica", "WesternEurope"], ["NorthAfrica", "SouthernEurope"], ["NorthAfrica", "Egypt"], ["NorthAfrica", "EastAfrica"], ["NorthAfrica", "Congo"], ["Egypt", "SouthernEurope"], ["Egypt", "MiddleEast"], ["Egypt", "EastAfrica"], ["EastAfrica", "Congo"], ["EastAfrica", "SouthAfrica"], ["EastAfrica", "Madagascar"], ["EastAfrica", "MiddleEast"], ["Congo", "SouthAfrica"], ["SouthAfrica", "Madagascar"], ["Iceland", "GreatBritain"], ["Iceland", "Scandinavia"], ["GreatBritain", "Scandinavia"], ["GreatBritain", "NorthernEurope"], ["GreatBritain", "WesternEurope"], ["Scandinavia", "NorthernEurope"], ["Scandinavia", "Ukraine"], ["NorthernEurope", "Ukraine"], ["NorthernEurope", "SouthernEurope"], ["NorthernEurope", "WesternEurope"], ["WesternEurope", "SouthernEurope"], ["SouthernEurope", "Ukraine"], ["SouthernEurope", "MiddleEast"], ["Ukraine", "MiddleEast"], ["Ukraine", "Afghanistan"], ["Ukraine", "Ural"], ["Ural", "Afghanistan"], ["Ural", "China"], ["Ural", "Siberia"], ["Siberia", "China"], ["Siberia", "Mongolia"], ["Siberia", "Irkutsk"], ["Siberia", "Yakutsk"], ["Yakutsk", "Irkutsk"], ["Yakutsk", "Kamchatka"], ["Kamchatka", "Irkutsk"], ["Kamchatka", "Mongolia"], ["Kamchatka", "Japan"], ["Irkutsk", "Mongolia"], ["Mongolia", "China"], ["Mongolia", "Japan"], ["Afghanistan", "China"], ["Afghanistan", "India"], ["Afghanistan", "MiddleEast"], ["China", "Siam"], ["China", "India"], ["MiddleEast", "India"], ["India", "Siam"], ["Siam", "Indonesia"], ["Indonesia", "NewGuinea"], ["Indonesia", "WesternAustralia"], ["NewGuinea", "WesternAustralia"], ["NewGuinea", "EasternAustralia"], ["WesternAustralia", "EasternAustralia"]] as [TerritoryId, TerritoryId][];

/** Borders across water, drawn as dashed routes on the board (Alaska-Kamchatka wraps around the edge). */
export const SEA_ROUTES: [TerritoryId, TerritoryId][] = [["Greenland", "NorthwestTerritory"], ["Greenland", "Ontario"], ["Greenland", "Quebec"], ["Greenland", "Iceland"], ["Iceland", "GreatBritain"], ["Iceland", "Scandinavia"], ["GreatBritain", "Scandinavia"], ["GreatBritain", "NorthernEurope"], ["GreatBritain", "WesternEurope"], ["Brazil", "NorthAfrica"], ["WesternEurope", "NorthAfrica"], ["SouthernEurope", "NorthAfrica"], ["SouthernEurope", "Egypt"], ["EastAfrica", "Madagascar"], ["SouthAfrica", "Madagascar"], ["Kamchatka", "Japan"], ["Mongolia", "Japan"], ["Siam", "Indonesia"], ["Indonesia", "NewGuinea"], ["Indonesia", "WesternAustralia"], ["NewGuinea", "WesternAustralia"], ["NewGuinea", "EasternAustralia"], ["CentralAmerica", "Venezuela"], ["Alaska", "Kamchatka"]] as [TerritoryId, TerritoryId][];

export const ADJACENT: Record<TerritoryId, TerritoryId[]> = (() => {
  const m = Object.fromEntries(TERRITORY_IDS.map((t) => [t, [] as TerritoryId[]])) as Record<TerritoryId, TerritoryId[]>;
  for (const [a, b] of BORDERS) { m[a].push(b); m[b].push(a); }
  return m;
})();

export const isAdjacent = (a: TerritoryId, b: TerritoryId) => ADJACENT[a].includes(b);
