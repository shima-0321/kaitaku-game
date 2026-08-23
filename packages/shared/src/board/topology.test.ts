import { describe, it, expect } from 'vitest';
import { generateStandardHexCoords, buildTopology } from './topology.js';

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
});
