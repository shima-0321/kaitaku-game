import type { GameState, Board, VertexId, EdgeId, ResourceHand, HexId } from '@catan-online/shared';
import {
  canPlaceSettlement,
  canPlaceRoad,
  canPlaceShip,
  canUpgradeToCity,
  canAfford,
  ROAD_COST,
  SETTLEMENT_COST,
  CITY_COST,
  SHIP_COST,
} from '@catan-online/shared';
import { dispatch } from './dispatch.js';
import { isProtectedByFriendlyRobber } from './scoring.js';
import { rollTwoDice, pickRandomResourceFromHand } from '../utils/rng.js';
import { emitRobbedDetail } from '../socket/broadcast.js';
import type { Room } from '../rooms/Room.js';
import type { AppServer } from '../socket/context.js';

const BOT_ACTION_DELAY_MS = 800;

const PIP_COUNT: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

function pipScore(board: Board, vertexId: VertexId): number {
  const vertex = board.vertices[vertexId];
  return vertex.hexIds.reduce((sum, hexId) => {
    const token = board.tiles[hexId]?.numberToken;
    return sum + (token ? (PIP_COUNT[token] ?? 0) : 0);
  }, 0);
}

function pickRandom<T>(arr: T[]): T | null {
  if (arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Best settlement spot by summed pip count of adjacent tiles (prefers 6/8, avoids the desert). */
function chooseSettlementVertex(board: Board, botId: string, requireRoadConnection: boolean): VertexId | null {
  const candidates = Object.values(board.vertices).filter((v) => canPlaceSettlement(board, v.id, botId, requireRoadConnection));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => pipScore(board, b.id) - pipScore(board, a.id));
  return candidates[0].id;
}

function chooseSetupRoadEdge(board: Board, vertexId: VertexId): EdgeId | null {
  const vertex = board.vertices[vertexId];
  return pickRandom(vertex.edgeIds.filter((eId) => !board.edges[eId]?.road));
}

function chooseAnyRoadEdge(board: Board, botId: string): EdgeId | null {
  const candidates = Object.values(board.edges).filter((e) => canPlaceRoad(board, e.id, botId));
  return pickRandom(candidates.map((e) => e.id));
}

function chooseAnyShipEdge(board: Board, botId: string): EdgeId | null {
  const candidates = Object.values(board.edges).filter((e) => canPlaceShip(board, e.id, botId));
  return pickRandom(candidates.map((e) => e.id));
}

function chooseCityVertex(board: Board, botId: string): VertexId | null {
  const candidates = Object.values(board.vertices).filter((v) => canUpgradeToCity(board, v.id, botId));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => pipScore(board, b.id) - pipScore(board, a.id));
  return candidates[0].id;
}

function chooseDiscard(resources: ResourceHand, count: number): Partial<ResourceHand> {
  const pool: (keyof ResourceHand)[] = [];
  for (const [res, n] of Object.entries(resources) as [keyof ResourceHand, number][]) {
    for (let i = 0; i < n; i++) pool.push(res);
  }
  const discard: Partial<ResourceHand> = {};
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    const res = pool.splice(idx, 1)[0];
    discard[res] = (discard[res] ?? 0) + 1;
  }
  return discard;
}

/** Prefers a tile with an opponent's building on it; falls back to any other tile. Respects the
 * friendly robber house rule the same way the server would validate it, so a bot never wastes
 * retries proposing a move that's just going to be rejected. */
function chooseRobberHex(state: GameState, botId: string): HexId {
  const board = state.board;
  const tiles = Object.values(board.tiles).filter((t) => t.id !== board.robberHexId && t.terrain !== 'SEA');
  const allowed = state.friendlyRobberEnabled ? tiles.filter((t) => !isProtectedByFriendlyRobber(state, t.id)) : tiles;
  const usable = allowed.length > 0 ? allowed : tiles; // escape hatch: every tile is protected
  const withOpponentBuilding = usable.filter((t) =>
    Object.values(board.vertices).some((v) => v.hexIds.includes(t.id) && v.building && v.building.playerId !== botId),
  );
  const pool = withOpponentBuilding.length > 0 ? withOpponentBuilding : usable;
  return pickRandom(pool)!.id;
}

