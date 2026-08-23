import type { GameState, ResourceHand, Board } from '@catan-online/shared';
import {
  canPlaceSettlement,
  canPlaceRoad,
  canUpgradeToCity,
  canAfford,
  ROAD_COST,
  SETTLEMENT_COST,
  CITY_COST,
  DEV_CARD_COST,
  calculateTradeRatios,
  validateBankTradeAmounts,
  totalResources,
} from '@catan-online/shared';
import type { PlayDevCardParams } from './actions.js';
import type { GameAction, ValidationResult } from './actions.js';
import { VALID, invalid } from './actions.js';
import { MIN_PLAYERS, MAX_PLAYERS } from './setup.js';

export function validateAction(state: GameState, action: GameAction): ValidationResult {
  switch (action.type) {
    case 'START_GAME':
      return validateStartGame(state, action.playerId);
    case 'REMATCH':
      return validateRematch(state, action.playerId);
    case 'PLACE_SETUP_SETTLEMENT':
      return validatePlaceSetupSettlement(state, action.playerId, action.vertexId);
    case 'PLACE_SETUP_ROAD':
      return validatePlaceSetupRoad(state, action.playerId, action.edgeId);
    case 'ROLL_DICE':
      return validateRollDice(state, action.playerId);
    case 'SELECT_DISCARD':
      return validateSelectDiscard(state, action.playerId, action.resources);
    case 'MOVE_ROBBER':
      return validateMoveRobber(state, action.playerId, action.hexId);
    case 'STEAL_FROM':
      return validateStealFrom(state, action.playerId, action.targetPlayerId);
    case 'BUILD_ROAD':
      return validateBuildRoad(state, action.playerId, action.edgeId);
    case 'BUILD_SETTLEMENT':
      return validateBuildSettlement(state, action.playerId, action.vertexId);
    case 'BUILD_CITY':
      return validateBuildCity(state, action.playerId, action.vertexId);
    case 'BUY_DEV_CARD':
      return validateBuyDevCard(state, action.playerId);
    case 'PLAY_DEV_CARD':
      return validatePlayDevCard(state, action.playerId, action.devCardId, action.params);
    case 'BANK_TRADE':
      return validateBankTrade(state, action.playerId, action.give, action.receive);
    case 'PROPOSE_TRADE':
      return validateProposeTrade(state, action.playerId, action.give, action.request, action.targetPlayerId);
    case 'RESPOND_TRADE':
      return validateRespondTrade(state, action.playerId, action.tradeId, action.accept);
    case 'CANCEL_TRADE':
      return validateCancelTrade(state, action.playerId, action.tradeId);
    case 'FINALIZE_TRADE':
      return validateFinalizeTrade(state, action.playerId, action.tradeId, action.withPlayerId);
    case 'END_TURN':
      return validateEndTurn(state, action.playerId);
    default:
      return invalid('unknown action');
  }
}

function findPlayer(state: GameState, playerId: string) {
  return state.players.find((p) => p.id === playerId);
}

function validateStartGame(state: GameState, playerId: string): ValidationResult {
  if (state.phase !== 'LOBBY') return invalid('game already started');
  if (state.hostPlayerId !== playerId) return invalid('only the host can start the game');
  if (state.players.length < MIN_PLAYERS || state.players.length > MAX_PLAYERS) {
    return invalid(`need ${MIN_PLAYERS}-${MAX_PLAYERS} players to start`);
  }
  return VALID;
}

function validateRematch(state: GameState, playerId: string): ValidationResult {
  if (state.phase !== 'GAME_OVER') return invalid('game is not over');
  if (state.hostPlayerId !== playerId) return invalid('only the host can start a rematch');
  return VALID;
}

function validatePlaceSetupSettlement(state: GameState, playerId: string, vertexId: string): ValidationResult {
  if (state.phase !== 'SETUP' || !state.setup) return invalid('not in setup phase');
  if (state.setup.order[state.setup.step] !== playerId) return invalid('not your turn');
  if (!state.board.vertices[vertexId]) return invalid('unknown vertex');

  // Re-placing before the road is committed is allowed: undo the just-placed settlement (ignore it
  // for the distance check) so the player can pick a different spot instead of being locked in.
  const previousVertexId = state.setup.awaitingRoadForVertexId;
  if (previousVertexId === vertexId) return invalid('already placed there');
  let board = state.board;
  if (previousVertexId) {
    board = {
      ...board,
      vertices: { ...board.vertices, [previousVertexId]: { ...board.vertices[previousVertexId], building: null } },
    };
  }

  if (!canPlaceSettlement(board, vertexId, playerId, false)) return invalid('illegal settlement position');
  return VALID;
}

