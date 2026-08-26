import { describe, it, expect } from 'vitest';
import type { GameState, Player, PlayerColor } from '@catan-online/shared';
import { createEmptyPlayerStats } from '@catan-online/shared';
import { createNewGameState } from './setup.js';
import { applyAction } from './reducer.js';
import { validateAction } from './validate.js';

function makeTestPlayer(id: string, name: string, color: PlayerColor): Player {
  return {
    id,
    name,
    color,
    connected: true,
    sessionToken: `token-${id}`,
    resources: { BRICK: 0, LUMBER: 0, WOOL: 0, GRAIN: 0, ORE: 0 },
    devCards: [],
    buildingStock: { settlements: 5, cities: 4, roads: 15, ships: 15 },
    knightsPlayed: 0,
    stats: createEmptyPlayerStats(),
    isBot: false,
  };
}

function makeGameWithPlayers(count: 3 | 4): GameState {
  const state = createNewGameState('room1', 'ABCDE', 'p0');
  const colors: PlayerColor[] = ['RED', 'BLUE', 'GREEN', 'YELLOW'];
  const players = Array.from({ length: count }, (_, i) => makeTestPlayer(`p${i}`, `Player ${i}`, colors[i]));
  return { ...state, players };
}

function findIsolatedVertex(state: GameState): string {
  return Object.values(state.board.vertices).find(
    (v) => !v.building && v.adjacentVertexIds.every((adjId) => !state.board.vertices[adjId].building),
  )!.id;
}

function runFullSetup(initialState: GameState): GameState {
  let state = initialState;
  const order = state.setup!.order;
  for (let step = 0; step < order.length; step++) {
    const playerId = state.setup!.order[step];
    const vertexId = findIsolatedVertex(state);
    state = applyAction(state, { type: 'PLACE_SETUP_SETTLEMENT', playerId, vertexId });
    const edgeId = state.board.vertices[vertexId].edgeIds[0];
    state = applyAction(state, { type: 'PLACE_SETUP_ROAD', playerId, edgeId });
  }
  return state;
}

describe('reducer: setup flow', () => {
  it('runs a full snake-draft setup for 3 players and transitions to PLAYING', () => {
    let state = makeGameWithPlayers(3);
    expect(validateAction(state, { type: 'START_GAME', playerId: 'p0' }).ok).toBe(true);
    state = applyAction(state, { type: 'START_GAME', playerId: 'p0' });
    expect(state.phase).toBe('SETUP');
    // Turn order is randomized by a dice roll at game start, so only the snake-draft *shape*
    // is checked here: the first half is a permutation of all players, the second half its reverse.
    const order = state.setup!.order;
    expect(order).toHaveLength(6);
    expect(new Set(order.slice(0, 3))).toEqual(new Set(['p0', 'p1', 'p2']));
    expect(order.slice(3)).toEqual([...order.slice(0, 3)].reverse());

    state = runFullSetup(state);

    expect(state.phase).toBe('PLAYING');
    expect(state.turn?.currentPlayerId).toBe(order[0]);
    expect(state.setup).toBeNull();

    const totalResources = state.players.reduce(
      (sum, p) => sum + p.resources.BRICK + p.resources.LUMBER + p.resources.WOOL + p.resources.GRAIN + p.resources.ORE,
      0,
    );
    expect(totalResources).toBeGreaterThan(0); // round-2 settlements grant starting resources
  });

  it('rejects placing out of turn during setup', () => {
    let state = makeGameWithPlayers(3);
    state = applyAction(state, { type: 'START_GAME', playerId: 'p0' });
    const vertexId = findIsolatedVertex(state);
    // dice-roll turn order is randomized at START_GAME, so pick whoever is NOT first to place
    const notCurrentPlayerId = state.players.find((p) => p.id !== state.setup!.order[0])!.id;
    const result = validateAction(state, { type: 'PLACE_SETUP_SETTLEMENT', playerId: notCurrentPlayerId, vertexId });
    expect(result.ok).toBe(false);
  });

  it('allows re-picking the starting settlement before the road is placed', () => {
    let state = makeGameWithPlayers(3);
    state = applyAction(state, { type: 'START_GAME', playerId: 'p0' });
    // dice-roll turn order, randomized at START_GAME -- the first setup player isn't necessarily 'p0'
    const firstPlayerId = state.setup!.order[0];
    const firstVertexId = findIsolatedVertex(state);
    state = applyAction(state, { type: 'PLACE_SETUP_SETTLEMENT', playerId: firstPlayerId, vertexId: firstVertexId });
    expect(state.board.vertices[firstVertexId].building?.playerId).toBe(firstPlayerId);
    expect(state.players.find((p) => p.id === firstPlayerId)!.buildingStock.settlements).toBe(4);

    const secondVertexId = Object.keys(state.board.vertices).find((id) => {
      if (id === firstVertexId) return false;
      const v = state.board.vertices[id];
      return !v.building && v.adjacentVertexIds.every((adjId) => !state.board.vertices[adjId].building || adjId === firstVertexId);
    })!;
    // re-placing at the same vertex should be rejected
    expect(validateAction(state, { type: 'PLACE_SETUP_SETTLEMENT', playerId: firstPlayerId, vertexId: firstVertexId }).ok).toBe(false);

    state = applyAction(state, { type: 'PLACE_SETUP_SETTLEMENT', playerId: firstPlayerId, vertexId: secondVertexId });

    // the old settlement is gone and the stock count did not change net (undo + place)
    expect(state.board.vertices[firstVertexId].building).toBeNull();
    expect(state.board.vertices[secondVertexId].building?.playerId).toBe(firstPlayerId);
    expect(state.players.find((p) => p.id === firstPlayerId)!.buildingStock.settlements).toBe(4);
    expect(state.setup?.awaitingRoadForVertexId).toBe(secondVertexId);
  });
});

