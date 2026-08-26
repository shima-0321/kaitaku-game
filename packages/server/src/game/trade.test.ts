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
}

describe('bank trade', () => {
  it('rejects a trade the player cannot afford, accepts a valid 4:1 trade', () => {
    let state = makePlayingState();
    const badTrade = validateAction(state, { type: 'BANK_TRADE', playerId: 'p0', give: { BRICK: 4 }, receive: { ORE: 1 } });
    expect(badTrade.ok).toBe(false);

    state = {
      ...state,
      players: state.players.map((p) => (p.id === 'p0' ? { ...p, resources: { ...p.resources, BRICK: 4 } } : p)),
    };
    const goodTrade = validateAction(state, { type: 'BANK_TRADE', playerId: 'p0', give: { BRICK: 4 }, receive: { ORE: 1 } });
    expect(goodTrade.ok).toBe(true);

    state = applyAction(state, { type: 'BANK_TRADE', playerId: 'p0', give: { BRICK: 4 }, receive: { ORE: 1 } });
    const player = state.players.find((p) => p.id === 'p0')!;
    expect(player.resources.BRICK).toBe(0);
    expect(player.resources.ORE).toBe(1);
    expect(state.bank.resources.BRICK).toBeGreaterThan(19); // returned to the bank
  });

  it('rejects a ratio the player has not earned via ports', () => {
    const state = makePlayingState();
    // even with resources, a 2:1 ask without owning the matching port must fail
    const withResources = {
      ...state,
      players: state.players.map((p) => (p.id === 'p0' ? { ...p, resources: { ...p.resources, BRICK: 2 } } : p)),
    };
    const result = validateAction(withResources, { type: 'BANK_TRADE', playerId: 'p0', give: { BRICK: 2 }, receive: { ORE: 1 } });
    expect(result.ok).toBe(false);
  });

  it('rejects a negative amount smuggled alongside a legitimate-looking single trade', () => {
    // give's single *positive* entry (BRICK: 4) alone reads as a valid 4:1 trade, but the
    // reducer applies every key in the payload -- a negative LUMBER here would otherwise let
    // the sender gain resources for free instead of spending them.
    let state = makePlayingState();
    state = {
      ...state,
      players: state.players.map((p) => (p.id === 'p0' ? { ...p, resources: { ...p.resources, BRICK: 4 } } : p)),
    };
    const smuggledInGive = validateAction(state, {
      type: 'BANK_TRADE',
      playerId: 'p0',
      give: { BRICK: 4, LUMBER: -100 },
      receive: { ORE: 1 },
    });
    expect(smuggledInGive.ok).toBe(false);

    const smuggledInReceive = validateAction(state, {
      type: 'BANK_TRADE',
      playerId: 'p0',
      give: { BRICK: 4 },
      receive: { ORE: 1, WOOL: -100 },
    });
    expect(smuggledInReceive.ok).toBe(false);
  });
});

