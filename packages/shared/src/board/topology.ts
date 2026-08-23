import type { HexCoord, HexId, VertexId, EdgeId } from '../types/board.js';

export const BOARD_RADIUS = 2;

/** Flat-top hex, 6 directions listed consecutively around the hex (axial coords). */
export const HEX_DIRECTIONS: HexCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexKey(coord: HexCoord): HexId {
  return `${coord.q},${coord.r}`;
}

export function parseHexKey(id: HexId): HexCoord {
  const [q, r] = id.split(',').map(Number);
  return { q, r };
}

export function hexAdd(a: HexCoord, b: HexCoord): HexCoord {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function hexDistance(a: HexCoord, b: HexCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Standard 19-tile board: every hex within `radius` cube-distance of the center. */
export function generateStandardHexCoords(radius: number = BOARD_RADIUS): HexCoord[] {
  const coords: HexCoord[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      const s = -q - r;
      if (Math.abs(q) <= radius && Math.abs(r) <= radius && Math.abs(s) <= radius) {
        coords.push({ q, r });
      }
    }
  }
  return coords;
}

/**
 * A vertex is uniquely identified by the sorted set of the (up to 3) hex
 * coordinates that touch it. Off-board "virtual" hexes are included in the
 * id on purpose: this lets every vertex/edge -- interior or on the coastline
 * -- get a stable id without needing pixel coordinates.
 */
function idFromHexes(hexes: HexCoord[]): string {
  return hexes.map(hexKey).sort().join('|');
}

/**
 * Recovers the (2-3) hex coordinates encoded in a vertex/edge id, including any off-board
 * "virtual" hexes. Useful for pixel-layout math on the client, where averaging the centers of
 * these hexes gives the correct on-screen position for coastal vertices/edges too.
 */
export function parseVertexOrEdgeId(id: VertexId | EdgeId): HexCoord[] {
  return id.split('|').map(parseHexKey);
}

export interface TopologyVertex {
  id: VertexId;
  hexIds: HexId[]; // only the real (on-board) hexes touching this vertex
  edgeIds: EdgeId[];
  adjacentVertexIds: VertexId[];
}

export interface TopologyEdge {
  id: EdgeId;
  hexIds: HexId[]; // only the real (on-board) hexes touching this edge
  vertexIds: [VertexId, VertexId];
}

export interface Topology {
  vertices: Map<VertexId, TopologyVertex>;
  edges: Map<EdgeId, TopologyEdge>;
}

/** Builds the full vertex/edge graph for a given set of tile coordinates. */
export function buildTopology(tileCoords: HexCoord[]): Topology {
  const realHexSet = new Set(tileCoords.map(hexKey));
  const isReal = (h: HexCoord) => realHexSet.has(hexKey(h));

  const vertexRealHexes = new Map<VertexId, HexCoord[]>();
  const edgeRealHexes = new Map<EdgeId, HexCoord[]>();
  const edgeVertexPairs = new Map<EdgeId, [VertexId, VertexId]>();
  const vertexEdgeIds = new Map<VertexId, Set<EdgeId>>();
  const vertexAdjacency = new Map<VertexId, Set<VertexId>>();

  const addVertex = (hexes: HexCoord[]) => {
    const id = idFromHexes(hexes);
    if (!vertexRealHexes.has(id)) {
      vertexRealHexes.set(id, hexes.filter(isReal));
      vertexEdgeIds.set(id, new Set());
      vertexAdjacency.set(id, new Set());
    }
    return id;
  };
  const addEdge = (hexes: HexCoord[]) => {
    const id = idFromHexes(hexes);
    if (!edgeRealHexes.has(id)) {
      edgeRealHexes.set(id, hexes.filter(isReal));
    }
    return id;
  };

  for (const hex of tileCoords) {
    for (let i = 0; i < 6; i++) {
      const dPrev = HEX_DIRECTIONS[(i + 5) % 6];
      const d = HEX_DIRECTIONS[i];
      const dNext = HEX_DIRECTIONS[(i + 1) % 6];
      const hPrev = hexAdd(hex, dPrev);
      const h = hexAdd(hex, d);
      const hNext = hexAdd(hex, dNext);

      // edge between hex and its neighbor in direction i
      const eId = addEdge([hex, h]);

      // the two vertices at either end of that edge
      const vA = addVertex([hex, hPrev, h]);
      const vB = addVertex([hex, h, hNext]);

      if (!edgeVertexPairs.has(eId)) {
        edgeVertexPairs.set(eId, [vA, vB]);
      }
    }
  }

  for (const [eId, [vA, vB]] of edgeVertexPairs) {
    vertexEdgeIds.get(vA)!.add(eId);
    vertexEdgeIds.get(vB)!.add(eId);
    vertexAdjacency.get(vA)!.add(vB);
    vertexAdjacency.get(vB)!.add(vA);
  }

  const vertices = new Map<VertexId, TopologyVertex>();
  for (const [id, hexes] of vertexRealHexes) {
    vertices.set(id, {
      id,
      hexIds: hexes.map(hexKey),
      edgeIds: Array.from(vertexEdgeIds.get(id) ?? []),
      adjacentVertexIds: Array.from(vertexAdjacency.get(id) ?? []),
    });
  }

  const edges = new Map<EdgeId, TopologyEdge>();
  for (const [id, hexes] of edgeRealHexes) {
    const pair = edgeVertexPairs.get(id);
    if (!pair) continue;
    edges.set(id, {
      id,
      hexIds: hexes.map(hexKey),
      vertexIds: pair,
    });
  }

  return { vertices, edges };
}