function validatePlaceSetupRoad(state: GameState, playerId: string, edgeId: string): ValidationResult {
  if (state.phase !== 'SETUP' || !state.setup) return invalid('not in setup phase');
  if (state.setup.order[state.setup.step] !== playerId) return invalid('not your turn');
  if (state.setup.awaitingRoadForVertexId === null) return invalid('place a settlement first');
  const edge = state.board.edges[edgeId];
  if (!edge) return invalid('unknown edge');
  if (edge.road) return invalid('edge already has a road');
  if (!edge.vertexIds.includes(state.setup.awaitingRoadForVertexId)) {
    return invalid('setup road must connect to the settlement you just placed');
  }
  return VALID;
}

function validateRollDice(state: GameState, playerId: string): ValidationResult {
  if (state.phase !== 'PLAYING' || !state.turn) return invalid('not in playing phase');
  if (state.turn.currentPlayerId !== playerId) return invalid('not your turn');
  if (state.turn.hasRolled) return invalid('dice already rolled this turn');
  if (state.turn.pendingRobber) return invalid('resolve the robber first');
  return VALID;
}

function validateSelectDiscard(state: GameState, playerId: string, resources: Partial<ResourceHand>): ValidationResult {
  if (state.phase !== 'PLAYING' || !state.turn?.pendingRobber) return invalid('no discard is pending');
  const pending = state.turn.pendingRobber;
  if (pending.stage !== 'DISCARD') return invalid('not in the discard stage');
  const remaining = pending.discardsRemaining[playerId] ?? 0;
  if (remaining <= 0) return invalid('you have nothing left to discard');

  const player = findPlayer(state, playerId);
  if (!player) return invalid('unknown player');
  if (totalResources(resources as ResourceHand) !== remaining) {
    return invalid(`you must discard exactly ${remaining} resource(s)`);
  }
  if (!canAfford(player.resources, resources)) return invalid('you do not have those resources');
  return VALID;
}

function validateMoveRobber(state: GameState, playerId: string, hexId: string): ValidationResult {
  if (state.phase !== 'PLAYING' || !state.turn?.pendingRobber) return invalid('no robber move is pending');
  if (state.turn.pendingRobber.stage !== 'MOVE_ROBBER') return invalid('not in the move-robber stage');
  if (state.turn.currentPlayerId !== playerId) return invalid('only the current player moves the robber');
  if (!state.board.tiles[hexId]) return invalid('unknown tile');
  if (hexId === state.board.robberHexId) return invalid('the robber must move to a different tile');
  return VALID;
}

function validateStealFrom(state: GameState, playerId: string, targetPlayerId: string): ValidationResult {
  if (state.phase !== 'PLAYING' || !state.turn?.pendingRobber) return invalid('no steal is pending');
  const pending = state.turn.pendingRobber;
  if (pending.stage !== 'SELECT_TARGET') return invalid('not in the select-target stage');
  if (state.turn.currentPlayerId !== playerId) return invalid('only the current player may steal');
  if (!pending.eligibleStealTargets?.includes(targetPlayerId)) return invalid('that player is not a valid steal target');
  return VALID;
}

function requireActiveBuildPhase(state: GameState, playerId: string): ValidationResult | null {
  if (state.phase !== 'PLAYING' || !state.turn) return invalid('not in playing phase');
  if (state.turn.currentPlayerId !== playerId) return invalid('not your turn');
  if (!state.turn.hasRolled) return invalid('roll the dice first');
  if (state.turn.pendingRobber) return invalid('resolve the robber first');
  return null;
}

function validateBuildRoad(state: GameState, playerId: string, edgeId: string): ValidationResult {
  const phaseErr = requireActiveBuildPhase(state, playerId);
  if (phaseErr) return phaseErr;
  const player = findPlayer(state, playerId);
  if (!player) return invalid('unknown player');
  if (player.buildingStock.roads <= 0) return invalid('no roads left in stock');
  if (!canAfford(player.resources, ROAD_COST)) return invalid('not enough resources for a road');
  if (!state.board.edges[edgeId]) return invalid('unknown edge');
  if (!canPlaceRoad(state.board, edgeId, playerId)) return invalid('illegal road position');
  return VALID;
}

