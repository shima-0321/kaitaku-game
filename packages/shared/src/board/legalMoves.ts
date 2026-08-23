import type { Board, VertexId, EdgeId } from '../types/board.js';

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
  if (requireRoadConnection) {
    const connected = vertex.edgeIds.some((eId) => board.edges[eId]?.road?.playerId === playerId);
    if (!connected) return false;
  }
  return true;
}

export function canPlaceRoad(board: Board, edgeId: EdgeId, playerId: string): boolean {
  const edge = board.edges[edgeId];
  if (!edge) return false;
  if (edge.road) return false;
  for (const vId of edge.vertexIds) {
    const vertex = board.vertices[vId];
    if (!vertex) continue;
    if (vertex.building?.playerId === playerId) return true;
    const hasOwnRoad = vertex.edgeIds.some((eId) => eId !== edgeId && board.edges[eId]?.road?.playerId === playerId);
    if (hasOwnRoad) return true;
  }
  return false;
}

export function canUpgradeToCity(board: Board, vertexId: VertexId, playerId: string): boolean {
  const vertex = board.vertices[vertexId];
  if (!vertex) return false;
  return vertex.building?.playerId === playerId && vertex.building.type === 'SETTLEMENT';
}

/**
 * Longest contiguous trail (no repeated edges) among a single player's roads.
 * An opponent's settlement/city sitting on the trail cuts it at that vertex.
 */
export function calculateLongestRoad(board: Board, playerId: string): number {
  const playerEdges = Object.values(board.edges).filter((e) => e.road?.playerId === playerId);
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
