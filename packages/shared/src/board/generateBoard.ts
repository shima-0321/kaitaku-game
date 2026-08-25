import type { Board, Tile, TerrainType, Port, PortType, HexId, VertexId, EdgeId, BoardMode } from '../types/board.js';
import {
  generateStandardHexCoords,
  generateExtendedHexCoords,
  buildTopology,
  hexKey,
  hexAdd,
  HEX_DIRECTIONS,
  type Topology,
} from './topology.js';

/** Board sizing kicks in at 5+ players (the 5-6 player extension's island) -- 3-4 players still
 * get the standard 19-tile board, unchanged. */
const EXTENDED_BOARD_MIN_PLAYERS = 5;

const STANDARD_TERRAIN_COUNTS: Record<TerrainType, number> = {
  HILLS: 3,
  PASTURE: 4,
  MOUNTAINS: 3,
  FOREST: 4,
  FIELDS: 4,
  DESERT: 1,
  SEA: 0,
  GOLD: 0,
};

/** Each resource terrain +2, desert +1 (11 more tiles, 19 -> 30), per the official extension. */
const EXTENDED_TERRAIN_COUNTS: Record<TerrainType, number> = {
  HILLS: 5,
  PASTURE: 6,
  MOUNTAINS: 5,
  FOREST: 6,
  FIELDS: 6,
  DESERT: 2,
  SEA: 0,
  GOLD: 0,
};

/** One gold tile plus one of each other resource terrain (6 total), for the two 3-tile
 * discovery islands on a Seafarers board. */
const SEAFARERS_SATELLITE_TERRAIN_COUNTS: Record<TerrainType, number> = {
  HILLS: 1,
  PASTURE: 1,
  MOUNTAINS: 1,
  FOREST: 1,
  FIELDS: 1,
  DESERT: 0,
  SEA: 0,
  GOLD: 1,
};

const STANDARD_NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

/** One more of every number (2-12 except 7) on top of the standard set, matching the 28
 * non-desert tiles on the extended board. */
const EXTENDED_NUMBER_TOKENS = [...STANDARD_NUMBER_TOKENS, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12];

const STANDARD_PORT_TYPES: PortType[] = ['GENERIC', 'GENERIC', 'GENERIC', 'GENERIC', 'BRICK', 'LUMBER', 'WOOL', 'GRAIN', 'ORE'];
const STANDARD_PORT_COUNT = 9;

/** Two more generic (3:1) ports for the longer coastline. */
const EXTENDED_PORT_TYPES: PortType[] = [...STANDARD_PORT_TYPES, 'GENERIC', 'GENERIC'];
const EXTENDED_PORT_COUNT = 11;

/**
 * Seafarers board: the standard 19-tile island, a ring of open sea, and two small 3-tile
 * "discovery" islands (one carrying the single gold tile) out at the edge of a radius-4 footprint.
 * Built on top of the plain radius-4 hexagon (generateStandardHexCoords(4)) rather than a bespoke
 * shape -- only *which* of those 61 coordinates are land/sea needs deciding here.
 */
const SEAFARERS_FOOTPRINT_RADIUS = 4;
const SEAFARERS_MAIN_ISLAND_RADIUS = 2;

const SEAFARERS_SATELLITE_A: { q: number; r: number }[] = [
  { q: -4, r: 4 },
  { q: -3, r: 4 },
  { q: -2, r: 4 },
];
const SEAFARERS_SATELLITE_B: { q: number; r: number }[] = [
  { q: 4, r: -4 },
  { q: 3, r: -4 },
  { q: 2, r: -4 },
];

// One per non-desert satellite tile (6, including gold) -- a shorter list here would silently
// leave one tile (possibly gold itself) with a null number and no way to ever produce.
const SEAFARERS_SATELLITE_NUMBER_TOKENS = [4, 5, 6, 8, 9, 11];

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildTerrainList(terrainCounts: Record<TerrainType, number>): TerrainType[] {
  const list: TerrainType[] = [];
  for (const [terrain, count] of Object.entries(terrainCounts) as [TerrainType, number][]) {
    for (let i = 0; i < count; i++) list.push(terrain);
  }
  return list;
}

function assignTerrainAndNumbers(
  hexCoords: ReturnType<typeof generateStandardHexCoords>,
  rng: () => number,
  terrainCounts: Record<TerrainType, number>,
  numberTokens: number[],
): { terrain: Map<HexId, TerrainType>; numbers: Map<HexId, number | null> } {
  const shuffledTerrain = shuffle(buildTerrainList(terrainCounts), rng);
  const terrain = new Map<HexId, TerrainType>();
  hexCoords.forEach((hex, i) => terrain.set(hexKey(hex), shuffledTerrain[i]));

  const nonDesertHexIds = hexCoords.map(hexKey).filter((id) => terrain.get(id) !== 'DESERT');
  const shuffledNumbers = shuffle(numberTokens, rng);
  const numbers = new Map<HexId, number | null>();
  hexCoords.forEach((hex) => numbers.set(hexKey(hex), null));
  nonDesertHexIds.forEach((id, i) => numbers.set(id, shuffledNumbers[i]));

  return { terrain, numbers };
}