function validateBuildSettlement(state: GameState, playerId: string, vertexId: string): ValidationResult {
  const phaseErr = requireActiveBuildPhase(state, playerId);
  if (phaseErr) return phaseErr;
  const player = findPlayer(state, playerId);
  if (!player) return invalid('unknown player');
  if (player.buildingStock.settlements <= 0) return invalid('no settlements left in stock');
  if (!canAfford(player.resources, SETTLEMENT_COST)) return invalid('not enough resources for a settlement');
  if (!state.board.vertices[vertexId]) return invalid('unknown vertex');
  if (!canPlaceSettlement(state.board, vertexId, playerId, true)) return invalid('illegal settlement position');
  return VALID;
}

function validateBuildCity(state: GameState, playerId: string, vertexId: string): ValidationResult {
  const phaseErr = requireActiveBuildPhase(state, playerId);
  if (phaseErr) return phaseErr;
  const player = findPlayer(state, playerId);
  if (!player) return invalid('unknown player');
  if (player.buildingStock.cities <= 0) return invalid('no cities left in stock');
  if (!canAfford(player.resources, CITY_COST)) return invalid('not enough resources for a city');
  if (!state.board.vertices[vertexId]) return invalid('unknown vertex');
  if (!canUpgradeToCity(state.board, vertexId, playerId)) return invalid('you do not have a settlement there');
  return VALID;
}

function validateBuyDevCard(state: GameState, playerId: string): ValidationResult {
  const phaseErr = requireActiveBuildPhase(state, playerId);
  if (phaseErr) return phaseErr;
  const player = findPlayer(state, playerId);
  if (!player) return invalid('unknown player');
  if (!canAfford(player.resources, DEV_CARD_COST)) return invalid('not enough resources for a development card');
  if (state.bank.devCardDeck.length === 0) return invalid('no development cards left');
  return VALID;
}

/** Validates the "road building" progress card's two free roads by placing the first virtually,
 * then checking the second against that intermediate board (either order may work). */
function canPlaceTwoRoadsForFree(board: Board, playerId: string, edgeIds: [string, string]): boolean {
  const [e1, e2] = edgeIds;
  if (e1 === e2) return false;
  const edge1 = board.edges[e1];
  const edge2 = board.edges[e2];
  if (!edge1 || !edge2 || edge1.road || edge2.road) return false;

  for (const [first, second] of [
    [e1, e2],
    [e2, e1],
  ] as const) {
    if (!canPlaceRoad(board, first, playerId)) continue;
    const boardWithFirst: Board = {
      ...board,
      edges: { ...board.edges, [first]: { ...board.edges[first], road: { playerId } } },
    };
    if (canPlaceRoad(boardWithFirst, second, playerId)) return true;
  }
  return false;
}

function validatePlayDevCard(
  state: GameState,
  playerId: string,
  devCardId: string,
  params: PlayDevCardParams | undefined,
): ValidationResult {
  if (state.phase !== 'PLAYING' || !state.turn) return invalid('not in playing phase');
  if (state.turn.currentPlayerId !== playerId) return invalid('not your turn');
  if (!state.turn.hasRolled) return invalid('roll the dice first');
  if (state.turn.pendingRobber) return invalid('resolve the robber first');
  if (state.turn.devCardPlayedThisTurn) return invalid('only one development card may be played per turn');

  const player = findPlayer(state, playerId);
  if (!player) return invalid('unknown player');
  const card = player.devCards.find((c) => c.id === devCardId);
  if (!card) return invalid('you do not have that development card');
  if (card.used) return invalid('that card has already been used');
  if (card.type === 'VICTORY_POINT') return invalid('victory point cards cannot be played');
  if (card.boughtOnTurn === state.turn.turnNumber) return invalid('cannot play a card bought this turn');

  switch (card.type) {
    case 'KNIGHT':
      return VALID;
    case 'ROAD_BUILDING': {
      if (player.buildingStock.roads < 2) return invalid('not enough roads left in stock');
      const edgeIds = params?.edgeIds;
      if (!edgeIds) return invalid('road building requires two edges');
      if (!canPlaceTwoRoadsForFree(state.board, playerId, edgeIds)) return invalid('illegal road positions');
      return VALID;
    }
    case 'YEAR_OF_PLENTY': {
      const resources = params?.resources;
      if (!resources || totalResources(resources as ResourceHand) !== 2) {
        return invalid('year of plenty requires exactly 2 resources');
      }
      for (const key of Object.keys(resources) as (keyof ResourceHand)[]) {
        const amount = resources[key] ?? 0;
        if (amount > state.bank.resources[key]) return invalid('the bank does not have enough of that resource');
      }
      return VALID;
    }
    case 'MONOPOLY': {
      if (!params?.resource) return invalid('monopoly requires a resource to claim');
      return VALID;
    }
    default:
      return invalid('unknown development card type');
  }
}