/** Picks whichever resources the bot currently holds least of, skipping any the bank has run out of. */
function chooseGoldPick(state: GameState, botId: string, count: number): Partial<ResourceHand> {
  const bot = state.players.find((p) => p.id === botId)!;
  const resourceTypes: (keyof ResourceHand)[] = ['BRICK', 'LUMBER', 'WOOL', 'GRAIN', 'ORE'];
  const picks: Partial<ResourceHand> = {};
  for (let i = 0; i < count; i++) {
    const affordable = resourceTypes.filter((r) => (picks[r] ?? 0) < state.bank.resources[r]);
    if (affordable.length === 0) break;
    affordable.sort((a, b) => bot.resources[a] + (picks[a] ?? 0) - (bot.resources[b] + (picks[b] ?? 0)));
    const choice = affordable[0];
    picks[choice] = (picks[choice] ?? 0) + 1;
  }
  return picks;
}

const noop = () => {};

/** Building priority: city upgrades are the most point-efficient use of resources, then new
 * settlements to expand production, then roads. Only one action per call -- the caller loops.
 * Shared by a bot's regular turn and its special-build slot, which follow the same priority. */
function attemptBotBuild(io: AppServer, room: Room, state: GameState, botId: string): boolean {
  const bot = state.players.find((p) => p.id === botId)!;

  if (canAfford(bot.resources, CITY_COST)) {
    const vertexId = chooseCityVertex(state.board, botId);
    if (vertexId) {
      const succeeded = dispatch(io, room, { type: 'BUILD_CITY', playerId: botId, vertexId }, noop);
      if (succeeded) io.to(room.state.roomId).emit('game_sound', { kind: 'LEVEL_UP', playerId: botId });
      return true;
    }
  }
  if (canAfford(bot.resources, SETTLEMENT_COST) && bot.buildingStock.settlements > 0) {
    const vertexId = chooseSettlementVertex(state.board, botId, true);
    if (vertexId) {
      const succeeded = dispatch(io, room, { type: 'BUILD_SETTLEMENT', playerId: botId, vertexId }, noop);
      if (succeeded) io.to(room.state.roomId).emit('game_sound', { kind: 'BUILD', playerId: botId });
      return true;
    }
  }
  if (canAfford(bot.resources, ROAD_COST) && bot.buildingStock.roads > 0) {
    const edgeId = chooseAnyRoadEdge(state.board, botId);
    if (edgeId) {
      const succeeded = dispatch(io, room, { type: 'BUILD_ROAD', playerId: botId, edgeId }, noop);
      if (succeeded) io.to(room.state.roomId).emit('game_sound', { kind: 'BUILD', playerId: botId });
      return true;
    }
  }
  if (canAfford(bot.resources, SHIP_COST) && bot.buildingStock.ships > 0) {
    const edgeId = chooseAnyShipEdge(state.board, botId);
    if (edgeId) {
      const succeeded = dispatch(io, room, { type: 'BUILD_SHIP', playerId: botId, edgeId }, noop);
      if (succeeded) io.to(room.state.roomId).emit('game_sound', { kind: 'BUILD', playerId: botId });
      return true;
    }
  }
  return false;
}

