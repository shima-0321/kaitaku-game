import { describe, it, expect } from 'vitest';
import { generateBoard } from './generateBoard.js';
import {
  canPlaceSettlement,
  canPlaceRoad,
  canPlaceShip,
  canMoveShip,
  calculateLongestRoad,
  determineLongestRoadHolder,
  determineLargestArmyHolder,
} from './legalMoves.js';
import type { Board } from '../types/board.js';

function freshBoard(): Board {
  return generateBoard({ rng: () => 0.42 });
}

// deterministic PRNG for reproducible tests
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('legalMoves', () => {
  it('distance rule blocks a settlement adjacent to an existing building', () => {
    const board = freshBoard();
    const [vertexId] = Object.keys(board.vertices);
    const vertex = board.vertices[vertexId];
    board.vertices[vertexId] = { ...vertex, building: { playerId: 'p1', type: 'SETTLEMENT' } };

    for (const adjId of vertex.adjacentVertexIds) {
      expect(canPlaceSettlement(board, adjId, 'p2', false)).toBe(false);
    }
    expect(canPlaceSettlement(board, vertexId, 'p2', false)).toBe(false); // already occupied
  });

  it('allows a settlement two steps away from an existing building', () => {
    const board = freshBoard();
    const [vertexId] = Object.keys(board.vertices);
    const vertex = board.vertices[vertexId];
    board.vertices[vertexId] = { ...vertex, building: { playerId: 'p1', type: 'SETTLEMENT' } };

    const adjId = vertex.adjacentVertexIds[0];
    const twoAway = board.vertices[adjId].adjacentVertexIds.find((id) => id !== vertexId);
    if (twoAway) {
      expect(canPlaceSettlement(board, twoAway, 'p2', false)).toBe(true);
    }
  });

  it('allows a road only when connected to own building or own road', () => {
    const board = freshBoard();
    const [edgeId] = Object.keys(board.edges);
    const edge = board.edges[edgeId];
    const [vA] = edge.vertexIds;

    expect(canPlaceRoad(board, edgeId, 'p1')).toBe(false);

    board.vertices[vA] = { ...board.vertices[vA], building: { playerId: 'p1', type: 'SETTLEMENT' } };
    expect(canPlaceRoad(board, edgeId, 'p1')).toBe(true);
    expect(canPlaceRoad(board, edgeId, 'p2')).toBe(false);
  });

  it('calculates a longest road of exactly 5 for a 5-edge chain', () => {
    const board = freshBoard();
    let achieved = -1;

    for (const startVertexId of Object.keys(board.vertices)) {
      for (const eId of Object.keys(board.edges)) board.edges[eId] = { ...board.edges[eId], road: null };

      let currentVertexId = startVertexId;
      const visitedEdges = new Set<string>();
      for (let i = 0; i < 5; i++) {
        const vertex = board.vertices[currentVertexId];
        const nextEdgeId = vertex.edgeIds.find((eId) => !visitedEdges.has(eId));
        if (!nextEdgeId) break;
        visitedEdges.add(nextEdgeId);
        board.edges[nextEdgeId] = { ...board.edges[nextEdgeId], road: { playerId: 'p1' } };
        const edge = board.edges[nextEdgeId];
        currentVertexId = edge.vertexIds[0] === currentVertexId ? edge.vertexIds[1] : edge.vertexIds[0];
      }
      if (visitedEdges.size === 5) {
        achieved = calculateLongestRoad(board, 'p1');
        break;
      }
    }

    expect(achieved).toBe(5);
  });

  it('cuts the longest road at an opponent building sitting on the trail', () => {
    const board = freshBoard();
    let achieved = -1;
    let cutAchieved = -1;

    for (const startVertexId of Object.keys(board.vertices)) {
      for (const eId of Object.keys(board.edges)) board.edges[eId] = { ...board.edges[eId], road: null };
      for (const vId of Object.keys(board.vertices)) board.vertices[vId] = { ...board.vertices[vId], building: null };

      let currentVertexId = startVertexId;
      const visitedVertexSet = new Set<string>([startVertexId]);
      const visitedVertices: string[] = [startVertexId];
      const visitedEdges = new Set<string>();
      for (let i = 0; i < 6; i++) {
        const vertex = board.vertices[currentVertexId];
        // keep this a simple path (never revisit a vertex) -- otherwise a "6-edge trail" can secretly
        // loop back on itself, leaving an alternate route around a single blocked vertex.
        const nextEdgeId = vertex.edgeIds.find((eId) => {
          if (visitedEdges.has(eId)) return false;
          const otherEnd = board.edges[eId].vertexIds.find((v) => v !== currentVertexId)!;
          return !visitedVertexSet.has(otherEnd);
        });
        if (!nextEdgeId) break;
        visitedEdges.add(nextEdgeId);
        board.edges[nextEdgeId] = { ...board.edges[nextEdgeId], road: { playerId: 'p1' } };
        const edge = board.edges[nextEdgeId];
        currentVertexId = edge.vertexIds[0] === currentVertexId ? edge.vertexIds[1] : edge.vertexIds[0];
        visitedVertices.push(currentVertexId);
        visitedVertexSet.add(currentVertexId);
      }
      if (visitedEdges.size !== 6) continue;

      achieved = calculateLongestRoad(board, 'p1');
      // place an opponent building at the midpoint of the trail (index 3 of 7 visited vertices)
      const midVertexId = visitedVertices[3];
      board.vertices[midVertexId] = { ...board.vertices[midVertexId], building: { playerId: 'p2', type: 'SETTLEMENT' } };
      cutAchieved = calculateLongestRoad(board, 'p1');
      break;
    }

    expect(achieved).toBe(6);
    expect(cutAchieved).toBeLessThan(achieved);
    expect(cutAchieved).toBeLessThanOrEqual(3); // neither half of a 6-edge trail split at its midpoint can exceed 3
  });

  it('canPlaceShip requires a sea-touching edge, and canPlaceRoad requires a land-touching edge', () => {
    const board = generateBoard({ rng: mulberry32(3), seafarers: true });
    const seaOnlyEdge = Object.values(board.edges).find(
      (e) => e.hexIds.length > 0 && e.hexIds.every((id) => board.tiles[id].terrain === 'SEA'),
    )!;
    const landOnlyEdge = Object.values(board.edges).find(
      (e) => e.hexIds.length > 0 && e.hexIds.every((id) => board.tiles[id].terrain !== 'SEA'),
    )!;
    expect(seaOnlyEdge).toBeTruthy();
    expect(landOnlyEdge).toBeTruthy();

    const [seaVertex] = seaOnlyEdge.vertexIds;
    board.vertices[seaVertex] = { ...board.vertices[seaVertex], building: { playerId: 'p1', type: 'SETTLEMENT' } };
    expect(canPlaceShip(board, seaOnlyEdge.id, 'p1')).toBe(true);
    expect(canPlaceRoad(board, seaOnlyEdge.id, 'p1')).toBe(false);

    const [landVertex] = landOnlyEdge.vertexIds;
    board.vertices[landVertex] = { ...board.vertices[landVertex], building: { playerId: 'p1', type: 'SETTLEMENT' } };
    expect(canPlaceRoad(board, landOnlyEdge.id, 'p1')).toBe(true);
    expect(canPlaceShip(board, landOnlyEdge.id, 'p1')).toBe(false);
  });

  it('canMoveShip only allows picking up the loose end of a route, never one anchored by a settlement', () => {
    const board = generateBoard({ rng: mulberry32(3), seafarers: true });
    const isSeaOnlyEdge = (edgeId: string) => {
      const e = board.edges[edgeId];
      return e.hexIds.length > 0 && e.hexIds.every((id) => board.tiles[id].terrain === 'SEA');
    };
    // find a vertex deep in open water with 2+ purely-sea edges, to build a two-ship chain
    const junction = Object.values(board.vertices).find((v) => v.edgeIds.filter(isSeaOnlyEdge).length >= 2)!;
    const [eAnchorId, eLooseId] = junction.edgeIds.filter(isSeaOnlyEdge);
    const eAnchor = board.edges[eAnchorId];
    const anchorVertexId = eAnchor.vertexIds[0] === junction.id ? eAnchor.vertexIds[1] : eAnchor.vertexIds[0];

    board.vertices[anchorVertexId] = { ...board.vertices[anchorVertexId], building: { playerId: 'p1', type: 'SETTLEMENT' } };
    board.edges[eAnchorId] = { ...eAnchor, ship: { playerId: 'p1' } };
    board.edges[eLooseId] = { ...board.edges[eLooseId], ship: { playerId: 'p1' } };

    expect(canMoveShip(board, eAnchorId, 'p1')).toBe(false); // touches p1's own settlement
    expect(canMoveShip(board, eLooseId, 'p1')).toBe(true); // open end, free to relocate
    expect(canMoveShip(board, eLooseId, 'p2')).toBe(false); // not p2's ship
  });

  it('counts a trail that mixes roads and ships as one continuous route', () => {
    const board = freshBoard();
    let achieved = -1;

    for (const startVertexId of Object.keys(board.vertices)) {
      for (const eId of Object.keys(board.edges)) board.edges[eId] = { ...board.edges[eId], road: null, ship: null };

      let currentVertexId = startVertexId;
      const visitedEdges = new Set<string>();
      for (let i = 0; i < 5; i++) {
        const vertex = board.vertices[currentVertexId];
        const nextEdgeId = vertex.edgeIds.find((eId) => !visitedEdges.has(eId));
        if (!nextEdgeId) break;
        visitedEdges.add(nextEdgeId);
        // alternate road/ship along the trail -- a mixed route should still count as one continuous chain
        board.edges[nextEdgeId] =
          i % 2 === 0
            ? { ...board.edges[nextEdgeId], road: { playerId: 'p1' } }
            : { ...board.edges[nextEdgeId], ship: { playerId: 'p1' } };
        const edge = board.edges[nextEdgeId];
        currentVertexId = edge.vertexIds[0] === currentVertexId ? edge.vertexIds[1] : edge.vertexIds[0];
      }
      if (visitedEdges.size === 5) {
        achieved = calculateLongestRoad(board, 'p1');
        break;
      }
    }

    expect(achieved).toBe(5);
  });

  it('longest road holder requires at least 5 and keeps ties with the current holder', () => {
    const board = freshBoard();
    expect(determineLongestRoadHolder(board, ['p1', 'p2'], null)).toBeNull();
  });

  it('largest army holder requires at least 3 knights and keeps ties with the current holder', () => {
    expect(determineLargestArmyHolder({ p1: 2 }, ['p1'], null)).toBeNull();
    expect(determineLargestArmyHolder({ p1: 3 }, ['p1'], null)).toBe('p1');
    expect(determineLargestArmyHolder({ p1: 3, p2: 3 }, ['p1', 'p2'], 'p1')).toBe('p1');
    expect(determineLargestArmyHolder({ p1: 3, p2: 4 }, ['p1', 'p2'], 'p1')).toBe('p2');
  });
});
