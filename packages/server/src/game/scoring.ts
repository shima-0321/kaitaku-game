import type { GameState, Player, ScoreBreakdown } from '@catan-online/shared';

export function countSettlements(state: GameState, playerId: string): number {
  return Object.values(state.board.vertices).filter(
    (v) => v.building?.playerId === playerId && v.building.type === 'SETTLEMENT',
  ).length;
}

export function countCities(state: GameState, playerId: string): number {
  return Object.values(state.board.vertices).filter(
    (v) => v.building?.playerId === playerId && v.building.type === 'CITY',
  ).length;
}

export function countVictoryPointCards(player: Player): number {
  return player.devCards.filter((c) => c.type === 'VICTORY_POINT').length;
}

/** Points visible to opponents: settlements/cities/longest-road/largest-army only. */
export function calculateVisibleVictoryPoints(state: GameState, playerId: string): number {
  let points = countSettlements(state, playerId) + countCities(state, playerId) * 2;
  if (state.longestRoadPlayerId === playerId) points += 2;
  if (state.largestArmyPlayerId === playerId) points += 2;
  return points;
}

/** Total victory points including hidden VP dev cards (used for the actual win-condition check). */
export function calculateTotalVictoryPoints(state: GameState, playerId: string): number {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return 0;
  return calculateVisibleVictoryPoints(state, playerId) + countVictoryPointCards(player);
}

/** Itemized point sources, revealed to everyone once the game has ended -- there's no more
 * strategic reason to keep an opponent's hidden VP dev cards secret at that point. */
export function calculateScoreBreakdown(state: GameState, playerId: string): ScoreBreakdown {
  const player = state.players.find((p) => p.id === playerId);
  const settlements = countSettlements(state, playerId);
  const cities = countCities(state, playerId);
  const hasLongestRoad = state.longestRoadPlayerId === playerId;
  const hasLargestArmy = state.largestArmyPlayerId === playerId;
  const victoryPointCards = player ? countVictoryPointCards(player) : 0;
  return {
    settlements,
    cities,
    hasLongestRoad,
    hasLargestArmy,
    victoryPointCards,
    total: settlements + cities * 2 + (hasLongestRoad ? 2 : 0) + (hasLargestArmy ? 2 : 0) + victoryPointCards,
  };
}
