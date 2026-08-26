export interface HexCoord {
  readonly q: number;
  readonly r: number;
}

export type HexId = string;
export type VertexId = string;
export type EdgeId = string;

export type TerrainType = 'HILLS' | 'PASTURE' | 'MOUNTAINS' | 'FOREST' | 'FIELDS' | 'DESERT' | 'SEA' | 'GOLD';

export type ResourceType = 'BRICK' | 'LUMBER' | 'WOOL' | 'GRAIN' | 'ORE';

/** For validating a resource identifier that arrived over the wire (e.g. Monopoly's target
 * resource) rather than being narrowed by the type system already. */
export const RESOURCE_TYPES: ResourceType[] = ['BRICK', 'LUMBER', 'WOOL', 'GRAIN', 'ORE'];

export const TERRAIN_RESOURCE: Record<TerrainType, ResourceType | null> = {
  HILLS: 'BRICK',
  PASTURE: 'WOOL',
  MOUNTAINS: 'ORE',
  FOREST: 'LUMBER',
  FIELDS: 'GRAIN',
  DESERT: null,
  SEA: null,
  // GOLD has no fixed resource -- production grants the owning player a free pick instead,
  // handled separately by calculateGoldPicksOwed() rather than through this map.
  GOLD: null,
};

export const RESOURCE_LABELS_JA: Record<ResourceType, string> = {
  BRICK: 'レンガ',
  LUMBER: '木材',
  WOOL: '羊毛',
  GRAIN: '麦',
  ORE: '鉱石',
};

export type PortType = 'GENERIC' | ResourceType;

export type BoardMode = 'RANDOM' | 'BALANCED';

export const BOARD_MODE_LABELS_JA: Record<BoardMode, string> = {
  RANDOM: '完全ランダム',
  BALANCED: 'バランス',
};

export interface Tile {
  id: HexId;
  coord: HexCoord;
  terrain: TerrainType;
  numberToken: number | null;
}

export interface BuildingRef {
  playerId: string;
  type: 'SETTLEMENT' | 'CITY';
}

export interface Vertex {
  id: VertexId;
  hexIds: HexId[];
  edgeIds: EdgeId[];
  adjacentVertexIds: VertexId[];
  building: BuildingRef | null;
  portId: string | null;
}

export interface RoadRef {
  playerId: string;
}

export interface Edge {
  id: EdgeId;
  hexIds: HexId[];
  vertexIds: [VertexId, VertexId];
  road: RoadRef | null;
  /** A ship (Seafarers). Mutually exclusive with `road` -- an edge holds one or the other, never
   * both -- but kept as a separate field rather than folding into `road` so callers that only
   * care about land roads don't need to filter by piece type. */
  ship: RoadRef | null;
}

export interface Port {
  id: string;
  type: PortType;
  vertexIds: [VertexId, VertexId];
}

export interface Board {
  tiles: Record<HexId, Tile>;
  vertices: Record<VertexId, Vertex>;
  edges: Record<EdgeId, Edge>;
  ports: Port[];
  robberHexId: HexId;
  /** The pirate ship (Seafarers). Null on standard boards, which have no sea tiles for it to sit on. */
  pirateHexId: HexId | null;
}