/** Assigns the main island (standard 19-tile shuffle) and the two 3-tile satellite islands
 * independently, then fills every remaining coordinate in the footprint with sea. */
function assignSeafarersTerrainAndNumbers(
  allHexCoords: ReturnType<typeof generateStandardHexCoords>,
  mainIslandCoords: ReturnType<typeof generateStandardHexCoords>,
  satelliteCoords: ReturnType<typeof generateStandardHexCoords>,
  rng: () => number,
): { terrain: Map<HexId, TerrainType>; numbers: Map<HexId, number | null> } {
  const mainResult = assignTerrainAndNumbers(mainIslandCoords, rng, STANDARD_TERRAIN_COUNTS, STANDARD_NUMBER_TOKENS);
  const satelliteResult = assignTerrainAndNumbers(satelliteCoords, rng, SEAFARERS_SATELLITE_TERRAIN_COUNTS, SEAFARERS_SATELLITE_NUMBER_TOKENS);

  const terrain = new Map<HexId, TerrainType>();
  const numbers = new Map<HexId, number | null>();
  for (const hex of allHexCoords) {
    const id = hexKey(hex);
    terrain.set(id, mainResult.terrain.get(id) ?? satelliteResult.terrain.get(id) ?? 'SEA');
    numbers.set(id, mainResult.numbers.get(id) ?? satelliteResult.numbers.get(id) ?? null);
  }
  return { terrain, numbers };
}

function hasSixEightAdjacency(numbers: Map<HexId, number | null>, tileAdjacency: Map<HexId, HexId[]>): boolean {
  for (const [hexId, neighbors] of tileAdjacency) {
    const num = numbers.get(hexId);
    if (num !== 6 && num !== 8) continue;
    for (const n of neighbors) {
      const nNum = numbers.get(n);
      if (nNum === 6 || nNum === 8) return true;
    }
  }
  return false;
}

/** Counts same-terrain neighbor pairs (each pair counted once) -- this is what makes a board feel
 * "clumpy", e.g. three forest tiles all touching each other in one corner. */
function countSameTerrainAdjacency(terrain: Map<HexId, TerrainType>, tileAdjacency: Map<HexId, HexId[]>): number {
  let count = 0;
  for (const [hexId, neighbors] of tileAdjacency) {
    const t = terrain.get(hexId);
    if (t === 'DESERT') continue;
    for (const n of neighbors) {
      if (n <= hexId) continue; // count each pair once
      if (terrain.get(n) === t) count++;
    }
  }
  return count;
}

const BALANCED_SEARCH_ATTEMPTS = 300;
/** Stop searching once clustering is this low or better -- not worth burning the rest of the
 * search budget chasing a theoretical zero that may not exist for this tile-count mix. */
const BALANCED_TARGET_SCORE = 1;

/** Best-of-N search on top of the normal 6/8 retry: keeps whichever valid layout has the fewest
 * same-terrain adjacent pairs, so resource tiles spread out instead of clumping together. */
