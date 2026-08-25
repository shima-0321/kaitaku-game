import { describe, it, expect } from 'vitest';
import { generateStandardHexCoords, generateExtendedHexCoords, buildTopology, hexKey, hexAdd, HEX_DIRECTIONS } from './topology.js';

describe('topology', () => {
  it('generates 19 hex tiles for the standard board', () => {
    const coords = generateStandardHexCoords();
    expect(coords).toHaveLength(19);
  });

  it('produces exactly 54 vertices and 72 edges for the standard board', () => {
    const coords = generateStandardHexCoords();
    const { vertices, edges } = buildTopology(coords);
    expect(vertices.size).toBe(54);
    expect(edges.size).toBe(72);
  });

  it('every vertex touches 2 or 3 real hexes, and 2 or 3 adjacent vertices', () => {
    const coords = generateStandardHexCoords();
    const { vertices } = buildTopology(coords);
    for (const v of vertices.values()) {
      expect(v.hexIds.length).toBeGreaterThanOrEqual(1);
      expect(v.hexIds.length).toBeLessThanOrEqual(3);
      expect(v.adjacentVertexIds.length).toBeGreaterThanOrEqual(2);
      expect(v.adjacentVertexIds.length).toBeLessThanOrEqual(3);
      expect(v.edgeIds.length).toBe(v.adjacentVertexIds.length);
    }
  });

  it('every edge touches 1 or 2 real hexes and exactly 2 vertices', () => {
    const coords = generateStandardHexCoords();
    const { edges } = buildTopology(coords);
    for (const e of edges.values()) {
      expect(e.hexIds.length).toBeGreaterThanOrEqual(1);
      expect(e.hexIds.length).toBeLessThanOrEqual(2);
      expect(e.vertexIds).toHaveLength(2);
    }
  });

  it('vertex adjacency is symmetric', () => {
    const coords = generateStandardHexCoords();
    const { vertices } = buildTopology(coords);
    for (const v of vertices.values()) {
      for (const adjId of v.adjacentVertexIds) {
        const adj = vertices.get(adjId);
        expect(adj).toBeDefined();
        expect(adj!.adjacentVertexIds).toContain(v.id);
      }
    }
  });

  describe('generateExtendedHexCoords (5-6 player island)', () => {
    it('generates 30 hex tiles', () => {
      expect(generateExtendedHexCoords()).toHaveLength(30);
    });

    it('lays out in the official 3-4-5-6-5-4-3 row pattern', () => {
      const coords = generateExtendedHexCoords();
      const rowSizes = new Map<number, number>();
      for (const { q } of coords) rowSizes.set(q, (rowSizes.get(q) ?? 0) + 1);
      const sizesByRow = [...rowSizes.entries()].sort(([a], [b]) => a - b).map(([, size]) => size);
      expect(sizesByRow).toEqual([3, 4, 5, 6, 5, 4, 3]);
    });

    it('forms a single connected blob (every tile reachable from any other)', () => {
      const coords = generateExtendedHexCoords();
      const realSet = new Set(coords.map(hexKey));
      const visited = new Set<string>();
      const stack = [coords[0]];
      while (stack.length > 0) {
        const hex = stack.pop()!;
        const id = hexKey(hex);
        if (visited.has(id)) continue;
        visited.add(id);
        for (const d of HEX_DIRECTIONS) {
          const n = hexAdd(hex, d);
          if (realSet.has(hexKey(n)) && !visited.has(hexKey(n))) stack.push(n);
        }
      }
      expect(visited.size).toBe(coords.length);
    });

    it('every vertex/edge structural invariant still holds on the bigger board', () => {
      const coords = generateExtendedHexCoords();
      const { vertices, edges } = buildTopology(coords);
      for (const v of vertices.values()) {
        expect(v.hexIds.length).toBeGreaterThanOrEqual(1);
        expect(v.hexIds.length).toBeLessThanOrEqual(3);
        expect(v.edgeIds.length).toBe(v.adjacentVertexIds.length);
      }
      for (const e of edges.values()) {
        expect(e.hexIds.length).toBeGreaterThanOrEqual(1);
        expect(e.hexIds.length).toBeLessThanOrEqual(2);
        expect(e.vertexIds).toHaveLength(2);
      }
    });
  });
});
