import type { Board, Tile, TerrainType, Port, PortType, HexId, VertexId, EdgeId } from '../types/board.js';
import { generateStandardHexCoords, buildTopology, hexKey, hexAdd, HEX_DIRECTIONS, type Topology } from './topology.js';

const TERRAIN_COUNTS: Record<TerrainType, number> = {
  HILLS: 3,
  PASTURE: 4,
  MOUNTAINS: 3,
  FOREST: 4,
  FIELDS: 4,
  DESERT: 1,
};

const NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

const PORT_TYPES: PortType[] = ['GENERIC', 'GENERIC', 'GENERIC', 'GENERIC', 'BRICK', 'LUMBER', 'WOOL', 'GRAIN', 'ORE'];

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildTerrainList(): TerrainType[] {
  const list: TerrainType[] = [];
  for (const [terrain, count] of Object.entries(TERRAIN_COUNTS) as [TerrainType, number][]) {
    for (let i = 0; i < count; i++) list.push(terrain);
  }
  return list;
}

function assignTerrainAndNumbers(
  hexCoords: ReturnType<typeof generateStandardHexCoords>,
  rng: () => number,
): { terrain: Map<HexId, TerrainType>; numbers: Map<HexId, number | null> } {
  const shuffledTerrain = shuffle(buildTerrainList(), rng);
  const terrain = new Map<HexId, TerrainType>();
  hexCoords.forEach((hex, i) => terrain.set(hexKey(hex), shuffledTerrain[i]));

  const nonDesertHexIds = hexCoords.map(hexKey).filter((id) => terrain.get(id) !== 'DESERT');
  const shuffledNumbers = shuffle(NUMBER_TOKENS, rng);
  const numbers = new Map<HexId, number | null>();
  hexCoords.forEach((hex) => numbers.set(hexKey(hex), null));
  nonDesertHexIds.forEach((id, i) => numbers.set(id, shuffledNumbers[i]));

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

export interface GenerateBoardOptions {
  rng?: () => number;
  maxAttempts?: number;
}

export function generateBoard(options: GenerateBoardOptions = {}): Board {
  const rng = options.rng ?? Math.random;
  const maxAttempts = options.maxAttempts ?? 1000;

  const hexCoords = generateStandardHexCoords();
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

  let result = assignTerrainAndNumbers(hexCoords, rng);
  for (let attempt = 0; attempt < maxAttempts && hasSixEightAdjacency(result.numbers, tileAdjacency); attempt++) {
    result = assignTerrainAndNumbers(hexCoords, rng);
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
    edges[id] = { id, hexIds: e.hexIds, vertexIds: e.vertexIds, road: null };
  }

  const ports = generatePorts(topology, rng);
  for (const port of ports) {
    for (const vId of port.vertexIds) {
      if (vertices[vId]) vertices[vId].portId = port.id;
    }
  }

  return { tiles, vertices, edges, ports, robberHexId: desertHexId };
}

function generatePorts(topology: Topology, rng: () => number): Port[] {
  const coastalEdges = Array.from(topology.edges.values()).filter((e) => e.hexIds.length === 1);
  const ordered = traceCoastalCycle(coastalEdges);
  const shuffledTypes = shuffle(PORT_TYPES, rng);

  const slotCount = Math.min(9, ordered.length);
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