describe('reducer: build actions', () => {
  it('rejects building without enough resources and accepts it once resources are granted', () => {
    let state = makeGameWithPlayers(3);
    state = applyAction(state, { type: 'START_GAME', playerId: 'p0' });
    state = runFullSetup(state);

    const currentPlayerId = state.turn!.currentPlayerId;
    state = applyAction(state, { type: 'ROLL_DICE', playerId: currentPlayerId, dice: [3, 3] });

    // The board is randomly generated (unseeded), so whatever this roll just produced for
    // currentPlayerId is board-layout-dependent -- clear it explicitly rather than assume it's
    // empty, otherwise this assertion is flaky whenever the player's setup settlement happened to
    // land next to a 6 that produces BRICK/LUMBER.
    state = {
      ...state,
      players: state.players.map((p) => (p.id === currentPlayerId ? { ...p, resources: { ...p.resources, BRICK: 0, LUMBER: 0 } } : p)),
    };

    const freeEdgeId = Object.values(state.board.edges).find(
      (e) => !e.road && e.vertexIds.some((v) => state.board.vertices[v].building?.playerId === currentPlayerId),
    )!.id;

    expect(validateAction(state, { type: 'BUILD_ROAD', playerId: currentPlayerId, edgeId: freeEdgeId }).ok).toBe(false);

    state = {
      ...state,
      players: state.players.map((p) =>
        p.id === currentPlayerId ? { ...p, resources: { ...p.resources, BRICK: 1, LUMBER: 1 } } : p,
      ),
    };
    expect(validateAction(state, { type: 'BUILD_ROAD', playerId: currentPlayerId, edgeId: freeEdgeId }).ok).toBe(true);

    state = applyAction(state, { type: 'BUILD_ROAD', playerId: currentPlayerId, edgeId: freeEdgeId });
    expect(state.board.edges[freeEdgeId].road?.playerId).toBe(currentPlayerId);
    const player = state.players.find((p) => p.id === currentPlayerId)!;
    expect(player.resources.BRICK).toBe(0);
    expect(player.resources.LUMBER).toBe(0);
  });

  it('returns the settlement piece to stock when upgrading to a city', () => {
    let state = makeGameWithPlayers(3);
    state = applyAction(state, { type: 'START_GAME', playerId: 'p0' });
    state = runFullSetup(state);

    const currentPlayerId = state.turn!.currentPlayerId;
    state = applyAction(state, { type: 'ROLL_DICE', playerId: currentPlayerId, dice: [3, 3] });

    const ownSettlementVertexId = Object.values(state.board.vertices).find(
      (v) => v.building?.playerId === currentPlayerId && v.building.type === 'SETTLEMENT',
    )!.id;
    const player = state.players.find((p) => p.id === currentPlayerId)!;
    const settlementsBefore = player.buildingStock.settlements;
    const citiesBefore = player.buildingStock.cities;

    state = {
      ...state,
      players: state.players.map((p) => (p.id === currentPlayerId ? { ...p, resources: { ...p.resources, GRAIN: 2, ORE: 3 } } : p)),
    };
    state = applyAction(state, { type: 'BUILD_CITY', playerId: currentPlayerId, vertexId: ownSettlementVertexId });

    const updatedPlayer = state.players.find((p) => p.id === currentPlayerId)!;
    expect(state.board.vertices[ownSettlementVertexId].building?.type).toBe('CITY');
    expect(updatedPlayer.buildingStock.settlements).toBe(settlementsBefore + 1);
    expect(updatedPlayer.buildingStock.cities).toBe(citiesBefore - 1);
  });
});

