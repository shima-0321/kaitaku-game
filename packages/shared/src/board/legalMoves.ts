import type { Board, VertexId, EdgeId } from '../types/board.js';

/** True if a road or ship of this player's touches the vertex -- either piece can anchor the
 * other, per the official rule that a ship route extends from a coastal settlement/road and a
 * road can extend inland from wherever a ship first made landfall. */
function hasOwnRouteAt(board: Board, vertexId: VertexId, playerId: string, excludeEdgeId?: EdgeId): boolean {
  const vertex = board.vertices[vertexId];
  if (!vertex) return false;
  return vertex.edgeIds.some((eId) => {
    if (eId === excludeEdgeId) return false;
    const edge = board.edges[eId];
    return edge?.road?.playerId === playerId || edge?.ship?.playerId === playerId;
  });
}

/** True if any hex touching this edge matches (e.g. "is not SEA" for roads, "is SEA" for ships).
 * An edge with only one real hex (the board's outer boundary) is judged on that hex alone. */
function edgeTouchesTerrain(board: Board, edge: Board['edges'][string], matches: (terrain: string) => boolean): boolean {
  return edge.hexIds.some((hexId) => {
    const terrain = board.tiles[hexId]?.terrain;
    return terrain !== undefined && matches(terrain);
  });
}

export function canPlaceSettlement(
  board: Board,
  vertexId: VertexId,
  playerId: string,
  requireRoadConnection: boolean,
): boolean {
  const vertex = board.vertices[vertexId];
  if (!vertex) return false;
  if (vertex.building) return false;
  // distance rule: no directly-adjacent vertex may already have a building
  for (const adjId of vertex.adjacentVertexIds) {
    if (board.vertices[adjId]?.building) return false;
  }
  if (requireRoadConnection && !hasOwnRouteAt(board, vertexId, playerId)) return false;
  return true;
}

export function canPlaceRoad(board: Board, edgeId: EdgeId, playerId: string): boolean {
  const edge = board.edges[edgeId];
  if (!edge) return false;
  if (edge.road || edge.ship) return false;
  // A road needs land on at least one side -- a pure open-sea edge is ship-only. Every edge on a
  // standard (non-Seafarers) board touches only land tiles, so this is a no-op there.
  if (!edgeTouchesTerrain(board, edge, (t) => t !== 'SEA')) return false;
  for (const vId of edge.vertexIds) {
    const vertex = board.vertices[vId];
    if (!vertex) continue;
    if (vertex.building?.playerId === playerId) return true;
    if (hasOwnRouteAt(board, vId, playerId, edgeId)) return true;
  }
  return false;
}

export function canPlaceShip(board: Board, edgeId: EdgeId, playerId: string): boolean {
  const edge = board.edges[edgeId];
  if (!edge) return false;
  if (edge.road || edge.ship) return false;
  if (!edgeTouchesTerrain(board, edge, (t) => t === 'SEA')) return false;
  for (const vId of edge.vertexIds) {
    const vertex = board.vertices[vId];
    if (!vertex) continue;
    if (vertex.building?.playerId === playerId) return true;
    if (hasOwnRouteAt(board, vId, playerId, edgeId)) return true;
  }
  return false;
}

export function canUpgradeToCity(board: Board, vertexId: VertexId, playerId: string): boolean {
  const vertex = board.vertices[vertexId];
  if (!vertex) return false;
  return vertex.building?.playerId === playerId && vertex.building.type === 'SETTLEMENT';
}

/**
 * Longest contiguous trail (no repeated edges) among a single player's roads and ships combined
 * -- the official rule counts a mixed road/ship route as one trade route. An opponent's
 * settlement/city sitting on the trail cuts it at that vertex.
 */
export function calculateLongestRoad(board: Board, playerId: string): number {
  const playerEdges = Object.values(board.edges).filter((e) => e.road?.playerId === playerId || e.ship?.playerId === playerId);
  if (playerEdges.length === 0) return 0;

  const edgesByVertex = new Map<VertexId, EdgeId[]>();
  for (const e of playerEdges) {
    for (const v of e.vertexIds) {
      if (!edgesByVertex.has(v)) edgesByVertex.set(v, []);
      edgesByVertex.get(v)!.push(e.id);
    }
  }
  const edgeById = new Map(playerEdges.map((e) => [e.id, e]));

  const isBlockedByOpponent = (vertexId: VertexId): boolean => {
    const building = board.vertices[vertexId]?.building;
    return !!building && building.playerId !== playerId;
  };

  let best = 0;

  function dfs(currentVertex: VertexId, usedEdges: Set<EdgeId>, length: number) {
    best = Math.max(best, length);
    if (length > 0 && isBlockedByOpponent(currentVertex)) return;
    for (const eId of edgesByVertex.get(currentVertex) ?? []) {
      if (usedEdges.has(eId)) continue;
      const edge = edgeById.get(eId)!;
      const nextVertex = edge.vertexIds[0] === currentVertex ? edge.vertexIds[1] : edge.vertexIds[0];
      usedEdges.add(eId);
      dfs(nextVertex, usedEdges, length + 1);
      usedEdges.delete(eId);
    }
  }

  const startVertices = new Set<VertexId>();
  for (const e of playerEdges) {
    startVertices.add(e.vertexIds[0]);
    startVertices.add(e.vertexIds[1]);
  }
  for (const start of startVertices) {
    dfs(start, new Set(), 0);
  }

  return best;
}

/** Ties keep the current holder (official rule); a strictly new max takes over. */
export function determineLongestRoadHolder(
  board: Board,
  playerIds: string[],
  currentHolder: string | null,
): string | null {
  const lengths = new Map(playerIds.map((id) => [id, calculateLongestRoad(board, id)]));
  const maxLength = Math.max(0, ...Array.from(lengths.values()));
  if (maxLength < 5) return null;

  if (currentHolder && lengths.get(currentHolder) === maxLength) return currentHolder;
  const holders = playerIds.filter((id) => lengths.get(id) === maxLength);
  return holders[0] ?? null;
}

export function determineLargestArmyHolder(
  knightsPlayed: Record<string, number>,
  playerIds: string[],
  currentHolder: string | null,
): string | null {
  const maxKnights = Math.max(0, ...playerIds.map((id) => knightsPlayed[id] ?? 0));
  if (maxKnights < 3) return null;

  if (currentHolder && (knightsPlayed[currentHolder] ?? 0) === maxKnights) return currentHolder;
  const holders = playerIds.filter((id) => (knightsPlayed[id] ?? 0) === maxKnights);
  return holders[0] ?? null;
}
