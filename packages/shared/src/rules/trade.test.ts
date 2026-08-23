import { describe, it, expect } from 'vitest';
import { generateBoard } from '../board/generateBoard.js';
import { calculateTradeRatios, validateBankTradeAmounts } from './trade.js';
import type { Board } from '../types/board.js';

function freshBoard(): Board {
  return generateBoard({ rng: () => 0.42 });
}

describe('calculateTradeRatios', () => {
  it('defaults to 4:1 for every resource with no ports owned', () => {
    const board = freshBoard();
    const ratios = calculateTradeRatios(board, 'nobody');
    expect(ratios).toEqual({ BRICK: 4, LUMBER: 4, WOOL: 4, GRAIN: 4, ORE: 4 });
  });

  it('drops to 3:1 across the board when a generic port is owned', () => {
    const board = freshBoard();
    const genericPort = board.ports.find((p) => p.type === 'GENERIC')!;
    const vertexId = genericPort.vertexIds[0];
    board.vertices[vertexId] = { ...board.vertices[vertexId], building: { playerId: 'p1', type: 'SETTLEMENT' } };

    const ratios = calculateTradeRatios(board, 'p1');
    for (const ratio of Object.values(ratios)) expect(ratio).toBe(3);
  });

  it('drops only the matching resource to 2:1 when a specific port is owned', () => {
    const board = freshBoard();
    const specificPort = board.ports.find((p) => p.type !== 'GENERIC')!;
    const vertexId = specificPort.vertexIds[0];
    board.vertices[vertexId] = { ...board.vertices[vertexId], building: { playerId: 'p1', type: 'SETTLEMENT' } };

    const ratios = calculateTradeRatios(board, 'p1');
    expect(ratios[specificPort.type as keyof typeof ratios]).toBe(2);
    const others = Object.entries(ratios).filter(([res]) => res !== specificPort.type);
    for (const [, ratio] of others) expect(ratio).toBe(4);
  });
});

describe('validateBankTradeAmounts', () => {
  const ratios4 = { BRICK: 4, LUMBER: 4, WOOL: 4, GRAIN: 4, ORE: 4 };
  const ratios3 = { BRICK: 3, LUMBER: 3, WOOL: 3, GRAIN: 3, ORE: 3 };
  const ratiosMixed = { BRICK: 2, LUMBER: 4, WOOL: 4, GRAIN: 4, ORE: 4 };

  it('accepts a valid 4:1 trade', () => {
    expect(validateBankTradeAmounts(ratios4, { BRICK: 4 }, { ORE: 1 })).toBe(true);
  });

  it('accepts a valid 3:1 trade via a generic port', () => {
    expect(validateBankTradeAmounts(ratios3, { WOOL: 3 }, { GRAIN: 1 })).toBe(true);
  });

  it('accepts a valid 2:1 trade via a specific port', () => {
    expect(validateBankTradeAmounts(ratiosMixed, { BRICK: 2 }, { ORE: 1 })).toBe(true);
  });

  it('rejects giving and receiving the same resource', () => {
    expect(validateBankTradeAmounts(ratios4, { BRICK: 4 }, { BRICK: 1 })).toBe(false);
  });

  it('rejects an amount that is not a multiple of the ratio', () => {
    expect(validateBankTradeAmounts(ratios4, { BRICK: 3 }, { ORE: 1 })).toBe(false);
  });

  it('rejects a mismatched receive amount', () => {
    expect(validateBankTradeAmounts(ratios4, { BRICK: 8 }, { ORE: 1 })).toBe(false);
  });

  it('rejects multi-resource give or receive', () => {
    expect(validateBankTradeAmounts(ratios4, { BRICK: 4, LUMBER: 4 }, { ORE: 1 })).toBe(false);
    expect(validateBankTradeAmounts(ratios4, { BRICK: 4 }, { ORE: 1, GRAIN: 1 })).toBe(false);
  });
});