function pickBalancedLayout(
  hexCoords: ReturnType<typeof generateStandardHexCoords>,
  tileAdjacency: Map<HexId, HexId[]>,
  rng: () => number,
  terrainCounts: Record<TerrainType, number>,
  numberTokens: number[],
  initial: { terrain: Map<HexId, TerrainType>; numbers: Map<HexId, number | null> },
): { terrain: Map<HexId, TerrainType>; numbers: Map<HexId, number | null> } {
  let best = initial;
  let bestScore = countSameTerrainAdjacency(initial.terrain, tileAdjacency);

  for (let attempt = 0; attempt < BALANCED_SEARCH_ATTEMPTS && bestScore > BALANCED_TARGET_SCORE; attempt++) {
    const candidate = assignTerrainAndNumbers(hexCoords, rng, terrainCounts, numberTokens);
    if (hasSixEightAdjacency(candidate.numbers, tileAdjacency)) continue;
    const score = countSameTerrainAdjacency(candidate.terrain, tileAdjacency);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

export interface GenerateBoardOptions {
  rng?: () => number;
  maxAttempts?: number;
  /** RANDOM (default) keeps the original fully-random shuffle; BALANCED additionally searches for
   * a layout where same-terrain tiles don't cluster together. */
  mode?: BoardMode;
  /** How many players will be seated. 5+ switches to the 5-6 player extension's larger island;
   * anything else (including omitted) keeps the standard 19-tile board. */
  playerCount?: number;
  /** Seafarers house rule: main island + two satellite islands + open sea, with ships/gold/pirate.
   * Takes precedence over playerCount-based sizing (no combined variant yet). BALANCED mode isn't
   * applied to this layout -- only RANDOM's plain shuffle. */
  seafarers?: boolean;
}

export function generateBoard(options: GenerateBoardOptions = {}): Board {
  const rng = options.rng ?? Math.random;
  const maxAttempts = options.maxAttempts ?? 1000;
  const mode = options.mode ?? 'RANDOM';

  if (options.seafarers) {
    return generateSeafarersBoard(rng, maxAttempts);
  }

  const isExtended = (options.playerCount ?? 0) >= EXTENDED_BOARD_MIN_PLAYERS;

  const hexCoords = isExtended ? generateExtendedHexCoords() : generateStandardHexCoords();
  const terrainCounts = isExtended ? EXTENDED_TERRAIN_COUNTS : STANDARD_TERRAIN_COUNTS;
  const numberTokens = isExtended ? EXTENDED_NUMBER_TOKENS : STANDARD_NUMBER_TOKENS;
  const portTypes = isExtended ? EXTENDED_PORT_TYPES : STANDARD_PORT_TYPES;
  const portCount = isExtended ? EXTENDED_PORT_COUNT : STANDARD_PORT_COUNT;

  const topology = buildTopology(hexCoords);
  const realHexSet = new Set(hexCoords.map(hexKey));

  const tileAdjacency = new Map<HexId, HexId[]>();
  for (const hex of hexCoords) {
    const neighbors: HexId[] = [];
    for (const d of HEX_DIRECTIONS) {
      const n = hexKey(hexAdd(hex, d));
      if (realHexSet.has(n)) neighbors.push(n);
    }
    tileAdjacency.set(hexKey(hex), neighbors);
  }

  let result = assignTerrainAndNumbers(hexCoords, rng, terrainCounts, numberTokens);
  for (let attempt = 0; attempt < maxAttempts && hasSixEightAdjacency(result.numbers, tileAdjacency); attempt++) {
    result = assignTerrainAndNumbers(hexCoords, rng, terrainCounts, numberTokens);
  }

  if (mode === 'BALANCED') {
    result = pickBalancedLayout(hexCoords, tileAdjacency, rng, terrainCounts, numberTokens, result);
  }

  const tiles: Record<HexId, Tile> = {};
  let desertHexId: HexId = hexKey(hexCoords[0]);
  for (const hex of hexCoords) {
    const id = hexKey(hex);
    const terrain = result.terrain.get(id)!;
    if (terrain === 'DESERT') desertHexId = id;
    tiles[id] = { id, coord: hex, terrain, numberToken: result.numbers.get(id) ?? null };
  }

  const vertices: Board['vertices'] = {};
  for (const [id, v] of topology.vertices) {
    vertices[id] = {
      id,
      hexIds: v.hexIds,
      edgeIds: v.edgeIds,
      adjacentVertexIds: v.adjacentVertexIds,
      building: null,
      portId: null,
    };
  }
  const edges: Board['edges'] = {};
  for (const [id, e] of topology.edges) {
    edges[id] = { id, hexIds: e.hexIds, vertexIds: e.vertexIds, road: null, ship: null };
  }

  const ports = generatePorts(topology, rng, portTypes, portCount);
  for (const port of ports) {
    for (const vId of port.vertexIds) {
      if (vertices[vId]) vertices[vId].portId = port.id;
    }
  }

  return { tiles, vertices, edges, ports, robberHexId: desertHexId, pirateHexId: null };
}

/** Builds the non-standard Seafarers board: standard main island, two 3-tile satellite islands
 * (one carrying the single gold tile), and open sea filling the rest of a radius-4 footprint.
 * Ports are placed on the main island's coastline only (see generatePorts' landHexIds param). */
function generateSeafarersBoard(rng: () => number, maxAttempts: number): Board {
  const allHexCoords = generateStandardHexCoords(SEAFARERS_FOOTPRINT_RADIUS);
  const mainIslandCoords = generateStandardHexCoords(SEAFARERS_MAIN_ISLAND_RADIUS);
  const satelliteCoords = [...SEAFARERS_SATELLITE_A, ...SEAFARERS_SATELLITE_B];

  const topology = buildTopology(allHexCoords);
  const realHexSet = new Set(allHexCoords.map(hexKey));

  const tileAdjacency = new Map<HexId, HexId[]>();
  for (const hex of allHexCoords) {
    const neighbors: HexId[] = [];
    for (const d of HEX_DIRECTIONS) {
      const n = hexKey(hexAdd(hex, d));
      if (realHexSet.has(n)) neighbors.push(n);
    }
    tileAdjacency.set(hexKey(hex), neighbors);
  }

  let result = assignSeafarersTerrainAndNumbers(allHexCoords, mainIslandCoords, satelliteCoords, rng);
  for (let attempt = 0; attempt < maxAttempts && hasSixEightAdjacency(result.numbers, tileAdjacency); attempt++) {
    result = assignSeafarersTerrainAndNumbers(allHexCoords, mainIslandCoords, satelliteCoords, rng);
  }

  const tiles: Record<HexId, Tile> = {};
  let desertHexId: HexId = hexKey(mainIslandCoords[0]);
  for (const hex of allHexCoords) {
    const id = hexKey(hex);
    const terrain = result.terrain.get(id)!;
    if (terrain === 'DESERT') desertHexId = id;
    tiles[id] = { id, coord: hex, terrain, numberToken: result.numbers.get(id) ?? null };
  }

  const vertices: Board['vertices'] = {};
  for (const [id, v] of topology.vertices) {
    vertices[id] = { id, hexIds: v.hexIds, edgeIds: v.edgeIds, adjacentVertexIds: v.adjacentVertexIds, building: null, portId: null };
  }
  const edges: Board['edges'] = {};
  for (const [id, e] of topology.edges) {
    edges[id] = { id, hexIds: e.hexIds, vertexIds: e.vertexIds, road: null, ship: null };
  }

  const mainIslandHexIds = new Set(mainIslandCoords.map(hexKey));
  const ports = generatePorts(topology, rng, STANDARD_PORT_TYPES, STANDARD_PORT_COUNT, mainIslandHexIds);
  for (const port of ports) {
    for (const vId of port.vertexIds) {
      if (vertices[vId]) vertices[vId].portId = port.id;
    }
  }

  // Pirate starts out somewhere in the open sea, clear of the main island's coast.
  const seaHexIds = allHexCoords.map(hexKey).filter((id) => result.terrain.get(id) === 'SEA');
  const pirateHexId = seaHexIds[Math.floor(rng() * seaHexIds.length)] ?? null;

  return { tiles, vertices, edges, ports, robberHexId: desertHexId, pirateHexId };
}

/** `landHexIds`, when given, restricts the coastline to edges touching one of those hexes and
 * something outside the set (sea or off-board) -- used for the seafarers board so ports only
 * appear on the main island (its satellite islands aren't traced, they'd form separate cycles
 * `traceCoastalCycle` isn't built to walk). Omitted, it falls back to the plain "off-board" check
 * that works for a single landmass with no explicit sea tiles. */
function generatePorts(topology: Topology, rng: () => number, portTypes: PortType[], portCount: number, landHexIds?: Set<HexId>): Port[] {
  const coastalEdges = Array.from(topology.edges.values()).filter((e) => {
    if (!landHexIds) return e.hexIds.length === 1;
    const touchesLand = e.hexIds.some((id) => landHexIds.has(id));
    const touchesNonLand = e.hexIds.length === 1 || e.hexIds.some((id) => !landHexIds.has(id));
    return touchesLand && touchesNonLand;
  });
  const ordered = traceCoastalCycle(coastalEdges);
  const shuffledTypes = shuffle(portTypes, rng);

  const slotCount = Math.min(portCount, ordered.length);
  const ports: Port[] = [];
  for (let i = 0; i < slotCount; i++) {
    const edgeIndex = Math.floor((i * ordered.length) / slotCount);
    const edgeId = ordered[edgeIndex];
    const edge = topology.edges.get(edgeId)!;
    ports.push({ id: `port-${i}`, type: shuffledTypes[i], vertexIds: edge.vertexIds });
  }
  return ports;
}

/** Walks the ring of coastal edges (each sharing exactly one real hex) into a single cyclic order. */
function traceCoastalCycle(edges: { id: EdgeId; vertexIds: [VertexId, VertexId] }[]): EdgeId[] {
  const vertexToEdges = new Map<VertexId, EdgeId[]>();
  for (const e of edges) {
    for (const v of e.vertexIds) {
      if (!vertexToEdges.has(v)) vertexToEdges.set(v, []);
      vertexToEdges.get(v)!.push(e.id);
    }
  }
  const edgeById = new Map(edges.map((e) => [e.id, e]));
  const visited = new Set<EdgeId>();
  const orderedEdgeIds: EdgeId[] = [];
  if (edges.length === 0) return orderedEdgeIds;

  let current = edges[0];
  let enterVertex = current.vertexIds[0];
  for (;;) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    orderedEdgeIds.push(current.id);
    const exitVertex = current.vertexIds[0] === enterVertex ? current.vertexIds[1] : current.vertexIds[0];
    const candidates = vertexToEdges.get(exitVertex) ?? [];
    const nextId = candidates.find((id) => id !== current.id && !visited.has(id));
    if (!nextId) break;
    current = edgeById.get(nextId)!;
    enterVertex = exitVertex;
  }
  return orderedEdgeIds;
}
