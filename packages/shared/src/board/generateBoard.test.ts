import { describe, it, expect } from 'vitest';
import { generateBoard } from './generateBoard.js';
import { HEX_DIRECTIONS, hexAdd, hexKey } from './topology.js';
import type { TerrainType, PortType } from '../types/board.js';

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

describe('generateBoard', () => {
  it('produces the correct terrain distribution', () => {
    const board = generateBoard({ rng: mulberry32(42) });
    const counts: Record<TerrainType, number> = { HILLS: 0, PASTURE: 0, MOUNTAINS: 0, FOREST: 0, FIELDS: 0, DESERT: 0 };
    for (const tile of Object.values(board.tiles)) counts[tile.terrain]++;
    expect(counts).toEqual({ HILLS: 3, PASTURE: 4, MOUNTAINS: 3, FOREST: 4, FIELDS: 4, DESERT: 1 });
  });

  it('assigns exactly the 18 standard number tokens to non-desert tiles', () => {
    const board = generateBoard({ rng: mulberry32(7) });
    const numbers = Object.values(board.tiles)
      .map((t) => t.numberToken)
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);
    expect(numbers).toEqual([2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
  });

  it('places the robber on the desert tile', () => {
    const board = generateBoard({ rng: mulberry32(99) });
    const robberTile = board.tiles[board.robberHexId];
    expect(robberTile.terrain).toBe('DESERT');
    expect(robberTile.numberToken).toBeNull();
  });

  it('never places two 6/8 tiles adjacent to each other, across many seeds', () => {
    for (let seed = 0; seed < 25; seed++) {
      const board = generateBoard({ rng: mulberry32(seed * 1000 + 1) });
      for (const tile of Object.values(board.tiles)) {
        if (tile.numberToken !== 6 && tile.numberToken !== 8) continue;
        for (const d of HEX_DIRECTIONS) {
          const neighborId = hexKey(hexAdd(tile.coord, d));
          const neighbor = board.tiles[neighborId];
          if (!neighbor) continue;
          expect([6, 8]).not.toContain(neighbor.numberToken);
        }
      }
    }
  });

  it('generates 9 ports with the standard type distribution', () => {
    const board = generateBoard({ rng: mulberry32(5) });
    expect(board.ports).toHaveLength(9);
    const counts: Record<string, number> = {};
    for (const port of board.ports) counts[port.type] = (counts[port.type] ?? 0) + 1;
    const expected: Record<PortType, number> = { GENERIC: 4, BRICK: 1, LUMBER: 1, WOOL: 1, GRAIN: 1, ORE: 1 };
    expect(counts).toEqual(expected);
  });

  it('links each port to two vertices that reference it back', () => {
    const board = generateBoard({ rng: mulberry32(11) });
    for (const port of board.ports) {
      for (const vId of port.vertexIds) {
        expect(board.vertices[vId]?.portId).toBe(port.id);
      }
    }
  });
});