/** Runs exactly one bot decision if it's currently a bot's turn/step; returns true if it acted. */
function runOneBotAction(io: AppServer, room: Room): boolean {
  const state: GameState = room.state;

  if (state.phase === 'SETUP' && state.setup) {
    const currentPlayerId = state.setup.order[state.setup.step];
    const bot = state.players.find((p) => p.id === currentPlayerId && p.isBot);
    if (!bot) return false;
    if (state.setup.awaitingRoadForVertexId === null) {
      const vertexId = chooseSettlementVertex(state.board, bot.id, false);
      if (!vertexId) return false;
      dispatch(io, room, { type: 'PLACE_SETUP_SETTLEMENT', playerId: bot.id, vertexId }, noop);
    } else {
      const edgeId = chooseSetupRoadEdge(state.board, state.setup.awaitingRoadForVertexId);
      if (!edgeId) return false;
      dispatch(io, room, { type: 'PLACE_SETUP_ROAD', playerId: bot.id, edgeId }, noop);
    }
    return true;
  }

  if (state.phase !== 'PLAYING' || !state.turn) return false;
  const turn = state.turn;

  // A bot that's been directly offered a trade always declines rather than sitting on it forever.
  for (const trade of turn.pendingTrades) {
    if (trade.status !== 'PENDING' || !trade.targetId) continue;
    if (!state.players.find((p) => p.id === trade.targetId && p.isBot)) continue;
    dispatch(io, room, { type: 'RESPOND_TRADE', playerId: trade.targetId, tradeId: trade.id, accept: false }, noop);
    return true;
  }

  if (turn.specialBuild) {
    const sbBot = state.players.find((p) => p.id === turn.specialBuild!.activePlayerId && p.isBot);
    if (!sbBot) return false; // waiting on a human's special-build slot
    if (attemptBotBuild(io, room, state, sbBot.id)) return true;
    dispatch(io, room, { type: 'PASS_SPECIAL_BUILD', playerId: sbBot.id }, noop);
    return true;
  }

  if (turn.pendingGoldPick) {
    for (const p of state.players) {
      if (!p.isBot) continue;
      const owed = turn.pendingGoldPick[p.id] ?? 0;
      if (owed > 0) {
        dispatch(io, room, { type: 'SELECT_GOLD_RESOURCES', playerId: p.id, resources: chooseGoldPick(state, p.id, owed) }, noop);
        return true;
      }
    }
    return false;
  }

  const pendingRobber = turn.pendingRobber;

  if (pendingRobber?.stage === 'DISCARD') {
    for (const p of state.players) {
      if (!p.isBot) continue;
      const remaining = pendingRobber.discardsRemaining[p.id] ?? 0;
      if (remaining > 0) {
        dispatch(io, room, { type: 'SELECT_DISCARD', playerId: p.id, resources: chooseDiscard(p.resources, remaining) }, noop);
        return true;
      }
    }
    return false;
  }

  const bot = state.players.find((p) => p.id === turn.currentPlayerId && p.isBot);
  if (!bot) return false;

  if (pendingRobber?.stage === 'MOVE_ROBBER') {
    dispatch(io, room, { type: 'MOVE_ROBBER', playerId: bot.id, hexId: chooseRobberHex(state, bot.id) }, noop);
    return true;
  }
  if (pendingRobber?.stage === 'SELECT_TARGET') {
    const targetPlayerId = pickRandom(pendingRobber.eligibleStealTargets ?? []);
    if (!targetPlayerId) return false;
    const target = state.players.find((p) => p.id === targetPlayerId);
    const stolenResource = target ? pickRandomResourceFromHand(target.resources) : null;
    const hexId = state.board.robberHexId;
    const succeeded = dispatch(io, room, { type: 'STEAL_FROM', playerId: bot.id, targetPlayerId, stolenResource }, noop);
    if (succeeded) {
      io.to(room.state.roomId).emit('robbed_notice', { robberId: bot.id, victimId: targetPlayerId, hexId });
      if (stolenResource) emitRobbedDetail(io, room, bot.id, targetPlayerId, stolenResource);
    }
    return true;
  }
  if (pendingRobber) return false; // an unexpected stage -- don't spin forever

  if (!turn.hasRolled) {
    const dice = rollTwoDice();
    io.to(room.state.roomId).emit('dice_rolled', { playerId: bot.id, dice });
    dispatch(io, room, { type: 'ROLL_DICE', playerId: bot.id, dice }, noop);
    return true;
  }

  if (attemptBotBuild(io, room, state, bot.id)) return true;

  dispatch(io, room, { type: 'END_TURN', playerId: bot.id }, noop);
  return true;
}

const scheduledRooms = new WeakSet<Room>();

/** Kicks off (or continues) a chain of bot turns for this room, spaced out so it doesn't feel
 * instant. Safe to call after every state change -- it's a no-op if it isn't a bot's turn, and
 * de-duplicates so a room never ends up with two overlapping chains running. */
export function scheduleBotTurns(io: AppServer, room: Room) {
  if (scheduledRooms.has(room)) return;
  scheduledRooms.add(room);
  setTimeout(() => {
    scheduledRooms.delete(room);
    const acted = runOneBotAction(io, room);
    if (acted) scheduleBotTurns(io, room);
  }, BOT_ACTION_DELAY_MS);
}
