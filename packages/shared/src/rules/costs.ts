import type { ResourceHand } from '../types/game.js';

export const ROAD_COST: Partial<ResourceHand> = { BRICK: 1, LUMBER: 1 };
export const SETTLEMENT_COST: Partial<ResourceHand> = { BRICK: 1, LUMBER: 1, WOOL: 1, GRAIN: 1 };
export const CITY_COST: Partial<ResourceHand> = { GRAIN: 2, ORE: 3 };
export const DEV_CARD_COST: Partial<ResourceHand> = { WOOL: 1, GRAIN: 1, ORE: 1 };
/** Seafarers ship: same "one edge" price tag as a road, just wool instead of brick. */
export const SHIP_COST: Partial<ResourceHand> = { LUMBER: 1, WOOL: 1 };

export const INITIAL_BUILDING_STOCK = { settlements: 5, cities: 4, roads: 15, ships: 15 };

export const BANK_STARTING_RESOURCE_COUNT = 19;

export const DEV_CARD_DECK_COMPOSITION: { type: 'KNIGHT' | 'ROAD_BUILDING' | 'YEAR_OF_PLENTY' | 'MONOPOLY' | 'VICTORY_POINT'; count: number }[] = [
  { type: 'KNIGHT', count: 14 },
  { type: 'ROAD_BUILDING', count: 2 },
  { type: 'YEAR_OF_PLENTY', count: 2 },
  { type: 'MONOPOLY', count: 2 },
  { type: 'VICTORY_POINT', count: 5 },
];

export function canAfford(hand: ResourceHand, cost: Partial<ResourceHand>): boolean {
  return (Object.keys(cost) as (keyof ResourceHand)[]).every((res) => hand[res] >= (cost[res] ?? 0));
}