function validateEndTurn(state: GameState, playerId: string): ValidationResult {
  if (state.phase !== 'PLAYING' || !state.turn) return invalid('not in playing phase');
  if (state.turn.currentPlayerId !== playerId) return invalid('not your turn');
  if (!state.turn.hasRolled) return invalid('roll the dice first');
  if (state.turn.pendingRobber) return invalid('resolve the robber first');
  return VALID;
}

function validateBankTrade(
  state: GameState,
  playerId: string,
  give: Partial<ResourceHand>,
  receive: Partial<ResourceHand>,
): ValidationResult {
  const phaseErr = requireActiveBuildPhase(state, playerId);
  if (phaseErr) return phaseErr;
  const player = findPlayer(state, playerId);
  if (!player) return invalid('unknown player');
  if (!canAfford(player.resources, give)) return invalid('you do not have the offered resources');

  const ratios = calculateTradeRatios(state.board, playerId);
  if (!validateBankTradeAmounts(ratios, give, receive)) return invalid('invalid trade ratio');
  return VALID;
}

function validateProposeTrade(
  state: GameState,
  playerId: string,
  give: Partial<ResourceHand>,
  request: Partial<ResourceHand>,
  targetPlayerId: string | null,
): ValidationResult {
  const phaseErr = requireActiveBuildPhase(state, playerId);
  if (phaseErr) return phaseErr;
  const player = findPlayer(state, playerId);
  if (!player) return invalid('unknown player');

  const giveHasResources = Object.values(give).some((v) => (v ?? 0) > 0);
  const requestHasResources = Object.values(request).some((v) => (v ?? 0) > 0);
  if (!giveHasResources || !requestHasResources) return invalid('trade must include resources on both sides');
  if (!canAfford(player.resources, give)) return invalid('you do not have the offered resources');

  if (targetPlayerId !== null && !findPlayer(state, targetPlayerId)) return invalid('unknown target player');
  if (targetPlayerId === playerId) return invalid('cannot trade with yourself');
  return VALID;
}

function findTrade(state: GameState, tradeId: string) {
  return state.turn?.pendingTrades.find((t) => t.id === tradeId && t.status === 'PENDING');
}

function validateRespondTrade(state: GameState, playerId: string, tradeId: string, accept: boolean): ValidationResult {
  if (state.phase !== 'PLAYING' || !state.turn) return invalid('not in playing phase');
  const trade = findTrade(state, tradeId);
  if (!trade) return invalid('trade not found or no longer pending');
  if (trade.proposerId === playerId) return invalid('cannot respond to your own trade');
  if (trade.targetId !== null && trade.targetId !== playerId) return invalid('this trade is not addressed to you');

  if (accept) {
    const responder = findPlayer(state, playerId);
    if (!responder) return invalid('unknown player');
    if (!canAfford(responder.resources, trade.request)) return invalid('you do not have the requested resources');
  }
  return VALID;
}

function validateCancelTrade(state: GameState, playerId: string, tradeId: string): ValidationResult {
  if (state.phase !== 'PLAYING' || !state.turn) return invalid('not in playing phase');
  const trade = findTrade(state, tradeId);
  if (!trade) return invalid('trade not found or no longer pending');
  if (trade.proposerId !== playerId) return invalid('only the proposer can cancel this trade');
  return VALID;
}

function validateFinalizeTrade(state: GameState, playerId: string, tradeId: string, withPlayerId: string): ValidationResult {
  if (state.phase !== 'PLAYING' || !state.turn) return invalid('not in playing phase');
  const trade = findTrade(state, tradeId);
  if (!trade) return invalid('trade not found or no longer pending');
  if (trade.proposerId !== playerId) return invalid('only the proposer can finalize this trade');
  if (!trade.acceptedBy.includes(withPlayerId)) return invalid('that player has not accepted this trade');

  const proposer = findPlayer(state, playerId);
  const responder = findPlayer(state, withPlayerId);
  if (!proposer || !responder) return invalid('unknown player');
  // Re-check affordability: resources may have moved since either side accepted.
  if (!canAfford(proposer.resources, trade.give)) return invalid('you no longer have the offered resources');
  if (!canAfford(responder.resources, trade.request)) return invalid('the other player no longer has the requested resources');
  return VALID;
}