describe('reducer: turn rotation', () => {
  it('advances to the next player on END_TURN and wraps around', () => {
    let state = makeGameWithPlayers(3);
    state = applyAction(state, { type: 'START_GAME', playerId: 'p0' });
    // dice-roll turn order, randomized at START_GAME -- state.players is reordered to match it
    const turnOrder = state.players.map((p) => p.id);
    state = runFullSetup(state);

    expect(state.turn!.currentPlayerId).toBe(turnOrder[0]);
    const pairs = turnOrder.map((id, i): [string, string] => [id, turnOrder[(i + 1) % turnOrder.length]]);
    for (const [current, next] of pairs) {
      state = applyAction(state, { type: 'ROLL_DICE', playerId: current, dice: [2, 2] });
      state = applyAction(state, { type: 'END_TURN', playerId: current });
      expect(state.turn!.currentPlayerId).toBe(next);
    }
    expect(state.turn!.turnNumber).toBe(4);
  });
});

describe('reducer: special building phase', () => {
  function makeGameWithSpecialBuild(count: 3 | 4): GameState {
    return { ...makeGameWithPlayers(count), specialBuildingPhaseEnabled: true };
  }

  it('gives every other player one build slot, in order, before the real next turn begins', () => {
    let state = makeGameWithSpecialBuild(4);
    state = applyAction(state, { type: 'START_GAME', playerId: 'p0' });
    const turnOrder = state.players.map((p) => p.id);
    state = runFullSetup(state);

    const [current, next1, next2, next3] = turnOrder;
    expect(state.turn!.currentPlayerId).toBe(current);

    state = applyAction(state, { type: 'ROLL_DICE', playerId: current, dice: [2, 2] });
    state = applyAction(state, { type: 'END_TURN', playerId: current });

    // currentPlayerId stays frozen on the player who just went while the phase runs
    expect(state.turn!.currentPlayerId).toBe(current);
    expect(state.turn!.specialBuild).toEqual({ queue: [next2, next3], activePlayerId: next1, nextPlayerId: next1 });
    expect(validateAction(state, { type: 'PASS_SPECIAL_BUILD', playerId: next2 }).ok).toBe(false); // not their slot yet

    state = applyAction(state, { type: 'PASS_SPECIAL_BUILD', playerId: next1 });
    expect(state.turn!.specialBuild).toEqual({ queue: [next3], activePlayerId: next2, nextPlayerId: next1 });

    state = applyAction(state, { type: 'PASS_SPECIAL_BUILD', playerId: next2 });
    expect(state.turn!.specialBuild).toEqual({ queue: [], activePlayerId: next3, nextPlayerId: next1 });

    state = applyAction(state, { type: 'PASS_SPECIAL_BUILD', playerId: next3 });
    // the phase resolves into the same "next player" turn rotation would have picked anyway
    expect(state.turn!.specialBuild).toBeNull();
    expect(state.turn!.currentPlayerId).toBe(next1);
    expect(state.turn!.turnNumber).toBe(2);
    expect(state.turn!.hasRolled).toBe(false);
  });

  it('lets the active special-build player build/buy without having rolled, but blocks everyone else', () => {
    let state = makeGameWithSpecialBuild(3);
    state = applyAction(state, { type: 'START_GAME', playerId: 'p0' });
    const [current, active, waiting] = state.players.map((p) => p.id);
    state = runFullSetup(state);
    state = applyAction(state, { type: 'ROLL_DICE', playerId: current, dice: [2, 2] });
    state = applyAction(state, { type: 'END_TURN', playerId: current });
    expect(state.turn!.specialBuild!.activePlayerId).toBe(active);

    const freeEdgeId = Object.values(state.board.edges).find(
      (e) => !e.road && e.vertexIds.some((v) => state.board.vertices[v].building?.playerId === active),
    )!.id;

    // the player waiting in the queue cannot act yet, and the frozen "current" player cannot either
    expect(validateAction(state, { type: 'BUILD_ROAD', playerId: waiting, edgeId: freeEdgeId }).ok).toBe(false);
    expect(validateAction(state, { type: 'END_TURN', playerId: current }).ok).toBe(false);

    state = {
      ...state,
      players: state.players.map((p) => (p.id === active ? { ...p, resources: { ...p.resources, BRICK: 1, LUMBER: 1 } } : p)),
    };
    // no dice roll needed during a special-build slot
    state = applyAction(state, { type: 'BUILD_ROAD', playerId: active, edgeId: freeEdgeId });
    expect(state.board.edges[freeEdgeId].road?.playerId).toBe(active);
  });

  it('blocks trading and playing development cards for everyone while the phase is active', () => {
    let state = makeGameWithSpecialBuild(3);
    state = applyAction(state, { type: 'START_GAME', playerId: 'p0' });
    const [current, active] = state.players.map((p) => p.id);
    state = runFullSetup(state);
    state = applyAction(state, { type: 'ROLL_DICE', playerId: current, dice: [2, 2] });
    state = applyAction(state, { type: 'END_TURN', playerId: current });

    expect(validateAction(state, { type: 'BANK_TRADE', playerId: active, give: { BRICK: 4 }, receive: { ORE: 1 } }).ok).toBe(false);
    expect(validateAction(state, { type: 'PLAY_DEV_CARD', playerId: active, devCardId: 'whatever' }).ok).toBe(false);
  });

  it('defers a win reached during a special-build slot until that player\'s real turn starts', () => {
    let state = makeGameWithSpecialBuild(3);
    state = applyAction(state, { type: 'START_GAME', playerId: 'p0' });
    const [current, active, last] = state.players.map((p) => p.id);
    state = runFullSetup(state);

    // give `active` 9 points' worth of cities/settlements up front, same trick as the win-condition test above
    let vertices = { ...state.board.vertices };
    let placed = 0;
    for (const vId of Object.keys(vertices)) {
      const v = vertices[vId];
      if (v.building || v.adjacentVertexIds.some((a) => vertices[a].building)) continue;
      vertices = { ...vertices, [vId]: { ...v, building: { playerId: active, type: placed < 4 ? 'CITY' : 'SETTLEMENT' } } };
      placed++;
      if (placed === 5) break;
    }
    expect(placed).toBe(5);
    state = { ...state, board: { ...state.board, vertices } };

    state = applyAction(state, { type: 'ROLL_DICE', playerId: current, dice: [2, 2] });
    state = applyAction(state, { type: 'END_TURN', playerId: current });
    expect(state.turn!.specialBuild!.activePlayerId).toBe(active);

    // buying a hidden victory-point card pushes `active` to 10 points during their special-build slot
    state = {
      ...state,
      players: state.players.map((p) => (p.id === active ? { ...p, resources: { WOOL: 1, GRAIN: 1, ORE: 1, BRICK: 0, LUMBER: 0 } } : p)),
      bank: { ...state.bank, devCardDeck: [{ id: 'vp-1', type: 'VICTORY_POINT', boughtOnTurn: -1, used: false }] },
    };
    state = applyAction(state, { type: 'BUY_DEV_CARD', playerId: active });
    expect(state.winnerId).toBeNull(); // not during the special build phase
    expect(state.phase).toBe('PLAYING');

    state = applyAction(state, { type: 'PASS_SPECIAL_BUILD', playerId: active });
    expect(state.turn!.specialBuild!.activePlayerId).toBe(last);
    state = applyAction(state, { type: 'PASS_SPECIAL_BUILD', playerId: last });

    // the phase resolves into `active`'s real turn -- the game should now recognize the win
    expect(state.turn!.currentPlayerId).toBe(active);
    expect(state.winnerId).toBe(active);
    expect(state.phase).toBe('GAME_OVER');
  });
});

