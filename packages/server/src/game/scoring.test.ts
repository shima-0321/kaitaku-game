import { describe, it, expect } from 'vitest';
import type { GameState, Player, PlayerColor } from '@catan-online/shared';
import { createEmptyPlayerStats } from '@catan-online/shared';
import { createNewGameState } from './setup.js';
import { calculateScoreBreakdown, calculateTotalVictoryPoints } from './scoring.js';

function makeTestPlayer(id: string, name: string, color: PlayerColor): Player {
  return {
    id,
    name,
    color,
    connected: true,
    sessionToken: `token-${id}`,
    resources: { BRICK: 0, LUMBER: 0, WOOL: 0, GRAIN: 0, ORE: 0 },
    devCards: [],
    buildingStock: { settlements: 5, cities: 4, roads: 15 },
    knightsPlayed: 0,
    stats: createEmptyPlayerStats(),
    isBot: false,
  };
}

function makeState(): GameState {
  const base = createNewGameState('room1', 'ABCDE', 'p0');
  const players = ['p0', 'p1'].map((id, i) => makeTestPlayer(id, `Player ${i}`, (['RED', 'BLUE'] as PlayerColor[])[i]));
  return { ...base, phase: 'PLAYING', players };
}

describe('calculateScoreBreakdown', () => {
  it('itemizes every point source and sums to the same total as calculateTotalVictoryPoints', () => {
    let state = makeState();
    const vertexIds = Object.keys(state.board.vertices);

    state = {
      ...state,
      board: {
        ...state.board,
        vertices: {
          ...state.board.vertices,
          [vertexIds[0]]: { ...state.board.vertices[vertexIds[0]], building: { playerId: 'p0', type: 'SETTLEMENT' } },
          [vertexIds[1]]: { ...state.board.vertices[vertexIds[1]], building: { playerId: 'p0', type: 'SETTLEMENT' } },
          [vertexIds[2]]: { ...state.board.vertices[vertexIds[2]], building: { playerId: 'p0', type: 'CITY' } },
        },
      },
      longestRoadPlayerId: 'p0',
      largestArmyPlayerId: 'p0',
      players: state.players.map((p) =>
        p.id === 'p0'
          ? {
              ...p,
              devCards: [
                { id: 'v1', type: 'VICTORY_POINT', boughtOnTurn: 1, used: false },
                { id: 'v2', type: 'VICTORY_POINT', boughtOnTurn: 1, used: false },
              ],
            }
          : p,
      ),
    };

    const breakdown = calculateScoreBreakdown(state, 'p0');
    expect(breakdown).toEqual({
      settlements: 2,
      cities: 1,
      hasLongestRoad: true,
      hasLargestArmy: true,
      victoryPointCards: 2,
      total: 2 + 2 + 2 + 2 + 2, // 1pt/settlement, 2pt/city, 2pt road, 2pt army, 1pt/VP card
    });
    expect(breakdown.total).toBe(calculateTotalVictoryPoints(state, 'p0'));
  });

  it('reports all zeros for a player with no buildings, bonuses, or VP cards', () => {
    const state = makeState();
    const breakdown = calculateScoreBreakdown(state, 'p1');
    expect(breakdown).toEqual({
      settlements: 0,
      cities: 0,
      hasLongestRoad: false,
      hasLargestArmy: false,
      victoryPointCards: 0,
      total: 0,
    });
  });
});
