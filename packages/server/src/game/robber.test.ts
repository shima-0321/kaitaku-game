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

function makePlayingState(): GameState {
  const base = createNewGameState('room1', 'ABCDE', 'p0');
  const colors: PlayerColor[] = ['RED', 'BLUE', 'GREEN'];
  const players = ['p0', 'p1', 'p2'].map((id, i) => makeTestPlayer(id, `Player ${i}`, colors[i]));
  return {
    ...base,
    phase: 'PLAYING',
    players,
    turn: {
      turnNumber: 1,
      currentPlayerId: 'p0',
      hasRolled: false,
      lastDiceRoll: null,
      devCardPlayedThisTurn: false,
      pendingRobber: null,
      pendingTrades: [],
      specialBuild: null,
      pendingGoldPick: null,
      shipMovedThisTurn: {},
    },
  };
}

describe('rolling a 7', () => {
  it('goes straight to MOVE_ROBBER when nobody has more than 7 cards', () => {
    const state = makePlayingState();
    const result = applyAction(state, { type: 'ROLL_DICE', playerId: 'p0', dice: [3, 4] });
    expect(result.turn!.pendingRobber).not.toBeNull();
    expect(result.turn!.pendingRobber!.stage).toBe('MOVE_ROBBER');
    expect(result.turn!.pendingRobber!.discardsRemaining).toEqual({});
  });

  it('enters DISCARD stage with half (rounded down) for anyone holding more than 7 cards', () => {
    let state = makePlayingState();
    state = {
      ...state,
      players: state.players.map((p) => {
        if (p.id === 'p0') return { ...p, resources: { BRICK: 3, LUMBER: 3, WOOL: 3, GRAIN: 0, ORE: 0 } }; // 9 -> discard 4
        if (p.id === 'p1') return { ...p, resources: { BRICK: 2, LUMBER: 0, WOOL: 0, GRAIN: 0, ORE: 0 } }; // 2 -> no discard
        return p;
      }),
    };

    const result = applyAction(state, { type: 'ROLL_DICE', playerId: 'p0', dice: [3, 4] });
    expect(result.turn!.pendingRobber!.stage).toBe('DISCARD');
    expect(result.turn!.pendingRobber!.discardsRemaining).toEqual({ p0: 4 });
  });

  it('blocks rolling again while a robber sequence is pending', () => {
    let state = makePlayingState();
    state = applyAction(state, { type: 'ROLL_DICE', playerId: 'p0', dice: [3, 4] });
    const result = validateAction(state, { type: 'ROLL_DICE', playerId: 'p0', dice: [1, 1] });
    expect(result.ok).toBe(false);
  });
});

describe('discard stage', () => {
  function stateAwaitingDiscard(): GameState {
    let state = makePlayingState();
    state = {
      ...state,
      players: state.players.map((p) =>
        p.id === 'p0' ? { ...p, resources: { BRICK: 4, LUMBER: 4, WOOL: 0, GRAIN: 0, ORE: 0 } } : p,
      ),
    };
    return applyAction(state, { type: 'ROLL_DICE', playerId: 'p0', dice: [3, 4] });
  }

  it('rejects a discard of the wrong size', () => {
    const state = stateAwaitingDiscard();
    const result = validateAction(state, { type: 'SELECT_DISCARD', playerId: 'p0', resources: { BRICK: 1 } });
    expect(result.ok).toBe(false);
  });

  it('rejects discarding resources the player does not have', () => {
    const state = stateAwaitingDiscard();
    const result = validateAction(state, { type: 'SELECT_DISCARD', playerId: 'p0', resources: { ORE: 4 } });
    expect(result.ok).toBe(false);
  });

  it('rejects a negative amount smuggled in to net a gain instead of a discard', () => {
    // BRICK:4 + LUMBER:4 - ORE:4 still totals the required 4, and every individual key passes
    // canAfford (a negative "cost" is trivially affordable) -- without an explicit non-negative
    // check this would zero out the player's real hand while also handing them 4 free ORE.
    const state = stateAwaitingDiscard();
    const result = validateAction(state, {
      type: 'SELECT_DISCARD',
      playerId: 'p0',
      resources: { BRICK: 4, LUMBER: 4, ORE: -4 },
    });
    expect(result.ok).toBe(false);
  });

  it('accepts a discard payload that omits zero-count resources (as the client sends it)', () => {
    // DiscardModal only includes resource keys with a positive count, so BRICK/WOOL/GRAIN/ORE
    // are absent here rather than explicitly zero -- totalResources must not choke on that.
    const state = stateAwaitingDiscard();
    const result = validateAction(state, { type: 'SELECT_DISCARD', playerId: 'p0', resources: { LUMBER: 4 } });
    expect(result.ok).toBe(true);
  });

  it('accepts a correctly-sized discard and returns cards to the bank', () => {
    const state = stateAwaitingDiscard();
    const bankBrickBefore = state.bank.resources.BRICK;
    const result = applyAction(state, { type: 'SELECT_DISCARD', playerId: 'p0', resources: { BRICK: 4 } });

    const p0 = result.players.find((p) => p.id === 'p0')!;
    expect(p0.resources.BRICK).toBe(0);
    expect(result.bank.resources.BRICK).toBe(bankBrickBefore + 4);
    expect(result.turn!.pendingRobber!.stage).toBe('MOVE_ROBBER');
  });

  it('stays in DISCARD stage until every over-limit player has discarded', () => {
    let state = makePlayingState();
    state = {
      ...state,
      players: state.players.map((p) => {
        if (p.id === 'p0') return { ...p, resources: { BRICK: 4, LUMBER: 4, WOOL: 0, GRAIN: 0, ORE: 0 } };
        if (p.id === 'p1') return { ...p, resources: { BRICK: 0, LUMBER: 0, WOOL: 4, GRAIN: 4, ORE: 0 } };
        return p;
      }),
    };
    state = applyAction(state, { type: 'ROLL_DICE', playerId: 'p0', dice: [3, 4] });
    expect(state.turn!.pendingRobber!.discardsRemaining).toEqual({ p0: 4, p1: 4 });

    state = applyAction(state, { type: 'SELECT_DISCARD', playerId: 'p0', resources: { BRICK: 4 } });
    expect(state.turn!.pendingRobber!.stage).toBe('DISCARD');

    state = applyAction(state, { type: 'SELECT_DISCARD', playerId: 'p1', resources: { WOOL: 4 } });
    expect(state.turn!.pendingRobber!.stage).toBe('MOVE_ROBBER');
  });
});