describe('player-to-player trade', () => {
  it('only the current turn player may propose a trade', () => {
    const state = makePlayingState();
    const result = validateAction(state, {
      type: 'PROPOSE_TRADE',
      playerId: 'p1',
      tradeId: 't1',
      give: { WOOL: 1 },
      request: { GRAIN: 1 },
      targetPlayerId: null,
    });
    expect(result.ok).toBe(false);
  });

  it('settles a targeted (1:1) trade immediately on accept -- only one player could ever accept it, so there is nothing for the proposer to choose between', () => {
    let state = makePlayingState();
    state = {
      ...state,
      players: state.players.map((p) => {
        if (p.id === 'p0') return { ...p, resources: { ...p.resources, WOOL: 1 } };
        if (p.id === 'p1') return { ...p, resources: { ...p.resources, GRAIN: 1 } };
        return p;
      }),
    };

    const proposeValidation = validateAction(state, {
      type: 'PROPOSE_TRADE',
      playerId: 'p0',
      tradeId: 't1',
      give: { WOOL: 1 },
      request: { GRAIN: 1 },
      targetPlayerId: 'p1',
    });
    expect(proposeValidation.ok).toBe(true);

    state = applyAction(state, {
      type: 'PROPOSE_TRADE',
      playerId: 'p0',
      tradeId: 't1',
      give: { WOOL: 1 },
      request: { GRAIN: 1 },
      targetPlayerId: 'p1',
    });
    expect(state.turn!.pendingTrades).toHaveLength(1);

    const respondValidation = validateAction(state, { type: 'RESPOND_TRADE', playerId: 'p1', tradeId: 't1', accept: true });
    expect(respondValidation.ok).toBe(true);

    state = applyAction(state, { type: 'RESPOND_TRADE', playerId: 'p1', tradeId: 't1', accept: true });

    const p0 = state.players.find((p) => p.id === 'p0')!;
    const p1 = state.players.find((p) => p.id === 'p1')!;
    expect(p0.resources.WOOL).toBe(0);
    expect(p0.resources.GRAIN).toBe(1);
    expect(p1.resources.GRAIN).toBe(0);
    expect(p1.resources.WOOL).toBe(1);
    expect(state.turn!.pendingTrades).toHaveLength(0);
  });

  it('holds an open trade for the proposer to finalize, even with only one accepter so far', () => {
    let state = makePlayingState();
    state = {
      ...state,
      players: state.players.map((p) => {
        if (p.id === 'p0') return { ...p, resources: { ...p.resources, WOOL: 1 } };
        if (p.id === 'p1') return { ...p, resources: { ...p.resources, GRAIN: 1 } };
        return p;
      }),
    };
    state = applyAction(state, {
      type: 'PROPOSE_TRADE',
      playerId: 'p0',
      tradeId: 't1',
      give: { WOOL: 1 },
      request: { GRAIN: 1 },
      targetPlayerId: null,
    });
    state = applyAction(state, { type: 'RESPOND_TRADE', playerId: 'p1', tradeId: 't1', accept: true });

    // Accepting only records intent -- no resources move and the offer is still pending finalization,
    // since an open offer could still draw a second accepter at any moment.
    let p0 = state.players.find((p) => p.id === 'p0')!;
    let p1 = state.players.find((p) => p.id === 'p1')!;
    expect(p0.resources.WOOL).toBe(1);
    expect(p1.resources.GRAIN).toBe(1);
    expect(state.turn!.pendingTrades).toHaveLength(1);
    expect(state.turn!.pendingTrades[0].acceptedBy).toEqual(['p1']);

    const finalizeValidation = validateAction(state, { type: 'FINALIZE_TRADE', playerId: 'p0', tradeId: 't1', withPlayerId: 'p1' });
    expect(finalizeValidation.ok).toBe(true);

    state = applyAction(state, { type: 'FINALIZE_TRADE', playerId: 'p0', tradeId: 't1', withPlayerId: 'p1' });

    p0 = state.players.find((p) => p.id === 'p0')!;
    p1 = state.players.find((p) => p.id === 'p1')!;
    expect(p0.resources.WOOL).toBe(0);
    expect(p0.resources.GRAIN).toBe(1);
    expect(p1.resources.GRAIN).toBe(0);
    expect(p1.resources.WOOL).toBe(1);
    expect(state.turn!.pendingTrades).toHaveLength(0);
  });

  it('lets the proposer choose among multiple accepters on an open trade; the others are discarded', () => {
    let state = makePlayingState();
    state = {
      ...state,
      players: state.players.map((p) => {
        if (p.id === 'p1') return { ...p, resources: { ...p.resources, GRAIN: 1 } };
        if (p.id === 'p2') return { ...p, resources: { ...p.resources, GRAIN: 1 } };
        return p;
      }),
    };
    state = applyAction(state, {
      type: 'PROPOSE_TRADE',
      playerId: 'p0',
      tradeId: 't1',
      give: { WOOL: 1 },
      request: { GRAIN: 1 },
      targetPlayerId: null,
    });
    state = applyAction(state, { type: 'RESPOND_TRADE', playerId: 'p1', tradeId: 't1', accept: true });
    state = applyAction(state, { type: 'RESPOND_TRADE', playerId: 'p2', tradeId: 't1', accept: true });
    expect(state.turn!.pendingTrades[0].acceptedBy).toEqual(['p1', 'p2']);

    // Finalizing with p2 must not require p1's resources at all -- p1 was never touched.
    state = applyAction(state, { type: 'FINALIZE_TRADE', playerId: 'p0', tradeId: 't1', withPlayerId: 'p2' });

    const p1 = state.players.find((p) => p.id === 'p1')!;
    const p2 = state.players.find((p) => p.id === 'p2')!;
    expect(p1.resources.GRAIN).toBe(1); // untouched
    expect(p2.resources.GRAIN).toBe(0);
    expect(p2.resources.WOOL).toBe(1);
    expect(state.turn!.pendingTrades).toHaveLength(0);
  });

  it('only the proposer may finalize, and only with a player who actually accepted', () => {
    let state = makePlayingState();
    state = applyAction(state, {
      type: 'PROPOSE_TRADE',
      playerId: 'p0',
      tradeId: 't1',
      give: { WOOL: 1 },
      request: { GRAIN: 1 },
      targetPlayerId: null,
    });
    state = applyAction(state, { type: 'RESPOND_TRADE', playerId: 'p1', tradeId: 't1', accept: true });

    const notProposer = validateAction(state, { type: 'FINALIZE_TRADE', playerId: 'p1', tradeId: 't1', withPlayerId: 'p1' });
    expect(notProposer.ok).toBe(false);

    const neverAccepted = validateAction(state, { type: 'FINALIZE_TRADE', playerId: 'p0', tradeId: 't1', withPlayerId: 'p2' });
    expect(neverAccepted.ok).toBe(false);
  });

  it('rejects accepting when the responder cannot afford the requested side', () => {
    let state = makePlayingState();
    state = {
      ...state,
      players: state.players.map((p) => (p.id === 'p0' ? { ...p, resources: { ...p.resources, WOOL: 1 } } : p)),
    };
    state = applyAction(state, {
      type: 'PROPOSE_TRADE',
      playerId: 'p0',
      tradeId: 't1',
      give: { WOOL: 1 },
      request: { GRAIN: 1 },
      targetPlayerId: 'p1',
    });

    const result = validateAction(state, { type: 'RESPOND_TRADE', playerId: 'p1', tradeId: 't1', accept: true });
    expect(result.ok).toBe(false);
  });

  it('lets the proposer cancel a pending trade', () => {
    let state = makePlayingState();
    state = applyAction(state, {
      type: 'PROPOSE_TRADE',
      playerId: 'p0',
      tradeId: 't1',
      give: { WOOL: 1 },
      request: { GRAIN: 1 },
      targetPlayerId: null,
    });
    expect(state.turn!.pendingTrades).toHaveLength(1);

    state = applyAction(state, { type: 'CANCEL_TRADE', playerId: 'p0', tradeId: 't1' });
    expect(state.turn!.pendingTrades).toHaveLength(0);
  });

  it('rejects a negative amount smuggled into a proposed trade', () => {
    // a negative entry on either side would otherwise drain the *other* player's hand (or pad
    // the proposer's) beyond what either side actually agreed to once the trade settles.
    let state = makePlayingState();
    state = {
      ...state,
      players: state.players.map((p) => (p.id === 'p0' ? { ...p, resources: { ...p.resources, WOOL: 1 } } : p)),
    };
    const smuggledInGive = validateAction(state, {
      type: 'PROPOSE_TRADE',
      playerId: 'p0',
      tradeId: 't1',
      give: { WOOL: 1, ORE: -50 },
      request: { GRAIN: 1 },
      targetPlayerId: null,
    });
    expect(smuggledInGive.ok).toBe(false);

    const smuggledInRequest = validateAction(state, {
      type: 'PROPOSE_TRADE',
      playerId: 'p0',
      tradeId: 't1',
      give: { WOOL: 1 },
      request: { GRAIN: 1, BRICK: -50 },
      targetPlayerId: null,
    });
    expect(smuggledInRequest.ok).toBe(false);
  });

  it('clears all pending trades when the turn ends', () => {
    let state = makePlayingState();
    state = applyAction(state, {
      type: 'PROPOSE_TRADE',
      playerId: 'p0',
      tradeId: 't1',
      give: { WOOL: 1 },
      request: { GRAIN: 1 },
      targetPlayerId: null,
    });
    expect(state.turn!.pendingTrades).toHaveLength(1);

    state = applyAction(state, { type: 'END_TURN', playerId: 'p0' });
    expect(state.turn!.pendingTrades).toHaveLength(0);
  });
});
