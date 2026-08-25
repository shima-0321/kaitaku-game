import { describe, it, expect } from 'vitest';
import { generateBoard } from './generateBoard.js';
import { HEX_DIRECTIONS, hexAdd, hexKey, generateStandardHexCoords } from './topology.js';
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

  function sameTerrainAdjacency(board: ReturnType<typeof generateBoard>): number {
    let count = 0;
    for (const tile of Object.values(board.tiles)) {
      if (tile.terrain === 'DESERT') continue;
      for (const d of HEX_DIRECTIONS) {
        const neighborId = hexKey(hexAdd(tile.coord, d));
        const neighbor = board.tiles[neighborId];
        if (!neighbor || neighborId <= tile.id) continue;
        if (neighbor.terrain === tile.terrain) count++;
      }
    }
    return count;
  }

  describe('BALANCED mode', () => {
    it('still produces the correct terrain distribution and respects the 6/8 rule', () => {
      const board = generateBoard({ rng: mulberry32(123), mode: 'BALANCED' });
      const counts: Record<TerrainType, number> = { HILLS: 0, PASTURE: 0, MOUNTAINS: 0, FOREST: 0, FIELDS: 0, DESERT: 0 };
      for (const tile of Object.values(board.tiles)) counts[tile.terrain]++;
      expect(counts).toEqual({ HILLS: 3, PASTURE: 4, MOUNTAINS: 3, FOREST: 4, FIELDS: 4, DESERT: 1 });

      for (const tile of Object.values(board.tiles)) {
        if (tile.numberToken !== 6 && tile.numberToken !== 8) continue;
        for (const d of HEX_DIRECTIONS) {
          const neighbor = board.tiles[hexKey(hexAdd(tile.coord, d))];
          if (neighbor) expect([6, 8]).not.toContain(neighbor.numberToken);
        }
      }
    });

    it('clusters same-terrain tiles noticeably less than RANDOM mode, on average', () => {
      const trials = 20;
      let randomTotal = 0;
      let balancedTotal = 0;
      for (let seed = 0; seed < trials; seed++) {
        randomTotal += sameTerrainAdjacency(generateBoard({ rng: mulberry32(seed * 777 + 3) }));
        balancedTotal += sameTerrainAdjacency(generateBoard({ rng: mulberry32(seed * 777 + 3), mode: 'BALANCED' }));
      }
      expect(balancedTotal).toBeLessThan(randomTotal);
    });
  });

  describe('5-6 player extension board (playerCount >= 5)', () => {
    it('produces the extended terrain distribution across 30 tiles', () => {
      const board = generateBoard({ rng: mulberry32(42), playerCount: 6 });
      expect(Object.keys(board.tiles)).toHaveLength(30);
      const counts: Record<TerrainType, number> = { HILLS: 0, PASTURE: 0, MOUNTAINS: 0, FOREST: 0, FIELDS: 0, DESERT: 0 };
      for (const tile of Object.values(board.tiles)) counts[tile.terrain]++;
      expect(counts).toEqual({ HILLS: 5, PASTURE: 6, MOUNTAINS: 5, FOREST: 6, FIELDS: 6, DESERT: 2 });
    });

    it('assigns 28 number tokens (one extra set of 2-12 minus 7) to non-desert tiles', () => {
      const board = generateBoard({ rng: mulberry32(7), playerCount: 5 });
      const numbers = Object.values(board.tiles)
        .map((t) => t.numberToken)
        .filter((n): n is number => n !== null)
        .sort((a, b) => a - b);
      expect(numbers).toEqual([
        2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12,
      ]);
    });

    it('generates 11 ports', () => {
      const board = generateBoard({ rng: mulberry32(5), playerCount: 6 });
      expect(board.ports).toHaveLength(11);
    });

    it('still respects the 6/8 adjacency rule at the bigger size', () => {
      for (let seed = 0; seed < 15; seed++) {
        const board = generateBoard({ rng: mulberry32(seed * 1000 + 1), playerCount: 6 });
        for (const tile of Object.values(board.tiles)) {
          if (tile.numberToken !== 6 && tile.numberToken !== 8) continue;
          for (const d of HEX_DIRECTIONS) {
            const neighbor = board.tiles[hexKey(hexAdd(tile.coord, d))];
            if (neighbor) expect([6, 8]).not.toContain(neighbor.numberToken);
          }
        }
      }
    });

    it('falls back to the standard 19-tile board for 4 or fewer players', () => {
      const board = generateBoard({ rng: mulberry32(1), playerCount: 4 });
      expect(Object.keys(board.tiles)).toHaveLength(19);
      expect(board.ports).toHaveLength(9);
    });
  });

  describe('seafarers board (seafarers: true)', () => {
    const mainIslandHexIds = new Set(generateStandardHexCoords(2).map(hexKey));

    it('produces 61 tiles: 19-tile main island + 6-tile satellites + 36 sea tiles', () => {
      const board = generateBoard({ rng: mulberry32(42), seafarers: true });
      const byTerrain: Record<TerrainType, number> = { HILLS: 0, PASTURE: 0, MOUNTAINS: 0, FOREST: 0, FIELDS: 0, DESERT: 0, SEA: 0, GOLD: 0 };
      for (const tile of Object.values(board.tiles)) byTerrain[tile.terrain]++;
      expect(Object.keys(board.tiles)).toHaveLength(61);
      expect(byTerrain).toEqual({ HILLS: 4, PASTURE: 5, MOUNTAINS: 4, FOREST: 5, FIELDS: 5, DESERT: 1, GOLD: 1, SEA: 36 });
    });

    it('keeps the standard 19-tile terrain distribution confined to the main island', () => {
      const board = generateBoard({ rng: mulberry32(7), seafarers: true });
      const byTerrain: Record<TerrainType, number> = { HILLS: 0, PASTURE: 0, MOUNTAINS: 0, FOREST: 0, FIELDS: 0, DESERT: 0, SEA: 0, GOLD: 0 };
      for (const hexId of mainIslandHexIds) byTerrain[board.tiles[hexId].terrain]++;
      expect(byTerrain).toEqual({ HILLS: 3, PASTURE: 4, MOUNTAINS: 3, FOREST: 4, FIELDS: 4, DESERT: 1, GOLD: 0, SEA: 0 });
    });

    it('never assigns a number token to a sea tile, and always assigns one to every land/gold tile', () => {
      for (let seed = 0; seed < 15; seed++) {
        const board = generateBoard({ rng: mulberry32(seed * 500 + 99), seafarers: true });
        for (const tile of Object.values(board.tiles)) {
          if (tile.terrain === 'SEA') expect(tile.numberToken).toBeNull();
          else if (tile.terrain !== 'DESERT') expect(tile.numberToken).not.toBeNull();
        }
      }
    });

    it('respects the 6/8 adjacency rule across seeds', () => {
      for (let seed = 0; seed < 15; seed++) {
        const board = generateBoard({ rng: mulberry32(seed * 1000 + 1), seafarers: true });
        for (const tile of Object.values(board.tiles)) {
          if (tile.numberToken !== 6 && tile.numberToken !== 8) continue;
          for (const d of HEX_DIRECTIONS) {
            const neighbor = board.tiles[hexKey(hexAdd(tile.coord, d))];
            if (neighbor) expect([6, 8]).not.toContain(neighbor.numberToken);
          }
        }
      }
    });

    it('places the robber on the main island desert tile', () => {
      const board = generateBoard({ rng: mulberry32(11), seafarers: true });
      expect(mainIslandHexIds.has(board.robberHexId)).toBe(true);
      expect(board.tiles[board.robberHexId].terrain).toBe('DESERT');
    });

    it('starts the pirate on a sea tile', () => {
      const board = generateBoard({ rng: mulberry32(13), seafarers: true });
      expect(board.pirateHexId).not.toBeNull();
      expect(board.tiles[board.pirateHexId!].terrain).toBe('SEA');
    });

    it('gives every edge an empty ship slot', () => {
      const board = generateBoard({ rng: mulberry32(17), seafarers: true });
      for (const edge of Object.values(board.edges)) expect(edge.ship).toBeNull();
    });

    it('generates the standard 9 ports, all on the main island coastline', () => {
      const board = generateBoard({ rng: mulberry32(23), seafarers: true });
      expect(board.ports).toHaveLength(9);
      for (const port of board.ports) {
        for (const vId of port.vertexIds) {
          const vertex = board.vertices[vId];
          expect(vertex.hexIds.some((hexId) => mainIslandHexIds.has(hexId))).toBe(true);
        }
      }
    });
  });
});