describe('move robber + steal', () => {
  it('rejects a non-current-player trying to move the robber', () => {
    let state = makePlayingState();
    state = applyAction(state, { type: 'ROLL_DICE', playerId: 'p0', dice: [3, 4] });
    const targetHexId = Object.keys(state.board.tiles).find((id) => id !== state.board.robberHexId)!;
    const result = validateAction(state, { type: 'MOVE_ROBBER', playerId: 'p1', hexId: targetHexId });
    expect(result.ok).toBe(false);
  });

  it('rejects moving the robber to its current tile', () => {
    let state = makePlayingState();
    state = applyAction(state, { type: 'ROLL_DICE', playerId: 'p0', dice: [3, 4] });
    const result = validateAction(state, { type: 'MOVE_ROBBER', playerId: 'p0', hexId: state.board.robberHexId });
    expect(result.ok).toBe(false);
  });

  it('ends the robber sequence immediately when the new tile has no opposing buildings', () => {
    let state = makePlayingState();
    state = applyAction(state, { type: 'ROLL_DICE', playerId: 'p0', dice: [3, 4] });
    const targetHexId = Object.keys(state.board.tiles).find((id) => id !== state.board.robberHexId)!;
    const result = applyAction(state, { type: 'MOVE_ROBBER', playerId: 'p0', hexId: targetHexId });
    expect(result.board.robberHexId).toBe(targetHexId);
    expect(result.turn!.pendingRobber).toBeNull();
  });

  it('moves to SELECT_TARGET when an opponent has a building on the new tile, then transfers a card on steal', () => {
    let state = makePlayingState();
    const targetHexId = Object.keys(state.board.tiles).find((id) => id !== state.board.robberHexId)!;
    const opponentVertexId = Object.values(state.board.vertices).find((v) => v.hexIds.includes(targetHexId))!.id;
    state = {
      ...state,
      board: {
        ...state.board,
        vertices: {
          ...state.board.vertices,
          [opponentVertexId]: { ...state.board.vertices[opponentVertexId], building: { playerId: 'p1', type: 'SETTLEMENT' } },
        },
      },
      players: state.players.map((p) => (p.id === 'p1' ? { ...p, resources: { ...p.resources, ORE: 1 } } : p)),
    };

    state = applyAction(state, { type: 'ROLL_DICE', playerId: 'p0', dice: [3, 4] });
    state = applyAction(state, { type: 'MOVE_ROBBER', playerId: 'p0', hexId: targetHexId });
    expect(state.turn!.pendingRobber!.stage).toBe('SELECT_TARGET');
    expect(state.turn!.pendingRobber!.eligibleStealTargets).toEqual(['p1']);

    expect(validateAction(state, { type: 'STEAL_FROM', playerId: 'p0', targetPlayerId: 'p2', stolenResource: null }).ok).toBe(false);
    expect(validateAction(state, { type: 'STEAL_FROM', playerId: 'p0', targetPlayerId: 'p1', stolenResource: null }).ok).toBe(true);

    state = applyAction(state, { type: 'STEAL_FROM', playerId: 'p0', targetPlayerId: 'p1', stolenResource: 'ORE' });
    const p0 = state.players.find((p) => p.id === 'p0')!;
    const p1 = state.players.find((p) => p.id === 'p1')!;
    expect(p0.resources.ORE).toBe(1);
    expect(p1.resources.ORE).toBe(0);
    expect(state.turn!.pendingRobber).toBeNull();
  });

  it('ends the sequence cleanly even when there was nothing to steal (stolenResource null)', () => {
    let state = makePlayingState();
    const targetHexId = Object.keys(state.board.tiles).find((id) => id !== state.board.robberHexId)!;
    const opponentVertexId = Object.values(state.board.vertices).find((v) => v.hexIds.includes(targetHexId))!.id;
    state = {
      ...state,
      board: {
        ...state.board,
        vertices: {
          ...state.board.vertices,
          [opponentVertexId]: { ...state.board.vertices[opponentVertexId], building: { playerId: 'p1', type: 'SETTLEMENT' } },
        },
      },
    };
    state = applyAction(state, { type: 'ROLL_DICE', playerId: 'p0', dice: [3, 4] });
    state = applyAction(state, { type: 'MOVE_ROBBER', playerId: 'p0', hexId: targetHexId });
    state = applyAction(state, { type: 'STEAL_FROM', playerId: 'p0', targetPlayerId: 'p1', stolenResource: null });
    expect(state.turn!.pendingRobber).toBeNull();
  });
});

