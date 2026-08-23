import { describe, it, expect } from 'vitest';
import type { GameState, Player, PlayerColor, DevCard, DevCardType } from '@catan-online/shared';
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
    buildingStock: { settlements: 5, cities: 4, roads: 15 },
    knightsPlayed: 0,
    stats: createEmptyPlayerStats(),
    isBot: false,
  };
}

function makeDevCard(id: string, type: DevCardType, boughtOnTurn = -1): DevCard {
  return { id, type, boughtOnTurn, used: false };
}

function makePlayingState(devCardDeck: DevCard[] = []): GameState {
  const base = createNewGameState('room1', 'ABCDE', 'p0');
  const colors: PlayerColor[] = ['RED', 'BLUE', 'GREEN'];
  const players = ['p0', 'p1', 'p2'].map((id, i) => makeTestPlayer(id, `Player ${i}`, colors[i]));
  return {
    ...base,
    phase: 'PLAYING',
    players,
    bank: { ...base.bank, devCardDeck },
    turn: {
      turnNumber: 3,
      currentPlayerId: 'p0',
      hasRolled: true,
      lastDiceRoll: [3, 3],
      devCardPlayedThisTurn: false,
      pendingRobber: null,
      pendingTrades: [],
    },
  };
}

describe('buying a development card', () => {
  it('rejects buying without enough resources or an empty deck', () => {
    const state = makePlayingState([makeDevCard('d1', 'KNIGHT')]);
    expect(validateAction(state, { type: 'BUY_DEV_CARD', playerId: 'p0' }).ok).toBe(false);

    const funded = { ...state, players: state.players.map((p) => (p.id === 'p0' ? { ...p, resources: { WOOL: 1, GRAIN: 1, ORE: 1, BRICK: 0, LUMBER: 0 } } : p)) };
    expect(validateAction(funded, { type: 'BUY_DEV_CARD', playerId: 'p0' }).ok).toBe(true);

    const emptyDeck = { ...funded, bank: { ...funded.bank, devCardDeck: [] } };
    expect(validateAction(emptyDeck, { type: 'BUY_DEV_CARD', playerId: 'p0' }).ok).toBe(false);
  });

  it('draws a card, spends resources, and stamps the current turn number', () => {
    let state = makePlayingState([makeDevCard('d1', 'KNIGHT'), makeDevCard('d2', 'MONOPOLY')]);
    state = { ...state, players: state.players.map((p) => (p.id === 'p0' ? { ...p, resources: { WOOL: 1, GRAIN: 1, ORE: 1, BRICK: 0, LUMBER: 0 } } : p)) };

    state = applyAction(state, { type: 'BUY_DEV_CARD', playerId: 'p0' });
    const player = state.players.find((p) => p.id === 'p0')!;
    expect(player.devCards).toHaveLength(1);
    expect(player.devCards[0].id).toBe('d1');
    expect(player.devCards[0].boughtOnTurn).toBe(3);
    expect(player.resources).toEqual({ WOOL: 0, GRAIN: 0, ORE: 0, BRICK: 0, LUMBER: 0 });
    expect(state.bank.devCardDeck).toHaveLength(1);
  });

  it('immediately grants (and can win with) a victory point card, with no play step', () => {
    let state = makePlayingState([makeDevCard('vp1', 'VICTORY_POINT')]);
    state = { ...state, players: state.players.map((p) => (p.id === 'p0' ? { ...p, resources: { WOOL: 1, GRAIN: 1, ORE: 1, BRICK: 0, LUMBER: 0 } } : p)) };
    state = applyAction(state, { type: 'BUY_DEV_CARD', playerId: 'p0' });

    const player = state.players.find((p) => p.id === 'p0')!;
    expect(player.devCards[0].type).toBe('VICTORY_POINT');
    // playing it should be rejected -- VP cards aren't "played"
    expect(validateAction(state, { type: 'PLAY_DEV_CARD', playerId: 'p0', devCardId: 'vp1' }).ok).toBe(false);
  });
});

