export interface HexCoord {
  readonly q: number;
  readonly r: number;
}

export type HexId = string;
export type VertexId = string;
export type EdgeId = string;

export type TerrainType = 'HILLS' | 'PASTURE' | 'MOUNTAINS' | 'FOREST' | 'FIELDS' | 'DESERT';

export type ResourceType = 'BRICK' | 'LUMBER' | 'WOOL' | 'GRAIN' | 'ORE';

export const TERRAIN_RESOURCE: Record<TerrainType, ResourceType | null> = {
  HILLS: 'BRICK',
  PASTURE: 'WOOL',
  MOUNTAINS: 'ORE',
  FOREST: 'LUMBER',
  FIELDS: 'GRAIN',
  DESERT: null,
};

export const RESOURCE_LABELS_JA: Record<ResourceType, string> = {
  BRICK: 'レンガ',
  LUMBER: '木材',
  WOOL: '羊毛',
  GRAIN: '麦',
  ORE: '鉱石',
};

export type PortType = 'GENERIC' | ResourceType;

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
}
