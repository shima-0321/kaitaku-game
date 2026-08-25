import {
  generateBoard,
  createEmptyHand,
  createEmptyPlayerStats,
  DEV_CARD_DECK_COMPOSITION,
  INITIAL_BUILDING_STOCK,
  BANK_STARTING_RESOURCE_COUNT,
  MIN_PLAYERS,
  MAX_PLAYERS,
  PLAYER_COLORS,
} from '@catan-online/shared';
import type { GameState, Player, DevCard, PlayerColor } from '@catan-online/shared';
import { shuffle, generateToken, rollTwoDice } from '../utils/rng.js';

export { MIN_PLAYERS, MAX_PLAYERS, PLAYER_COLORS };

export function createNewGameState(roomId: string, roomCode: string, hostPlayerId: string): GameState {
  return {
    roomId,
    roomCode,
    hostPlayerId,
    phase: 'LOBBY',
    boardMode: 'RANDOM',
    specialBuildingPhaseEnabled: false,
    board: generateBoard(),
    bank: {
      resources: {
        BRICK: BANK_STARTING_RESOURCE_COUNT,
        LUMBER: BANK_STARTING_RESOURCE_COUNT,
        WOOL: BANK_STARTING_RESOURCE_COUNT,
        GRAIN: BANK_STARTING_RESOURCE_COUNT,
        ORE: BANK_STARTING_RESOURCE_COUNT,
      },
      devCardDeck: [],
    },
    players: [],
    setup: null,
    turn: null,
    longestRoadPlayerId: null,
    largestArmyPlayerId: null,
    winnerId: null,
    log: [],
    updatedAt: Date.now(),
  };
}

export function nextAvailableColor(players: Player[]): PlayerColor | null {
  const used = new Set(players.map((p) => p.color));
  return PLAYER_COLORS.find((c) => !used.has(c)) ?? null;
}

export function createPlayer(id: string, sessionToken: string, name: string, color: PlayerColor): Player {
  return {
    id,
    name,
    color,
    connected: true,
    sessionToken,
    resources: createEmptyHand(),
    devCards: [],
    buildingStock: { ...INITIAL_BUILDING_STOCK },
    knightsPlayed: 0,
    stats: createEmptyPlayerStats(),
    isBot: false,
  };
}

const BOT_NAMES = ['CPU-太郎', 'CPU-次郎', 'CPU-三郎', 'CPU-四郎', 'CPU-五郎'];

export function createBotPlayer(id: string, name: string, color: PlayerColor): Player {
  return {
    ...createPlayer(id, generateToken(), name, color),
    isBot: true,
  };
}

export function nextBotName(players: Player[]): string {
  const used = new Set(players.filter((p) => p.isBot).map((p) => p.name));
  return BOT_NAMES.find((n) => !used.has(n)) ?? `CPU-${players.length + 1}`;
}

function buildDevCardDeck(): DevCard[] {
  const deck: DevCard[] = [];
  let counter = 0;
  for (const { type, count } of DEV_CARD_DECK_COMPOSITION) {
    for (let i = 0; i < count; i++) {
      deck.push({ id: `dev-${counter++}`, type, boughtOnTurn: -1, used: false });
    }
  }
  return shuffle(deck);
}

export interface TurnOrderRoll {
  playerId: string;
  dice: [number, number];
}

/** Each player rolls to determine turn order, highest total goes first (ties keep lobby order). */
export function rollTurnOrder(players: GameState['players']): TurnOrderRoll[] {
  return players
    .map((p) => ({ playerId: p.id, dice: rollTwoDice() }))
    .sort((a, b) => b.dice[0] + b.dice[1] - (a.dice[0] + a.dice[1]));
}

/** Regenerates the board + dev card deck and builds the snake-draft setup order (P1..Pn, Pn..P1). */
export function startGame(state: GameState, turnOrder: TurnOrderRoll[]): GameState {
  const orderedPlayers = turnOrder.map((r) => state.players.find((p) => p.id === r.playerId)!);
  const order = orderedPlayers.map((p) => p.id);
  const snakeOrder = [...order, ...[...order].reverse()];

  return {
    ...state,
    players: orderedPlayers,
    phase: 'SETUP',
    board: generateBoard({ mode: state.boardMode, playerCount: orderedPlayers.length }),
    bank: { ...state.bank, devCardDeck: buildDevCardDeck() },
    setup: {
      order: snakeOrder,
      step: 0,
      round: 1,
      awaitingRoadForVertexId: null,
    },
    updatedAt: Date.now(),
  };
}

export { generateToken };