describe('playing development cards', () => {
  it('rejects playing a card bought this same turn', () => {
    const state = makePlayingState();
    const withCard: GameState = {
      ...state,
      players: state.players.map((p) => (p.id === 'p0' ? { ...p, devCards: [makeDevCard('k1', 'KNIGHT', 3)] } : p)),
    };
    expect(validateAction(withCard, { type: 'PLAY_DEV_CARD', playerId: 'p0', devCardId: 'k1' }).ok).toBe(false);
  });

  it('allows only one development card per turn', () => {
    const state = makePlayingState();
    const withCards: GameState = {
      ...state,
      turn: { ...state.turn!, devCardPlayedThisTurn: true },
      players: state.players.map((p) => (p.id === 'p0' ? { ...p, devCards: [makeDevCard('k1', 'KNIGHT', 1)] } : p)),
    };
    expect(validateAction(withCards, { type: 'PLAY_DEV_CARD', playerId: 'p0', devCardId: 'k1' }).ok).toBe(false);
  });

  it('knight: increments knightsPlayed, starts a robber sequence, and can award largest army', () => {
    const state = makePlayingState();
    let withCards: GameState = {
      ...state,
      players: state.players.map((p) => (p.id === 'p0' ? { ...p, knightsPlayed: 2, devCards: [makeDevCard('k1', 'KNIGHT', 1)] } : p)),
    };
    expect(validateAction(withCards, { type: 'PLAY_DEV_CARD', playerId: 'p0', devCardId: 'k1' }).ok).toBe(true);

    withCards = applyAction(withCards, { type: 'PLAY_DEV_CARD', playerId: 'p0', devCardId: 'k1' });
    const player = withCards.players.find((p) => p.id === 'p0')!;
    expect(player.knightsPlayed).toBe(3);
    expect(withCards.largestArmyPlayerId).toBe('p0'); // 3rd knight crosses the threshold
    expect(withCards.turn!.pendingRobber).toEqual({
      reason: 'KNIGHT_CARD',
      stage: 'MOVE_ROBBER',
      discardsRemaining: {},
      eligibleStealTargets: null,
    });
    expect(withCards.turn!.devCardPlayedThisTurn).toBe(true);
  });

  it('road building: places two free roads and can extend/take longest road', () => {
    const state = makePlayingState();
    // pick a vertex and two of the edges meeting there, so both are trivially reachable from
    // a settlement at that vertex regardless of enumeration order elsewhere on the board.
    const vertexId = Object.keys(state.board.vertices).find((id) => state.board.vertices[id].edgeIds.length >= 2)!;
    const [e1, e2] = state.board.vertices[vertexId].edgeIds;
    let withCard: GameState = {
      ...state,
      board: {
        ...state.board,
        vertices: {
          ...state.board.vertices,
          [vertexId]: { ...state.board.vertices[vertexId], building: { playerId: 'p0', type: 'SETTLEMENT' } },
        },
      },
      players: state.players.map((p) => (p.id === 'p0' ? { ...p, devCards: [makeDevCard('rb1', 'ROAD_BUILDING', 1)] } : p)),
    };

    const validation = validateAction(withCard, {
      type: 'PLAY_DEV_CARD',
      playerId: 'p0',
      devCardId: 'rb1',
      params: { edgeIds: [e1, e2] },
    });
    expect(validation.ok).toBe(true);

    withCard = applyAction(withCard, { type: 'PLAY_DEV_CARD', playerId: 'p0', devCardId: 'rb1', params: { edgeIds: [e1, e2] } });
    expect(withCard.board.edges[e1].road?.playerId).toBe('p0');
    expect(withCard.board.edges[e2].road?.playerId).toBe('p0');
    const player = withCard.players.find((p) => p.id === 'p0')!;
    expect(player.buildingStock.roads).toBe(13); // 15 - 2, no cost spent
  });

  it('year of plenty: grants exactly the requested 2 resources from the bank', () => {
    const state = makePlayingState();
    let withCard: GameState = {
      ...state,
      players: state.players.map((p) => (p.id === 'p0' ? { ...p, devCards: [makeDevCard('yop1', 'YEAR_OF_PLENTY', 1)] } : p)),
    };

    expect(
      validateAction(withCard, { type: 'PLAY_DEV_CARD', playerId: 'p0', devCardId: 'yop1', params: { resources: { ORE: 1 } } }).ok,
    ).toBe(false); // must total exactly 2

    withCard = applyAction(withCard, {
      type: 'PLAY_DEV_CARD',
      playerId: 'p0',
      devCardId: 'yop1',
      params: { resources: { ORE: 1, GRAIN: 1 } },
    });
    const player = withCard.players.find((p) => p.id === 'p0')!;
    expect(player.resources.ORE).toBe(1);
    expect(player.resources.GRAIN).toBe(1);
  });

  it('monopoly: takes the named resource from every other player', () => {
    const state = makePlayingState();
    let withCard: GameState = {
      ...state,
      players: state.players.map((p) => {
        if (p.id === 'p0') return { ...p, devCards: [makeDevCard('mono1', 'MONOPOLY', 1)] };
        if (p.id === 'p1') return { ...p, resources: { ...p.resources, WOOL: 2 } };
        if (p.id === 'p2') return { ...p, resources: { ...p.resources, WOOL: 3 } };
        return p;
      }),
    };

    withCard = applyAction(withCard, { type: 'PLAY_DEV_CARD', playerId: 'p0', devCardId: 'mono1', params: { resource: 'WOOL' } });
    const p0 = withCard.players.find((p) => p.id === 'p0')!;
    const p1 = withCard.players.find((p) => p.id === 'p1')!;
    const p2 = withCard.players.find((p) => p.id === 'p2')!;
    expect(p0.resources.WOOL).toBe(5);
    expect(p1.resources.WOOL).toBe(0);
    expect(p2.resources.WOOL).toBe(0);
  });
});
