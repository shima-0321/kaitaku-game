import type { GameState, ClientGameState, PublicPlayerView, PrivatePlayerView } from '@catan-online/shared';
import { totalResources } from '@catan-online/shared';
import { calculateVisibleVictoryPoints, calculateTotalVictoryPoints } from '../game/scoring.js';

function toPublicView(state: GameState, playerId: string): PublicPlayerView {
  const player = state.players.find((p) => p.id === playerId)!;
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    connected: player.connected,
    resourceCount: totalResources(player.resources),
    devCardCount: player.devCards.filter((c) => !c.used).length,
    revealedDevCards: player.devCards.filter((c) => c.used).map((c) => c.type),
    visibleVictoryPoints: calculateVisibleVictoryPoints(state, playerId),
    buildingStock: player.buildingStock,
    knightsPlayed: player.knightsPlayed,
    hasLongestRoad: state.longestRoadPlayerId === playerId,
    hasLargestArmy: state.largestArmyPlayerId === playerId,
    stats: player.stats,
    isBot: player.isBot,
  };
}

/**
 * Builds the view sent to a single player: opponents are reduced to public counts only
 * (never their actual resource/dev-card contents), while `me` carries full private detail.
 * Must be computed per-socket -- never broadcast the same payload to the whole room.
 */
export function redactStateFor(state: GameState, viewerPlayerId: string): ClientGameState {
  const me = state.players.find((p) => p.id === viewerPlayerId);
  if (!me) throw new Error(`player ${viewerPlayerId} not found in room ${state.roomId}`);

  const myPrivateView: PrivatePlayerView = {
    ...toPublicView(state, viewerPlayerId),
    resources: me.resources,
    devCards: me.devCards,
    totalVictoryPoints: calculateTotalVictoryPoints(state, viewerPlayerId),
  };

  return {
    roomId: state.roomId,
    roomCode: state.roomCode,
    hostPlayerId: state.hostPlayerId,
    phase: state.phase,
    friendlyRobberEnabled: state.friendlyRobberEnabled,
    seafarersEnabled: state.seafarersEnabled,
    board: state.board,
    bank: {
      resourceCounts: state.bank.resources,
      devCardCount: state.bank.devCardDeck.length,
    },
    players: state.players.filter((p) => p.id !== viewerPlayerId).map((p) => toPublicView(state, p.id)),
    me: myPrivateView,
    setup: state.setup,
    turn: state.turn,
    longestRoadPlayerId: state.longestRoadPlayerId,
    largestArmyPlayerId: state.largestArmyPlayerId,
    winnerId: state.winnerId,
    log: state.log,
    updatedAt: state.updatedAt,
  };
}
