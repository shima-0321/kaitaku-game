import { describe, it, expect } from 'vitest';
import { generateBoard } from '../board/generateBoard.js';
import { calculateResourceGains, applyBankScarcity } from './bank.js';
import { createEmptyHand } from '../types/game.js';
import type { Board } from '../types/board.js';

function freshBoard(): Board {
  return generateBoard({ rng: () => 0.42 });
}

function firstProducingTile(board: Board) {
  const tile = Object.values(board.tiles).find((t) => t.numberToken !== null && t.id !== board.robberHexId);
  if (!tile) throw new Error('no producing tile found');
  return tile;
}

function vertexOnTile(board: Board, hexId: string) {
  const vertex = Object.values(board.vertices).find((v) => v.hexIds.includes(hexId));
  if (!vertex) throw new Error('no vertex found on tile');
  return vertex;
}

describe('calculateResourceGains', () => {
  it('grants 1 resource for a settlement and 2 for a city on a matching roll', () => {
    const board = freshBoard();
    const tile = firstProducingTile(board);
    const vertex = vertexOnTile(board, tile.id);
    board.vertices[vertex.id] = { ...vertex, building: { playerId: 'p1', type: 'SETTLEMENT' } };

    const gains = calculateResourceGains(board, tile.numberToken!);
    const gain = gains.find((g) => g.playerId === 'p1');
    expect(gain?.amount).toBe(1);

    board.vertices[vertex.id] = { ...board.vertices[vertex.id], building: { playerId: 'p1', type: 'CITY' } };
    const cityGains = calculateResourceGains(board, tile.numberToken!);
    expect(cityGains.find((g) => g.playerId === 'p1')?.amount).toBe(2);
  });

  it('never produces from the tile currently holding the robber', () => {
    const board = freshBoard();
    const tile = firstProducingTile(board);
    const vertex = vertexOnTile(board, tile.id);
    board.vertices[vertex.id] = { ...vertex, building: { playerId: 'p1', type: 'SETTLEMENT' } };
    board.robberHexId = tile.id;

    const gains = calculateResourceGains(board, tile.numberToken!);
    expect(gains.find((g) => g.playerId === 'p1')).toBeUndefined();
  });
});

describe('applyBankScarcity', () => {
  it('grants resources normally when the bank has enough', () => {
    const bank = { ...createEmptyHand(), BRICK: 19 };
    const gains = [{ playerId: 'p1', resource: 'BRICK' as const, amount: 2 }];
    expect(applyBankScarcity(gains, bank)).toEqual(gains);
  });

  it('gives the sole claimant whatever remains when the bank is short', () => {
    const bank = { ...createEmptyHand(), BRICK: 1 };
    const gains = [{ playerId: 'p1', resource: 'BRICK' as const, amount: 3 }];
    expect(applyBankScarcity(gains, bank)).toEqual([{ playerId: 'p1', resource: 'BRICK', amount: 1 }]);
  });

  it('gives nobody the resource when 2+ players are entitled and the bank cannot cover both', () => {
    const bank = { ...createEmptyHand(), BRICK: 2 };
    const gains = [
      { playerId: 'p1', resource: 'BRICK' as const, amount: 2 },
      { playerId: 'p2', resource: 'BRICK' as const, amount: 2 },
    ];
    expect(applyBankScarcity(gains, bank)).toEqual([]);
  });
});