describe('reducer: win condition', () => {
  it('declares a winner once the acting player reaches 10 victory points via a new settlement', () => {
    let state = makeGameWithPlayers(3);
    state = applyAction(state, { type: 'START_GAME', playerId: 'p0' });
    state = {
      ...state,
      phase: 'PLAYING',
      setup: null,
      turn: {
        turnNumber: 1,
        currentPlayerId: 'p0',
        hasRolled: true,
        lastDiceRoll: [3, 3],
        devCardPlayedThisTurn: false,
        pendingRobber: null,
        pendingTrades: [],
        specialBuild: null,
        pendingGoldPick: null,
        shipMovedThisTurn: {},
      },
    };

    // 4 cities (8 pts) + 1 settlement (1 pt) = 9 points, placed directly on the board for test setup.
    // (immer freezes the state returned by applyAction, so build a new vertices map rather than mutating in place.)
    let placed = 0;
    let vertices = { ...state.board.vertices };
    for (const vId of Object.keys(vertices)) {
      const v = vertices[vId];
      if (v.adjacentVertexIds.some((a) => vertices[a].building)) continue;
      const type = placed < 4 ? 'CITY' : 'SETTLEMENT';
      vertices = { ...vertices, [vId]: { ...v, building: { playerId: 'p0', type } } };
      placed++;
      if (placed === 5) break;
    }
    state = { ...state, board: { ...state.board, vertices } };
    expect(placed).toBe(5);

    const lastVertexId = findIsolatedVertex(state);
    state = {
      ...state,
      players: state.players.map((p) =>
        p.id === 'p0' ? { ...p, resources: { BRICK: 1, LUMBER: 1, WOOL: 1, GRAIN: 1, ORE: 0 } } : p,
      ),
    };
    state = applyAction(state, { type: 'BUILD_SETTLEMENT', playerId: 'p0', vertexId: lastVertexId });

    expect(state.winnerId).toBe('p0');
    expect(state.phase).toBe('GAME_OVER');
  });
});