describe('friendly robber house rule', () => {
  /** p1 has a single settlement (1 visible point, within the "only 2 points" protection); p2 has
   * a city plus largest army (2 + 2 = 4 points, clearly past the threshold, so not protected). */
  function stateWithProtectedAndUnprotectedTargets(friendlyRobberEnabled: boolean): { state: GameState; protectedHexId: string; openHexId: string } {
    let state = { ...makePlayingState(), friendlyRobberEnabled };
    const hexIds = Object.keys(state.board.tiles).filter((id) => id !== state.board.robberHexId);
    const protectedHexId = hexIds[0];
    // Pick a second hex that shares no vertex with the first, so the two test buildings can't
    // accidentally end up "protecting" each other's tile too.
    const openHexId = hexIds.find(
      (id) => id !== protectedHexId && !Object.values(state.board.vertices).some((v) => v.hexIds.includes(id) && v.hexIds.includes(protectedHexId)),
    )!;
    const protectedVertexId = Object.values(state.board.vertices).find((v) => v.hexIds.includes(protectedHexId))!.id;
    const openVertexId = Object.values(state.board.vertices).find((v) => v.hexIds.includes(openHexId))!.id;
    state = {
      ...state,
      largestArmyPlayerId: 'p2',
      board: {
        ...state.board,
        vertices: {
          ...state.board.vertices,
          [protectedVertexId]: { ...state.board.vertices[protectedVertexId], building: { playerId: 'p1', type: 'SETTLEMENT' } },
          [openVertexId]: { ...state.board.vertices[openVertexId], building: { playerId: 'p2', type: 'CITY' } },
        },
      },
    };
    state = applyAction(state, { type: 'ROLL_DICE', playerId: 'p0', dice: [3, 4] });
    return { state, protectedHexId, openHexId };
  }

  it('blocks moving the robber onto a hex touching a player at only 2 visible points, when enabled', () => {
    const { state, protectedHexId, openHexId } = stateWithProtectedAndUnprotectedTargets(true);
    expect(validateAction(state, { type: 'MOVE_ROBBER', playerId: 'p0', hexId: protectedHexId }).ok).toBe(false);
    expect(validateAction(state, { type: 'MOVE_ROBBER', playerId: 'p0', hexId: openHexId }).ok).toBe(true);
  });

  it('does not restrict robber placement when disabled (default)', () => {
    const { state, protectedHexId } = stateWithProtectedAndUnprotectedTargets(false);
    expect(validateAction(state, { type: 'MOVE_ROBBER', playerId: 'p0', hexId: protectedHexId }).ok).toBe(true);
  });
});

describe('other actions are blocked while the robber sequence is pending', () => {
  it('blocks building and ending the turn', () => {
    let state = makePlayingState();
    state = applyAction(state, { type: 'ROLL_DICE', playerId: 'p0', dice: [3, 4] });
    expect(validateAction(state, { type: 'END_TURN', playerId: 'p0' }).ok).toBe(false);
    const anyEdgeId = Object.keys(state.board.edges)[0];
    expect(validateAction(state, { type: 'BUILD_ROAD', playerId: 'p0', edgeId: anyEdgeId }).ok).toBe(false);
  });
});
