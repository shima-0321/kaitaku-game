import { describe, it, expect } from 'vitest';
import type { GameState, Player, PlayerColor } from '@catan-online/shared';
import { createEmptyPlayerStats, generateBoard } from '@catan-online/shared';
import { createNewGameState } from './setup.js';
import { applyAction } from './reducer.js';
import { validateAction } from './validate.js';

// deterministic PRNG for reproducible tests
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

function makeSeafarersPlayingState(seed: number): GameState {
  const base = createNewGameState('room1', 'ABCDE', 'p0');
  const colors: PlayerColor[] = ['RED', 'BLUE', 'GREEN'];
  const players = ['p0', 'p1', 'p2'].map((id, i) => makeTestPlayer(id, `Player ${i}`, colors[i]));
  return {
    ...base,
    phase: 'PLAYING',
    seafarersEnabled: true,
    board: generateBoard({ rng: mulberry32(seed), seafarers: true }),
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

/** Any dice pair summing to `total` (all of SEAFARERS_SATELLITE_NUMBER_TOKENS are <= 12 and != 7). */
function diceFor(total: number): [number, number] {
  const d1 = Math.min(6, total - 1);
  return [d1, total - d1];
}

function findEdge(state: GameState, matches: (terrain: string) => boolean) {
  return Object.values(state.board.edges).find(
    (e) => e.hexIds.length > 0 && e.hexIds.every((id) => matches(state.board.tiles[id].terrain)),
  )!;
}

function isSeaOnlyEdge(state: GameState, edgeId: string): boolean {
  const e = state.board.edges[edgeId];
  return e.hexIds.length > 0 && e.hexIds.every((id) => state.board.tiles[id].terrain === 'SEA');
}

function otherVertex(edge: { vertexIds: [string, string] }, vertexId: string): string {
  return edge.vertexIds[0] === vertexId ? edge.vertexIds[1] : edge.vertexIds[0];
}

/** A vertex deep in open water with 3+ purely-sea edges radiating from it -- gives room to build a
 * two-ship chain (anchor -> junction -> loose end) plus a third edge as a move destination. */
function findSeaJunction(state: GameState): { center: string; edgeIds: string[] } {
  for (const v of Object.values(state.board.vertices)) {
    const seaEdges = v.edgeIds.filter((eId) => isSeaOnlyEdge(state, eId));
    if (seaEdges.length >= 3) return { center: v.id, edgeIds: seaEdges };
  }
  throw new Error('no sea junction found');
}

describe('building ships', () => {
  it('rejects a ship on a purely land edge, and builds one on a sea-touching edge once connected', () => {
    const state = makeSeafarersPlayingState(1);
    const seaOnlyEdge = findEdge(state, (t) => t === 'SEA');
    const landOnlyEdge = findEdge(state, (t) => t !== 'SEA');

    let withState: GameState = {
      ...state,
      turn: { ...state.turn!, hasRolled: true },
      board: {
        ...state.board,
        vertices: {
          ...state.board.vertices,
          [seaOnlyEdge.vertexIds[0]]: {
            ...state.board.vertices[seaOnlyEdge.vertexIds[0]],
            building: { playerId: 'p0', type: 'SETTLEMENT' },
          },
        },
      },
      players: state.players.map((p) => (p.id === 'p0' ? { ...p, resources: { ...p.resources, LUMBER: 1, WOOL: 1 } } : p)),
    };

    expect(validateAction(withState, { type: 'BUILD_SHIP', playerId: 'p0', edgeId: landOnlyEdge.id }).ok).toBe(false);
    expect(validateAction(withState, { type: 'BUILD_SHIP', playerId: 'p0', edgeId: seaOnlyEdge.id }).ok).toBe(true);

    const shipsBefore = withState.players.find((p) => p.id === 'p0')!.buildingStock.ships;
    withState = applyAction(withState, { type: 'BUILD_SHIP', playerId: 'p0', edgeId: seaOnlyEdge.id });
    const p0 = withState.players.find((p) => p.id === 'p0')!;
    expect(withState.board.edges[seaOnlyEdge.id].ship?.playerId).toBe('p0');
    expect(p0.buildingStock.ships).toBe(shipsBefore - 1);
    expect(p0.resources.LUMBER).toBe(0);
    expect(p0.resources.WOOL).toBe(0);
  });

  it('rejects building without enough ships in stock', () => {
    const state = makeSeafarersPlayingState(2);
    const seaOnlyEdge = findEdge(state, (t) => t === 'SEA');
    const withState: GameState = {
      ...state,
      turn: { ...state.turn!, hasRolled: true },
      board: {
        ...state.board,
        vertices: {
          ...state.board.vertices,
          [seaOnlyEdge.vertexIds[0]]: {
            ...state.board.vertices[seaOnlyEdge.vertexIds[0]],
            building: { playerId: 'p0', type: 'SETTLEMENT' },
          },
        },
      },
      players: state.players.map((p) =>
        p.id === 'p0'
          ? { ...p, resources: { ...p.resources, LUMBER: 1, WOOL: 1 }, buildingStock: { ...p.buildingStock, ships: 0 } }
          : p,
      ),
    };
    expect(validateAction(withState, { type: 'BUILD_SHIP', playerId: 'p0', edgeId: seaOnlyEdge.id }).ok).toBe(false);
  });
});

describe('move pirate + steal', () => {
  it('rejects moving the robber onto a sea tile and the pirate onto a land tile', () => {
    let state = makeSeafarersPlayingState(3);
    state = applyAction(state, { type: 'ROLL_DICE', playerId: 'p0', dice: [3, 4] });
    const seaHexId = Object.keys(state.board.tiles).find((id) => state.board.tiles[id].terrain === 'SEA')!;
    const landHexId = Object.keys(state.board.tiles).find(
      (id) => state.board.tiles[id].terrain !== 'SEA' && id !== state.board.robberHexId,
    )!;
    expect(validateAction(state, { type: 'MOVE_ROBBER', playerId: 'p0', hexId: seaHexId }).ok).toBe(false);
    expect(validateAction(state, { type: 'MOVE_PIRATE', playerId: 'p0', hexId: landHexId }).ok).toBe(false);
  });

  it('moves to SELECT_TARGET when an opponent has a ship on the new sea tile, then transfers a card on steal', () => {
    let state = makeSeafarersPlayingState(4);
    const seaEdge = findEdge(state, (t) => t === 'SEA');
    const targetHexId = seaEdge.hexIds[0];
    const otherPirateHexId = Object.keys(state.board.tiles).find(
      (id) => state.board.tiles[id].terrain === 'SEA' && id !== targetHexId,
    )!;

    state = {
      ...state,
      board: {
        ...state.board,
        pirateHexId: otherPirateHexId,
        edges: { ...state.board.edges, [seaEdge.id]: { ...seaEdge, ship: { playerId: 'p1' } } },
      },
      players: state.players.map((p) => (p.id === 'p1' ? { ...p, resources: { ...p.resources, ORE: 1 } } : p)),
    };

    state = applyAction(state, { type: 'ROLL_DICE', playerId: 'p0', dice: [3, 4] });
    expect(state.turn!.pendingRobber!.stage).toBe('MOVE_ROBBER');

    state = applyAction(state, { type: 'MOVE_PIRATE', playerId: 'p0', hexId: targetHexId });
    expect(state.board.pirateHexId).toBe(targetHexId);
    expect(state.turn!.pendingRobber!.stage).toBe('SELECT_TARGET');
    expect(state.turn!.pendingRobber!.eligibleStealTargets).toEqual(['p1']);

    state = applyAction(state, { type: 'STEAL_FROM', playerId: 'p0', targetPlayerId: 'p1', stolenResource: 'ORE' });
    const p0 = state.players.find((p) => p.id === 'p0')!;
    const p1 = state.players.find((p) => p.id === 'p1')!;
    expect(p0.resources.ORE).toBe(1);
    expect(p1.resources.ORE).toBe(0);
    expect(state.turn!.pendingRobber).toBeNull();
  });
});

describe('gold hex picks', () => {
  function stateWithGoldOwed(seed: number): { state: GameState; goldNumber: number } {
    let state = makeSeafarersPlayingState(seed);
    const goldHexId = Object.keys(state.board.tiles).find((id) => state.board.tiles[id].terrain === 'GOLD')!;
    const goldNumber = state.board.tiles[goldHexId].numberToken!;
    const [settlementVertexId, cityVertexId] = Object.values(state.board.vertices)
      .filter((v) => v.hexIds.includes(goldHexId))
      .map((v) => v.id);

    state = {
      ...state,
      board: {
        ...state.board,
        vertices: {
          ...state.board.vertices,
          [settlementVertexId]: { ...state.board.vertices[settlementVertexId], building: { playerId: 'p0', type: 'SETTLEMENT' } },
          [cityVertexId]: { ...state.board.vertices[cityVertexId], building: { playerId: 'p1', type: 'CITY' } },
        },
      },
    };
    return { state, goldNumber };
  }

  it('grants a pending pick of 1 for a settlement and 2 for a city, blocking other actions until resolved', () => {
    const { state, goldNumber } = stateWithGoldOwed(5);
    let withState = applyAction(state, { type: 'ROLL_DICE', playerId: 'p0', dice: diceFor(goldNumber) });
    expect(withState.turn!.pendingGoldPick).toEqual({ p0: 1, p1: 2 });

    expect(validateAction(withState, { type: 'END_TURN', playerId: 'p0' }).ok).toBe(false);
    const anyEdgeId = Object.keys(withState.board.edges)[0];
    expect(validateAction(withState, { type: 'BUILD_ROAD', playerId: 'p0', edgeId: anyEdgeId }).ok).toBe(false);

    withState = applyAction(withState, { type: 'SELECT_GOLD_RESOURCES', playerId: 'p0', resources: { ORE: 1 } });
    expect(withState.turn!.pendingGoldPick).toEqual({ p1: 2 });
    expect(withState.players.find((p) => p.id === 'p0')!.resources.ORE).toBe(1);

    withState = applyAction(withState, { type: 'SELECT_GOLD_RESOURCES', playerId: 'p1', resources: { GRAIN: 1, LUMBER: 1 } });
    expect(withState.turn!.pendingGoldPick).toBeNull();
    const p1 = withState.players.find((p) => p.id === 'p1')!;
    expect(p1.resources.GRAIN).toBe(1);
    expect(p1.resources.LUMBER).toBe(1);
  });

  it('rejects a pick that does not total the owed amount', () => {
    const { state, goldNumber } = stateWithGoldOwed(6);
    const withState = applyAction(state, { type: 'ROLL_DICE', playerId: 'p0', dice: diceFor(goldNumber) });
    expect(validateAction(withState, { type: 'SELECT_GOLD_RESOURCES', playerId: 'p0', resources: { ORE: 2 } }).ok).toBe(false);
  });

  it('rejects picking a resource the bank has run out of (bank-scarcity)', () => {
    const { state, goldNumber } = stateWithGoldOwed(8);
    let withState = applyAction(state, { type: 'ROLL_DICE', playerId: 'p0', dice: diceFor(goldNumber) });
    withState = { ...withState, bank: { ...withState.bank, resources: { ...withState.bank.resources, ORE: 0 } } };
    expect(validateAction(withState, { type: 'SELECT_GOLD_RESOURCES', playerId: 'p0', resources: { ORE: 1 } }).ok).toBe(false);
    expect(validateAction(withState, { type: 'SELECT_GOLD_RESOURCES', playerId: 'p0', resources: { GRAIN: 1 } }).ok).toBe(true);
  });

  it('rejects a negative amount smuggled in to net more than owed', () => {
    // ORE:5 + LUMBER:-4 still totals the 1 owed, and neither key individually exceeds the bank's
    // supply on its own -- without an explicit non-negative check this would hand the player 5
    // free ORE off a pick that's only supposed to grant 1.
    const { state, goldNumber } = stateWithGoldOwed(9);
    const withState = applyAction(state, { type: 'ROLL_DICE', playerId: 'p0', dice: diceFor(goldNumber) });
    const result = validateAction(withState, {
      type: 'SELECT_GOLD_RESOURCES',
      playerId: 'p0',
      resources: { ORE: 5, LUMBER: -4 },
    });
    expect(result.ok).toBe(false);
  });
});

describe('moving ships', () => {
  /** Builds a p0 chain of settlement -> ship(eAnchor) -> junction -> ship(eLoose) -> open water,
   * with a third sea edge (eDestination) off the same junction as a legal move target. */
  function stateWithShipChain(seed: number) {
    const state = makeSeafarersPlayingState(seed);
    const junction = findSeaJunction(state);
    const [eAnchorId, eLooseId, eDestinationId] = junction.edgeIds;
    const eAnchor = state.board.edges[eAnchorId];
    const eLoose = state.board.edges[eLooseId];
    const anchorVertexId = otherVertex(eAnchor, junction.center);

    const withState: GameState = {
      ...state,
      turn: { ...state.turn!, hasRolled: true },
      board: {
        ...state.board,
        vertices: {
          ...state.board.vertices,
          [anchorVertexId]: { ...state.board.vertices[anchorVertexId], building: { playerId: 'p0', type: 'SETTLEMENT' } },
        },
        edges: {
          ...state.board.edges,
          [eAnchorId]: { ...eAnchor, ship: { playerId: 'p0' } },
          [eLooseId]: { ...eLoose, ship: { playerId: 'p0' } },
        },
      },
    };
    return { state: withState, eAnchorId, eLooseId, eDestinationId };
  }

  it('rejects moving a ship that anchors a settlement, and moves the loose end of the route', () => {
    const { state, eAnchorId, eLooseId, eDestinationId } = stateWithShipChain(21);

    expect(validateAction(state, { type: 'MOVE_SHIP', playerId: 'p0', fromEdgeId: eAnchorId, toEdgeId: eDestinationId }).ok).toBe(false);
    expect(validateAction(state, { type: 'MOVE_SHIP', playerId: 'p0', fromEdgeId: eLooseId, toEdgeId: eDestinationId }).ok).toBe(true);

    const result = applyAction(state, { type: 'MOVE_SHIP', playerId: 'p0', fromEdgeId: eLooseId, toEdgeId: eDestinationId });
    expect(result.board.edges[eLooseId].ship).toBeNull();
    expect(result.board.edges[eDestinationId].ship?.playerId).toBe('p0');
    expect(result.board.edges[eAnchorId].ship?.playerId).toBe('p0'); // untouched
    expect(result.turn!.shipMovedThisTurn.p0).toBe(true);
  });

  it('allows only one ship move per turn', () => {
    const { state, eLooseId, eDestinationId } = stateWithShipChain(22);
    let result = applyAction(state, { type: 'MOVE_SHIP', playerId: 'p0', fromEdgeId: eLooseId, toEdgeId: eDestinationId });
    expect(validateAction(result, { type: 'MOVE_SHIP', playerId: 'p0', fromEdgeId: eDestinationId, toEdgeId: eLooseId }).ok).toBe(false);

    result = applyAction(result, { type: 'END_TURN', playerId: 'p0' });
    // moving is a per-turn allowance, not exhausted once and for all
    expect(result.turn!.shipMovedThisTurn.p0).toBeFalsy();
  });

  it('does not let one player moving a ship consume a different player\'s own allowance', () => {
    // Regression: shipMovedThisTurn used to be a single flag shared by the whole TurnState, but
    // the special building phase runs several players' build slots through that same TurnState
    // in turn -- p0 using their allowance must not lock p1 out of their own slot right after.
    const { state, eLooseId, eDestinationId } = stateWithShipChain(24);
    const result = applyAction(state, { type: 'MOVE_SHIP', playerId: 'p0', fromEdgeId: eLooseId, toEdgeId: eDestinationId });

    expect(result.turn!.shipMovedThisTurn.p0).toBe(true);
    expect(result.turn!.shipMovedThisTurn.p1).toBeFalsy();

    // p1 doesn't own a ship at this edge, so this is still invalid overall -- the point is *why*:
    // it must not be rejected for "only one ship per turn", which is the exact bug this guards against.
    const p1Attempt = validateAction(result, { type: 'MOVE_SHIP', playerId: 'p1', fromEdgeId: eDestinationId, toEdgeId: eLooseId });
    expect(p1Attempt.ok).toBe(false);
    expect(p1Attempt.error).not.toMatch(/only one ship/);
  });

  it('rejects a ship move made without having rolled', () => {
    const { state, eLooseId, eDestinationId } = stateWithShipChain(23);
    const notRolled: GameState = { ...state, turn: { ...state.turn!, hasRolled: false } };
    expect(validateAction(notRolled, { type: 'MOVE_SHIP', playerId: 'p0', fromEdgeId: eLooseId, toEdgeId: eDestinationId }).ok).toBe(false);
  });
});
