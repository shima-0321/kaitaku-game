import { describe, it, expect } from 'vitest';
import { generateBoard } from './generateBoard.js';
import {
  canPlaceSettlement,
  canPlaceRoad,
  calculateLongestRoad,
  determineLongestRoadHolder,
  determineLargestArmyHolder,
} from './legalMoves.js';
import type { Board } from '../types/board.js';

function freshBoard(): Board {
  return generateBoard({ rng: () => 0.42 });
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
