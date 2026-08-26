import type { Board, ResourceType, HexId, VertexId, EdgeId, BoardMode } from './board.js';

export type PlayerColor = 'RED' | 'BLUE' | 'GREEN' | 'YELLOW' | 'ORANGE' | 'PURPLE';

export type ResourceHand = Record<ResourceType, number>;

export type DevCardType = 'KNIGHT' | 'ROAD_BUILDING' | 'YEAR_OF_PLENTY' | 'MONOPOLY' | 'VICTORY_POINT';

export const DEV_CARD_LABELS_JA: Record<DevCardType, string> = {
  KNIGHT: '騎士',
  ROAD_BUILDING: '街道建設',
  YEAR_OF_PLENTY: '発明',
  MONOPOLY: '独占',
  VICTORY_POINT: '勝利点',
};

export interface DevCard {
  id: string;
  type: DevCardType;
  boughtOnTurn: number;
  used: boolean;
}

export interface PlayerStats {
  settlementsBuilt: number;
  citiesBuilt: number;
  roadsBuilt: number;
  resourcesGained: ResourceHand;
  devCardsBought: number;
  devCardsUsed: Record<DevCardType, number>;
}

export function createEmptyPlayerStats(): PlayerStats {
  return {
    settlementsBuilt: 0,
    citiesBuilt: 0,
    roadsBuilt: 0,
    resourcesGained: createEmptyHand(),
    devCardsBought: 0,
    devCardsUsed: { KNIGHT: 0, ROAD_BUILDING: 0, YEAR_OF_PLENTY: 0, MONOPOLY: 0, VICTORY_POINT: 0 },
  };
}

export interface Player {
  id: string;
  name: string;
  color: PlayerColor;
  connected: boolean;
  sessionToken: string;
  resources: ResourceHand;
  devCards: DevCard[];
  buildingStock: { settlements: number; cities: number; roads: number; ships: number };
  knightsPlayed: number;
  stats: PlayerStats;
  isBot: boolean;
}

export interface SetupState {
  order: string[];
  step: number;
  round: 1 | 2;
  awaitingRoadForVertexId: VertexId | null;
}

export interface PendingRobberState {
  reason: 'DICE_SEVEN' | 'KNIGHT_CARD';
  stage: 'DISCARD' | 'MOVE_ROBBER' | 'SELECT_TARGET';
  discardsRemaining: Record<string, number>;
  eligibleStealTargets: string[] | null;
}

export interface TradeOffer {
  id: string;
  proposerId: string;
  targetId: string | null;
  give: Partial<ResourceHand>;
  request: Partial<ResourceHand>;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
  /** Players who have signaled willingness to accept -- the resource swap doesn't happen until
   * the proposer picks one of these via FINALIZE_TRADE (the proposer always has final say). */
  acceptedBy: string[];
}

/**
 * The optional "special building phase" (5-6 player extension rule, offered here regardless of
 * player count): after a player ends their turn, every other player gets one build slot in turn
 * order before the real next turn begins. `currentPlayerId` stays frozen on whoever just ended
 * their turn while this is active.
 */
export interface SpecialBuildState {
  /** Player ids still waiting for their slot, in turn order (does not include activePlayerId). */
  queue: string[];
  /** Whose special-build slot is active right now. */
  activePlayerId: string;
  /** Who becomes the real current player once the queue and active slot are both exhausted --
   * the same player who would have gone next if the phase were disabled. */
  nextPlayerId: string;
}

export interface TurnState {
  turnNumber: number;
  currentPlayerId: string;
  hasRolled: boolean;
  lastDiceRoll: [number, number] | null;
  devCardPlayedThisTurn: boolean;
  pendingRobber: PendingRobberState | null;
  pendingTrades: TradeOffer[];
  specialBuild: SpecialBuildState | null;
  /** Gold hex (Seafarers): playerId -> number of free resource picks still owed after this roll. */
  pendingGoldPick: Record<string, number> | null;
  /** Seafarers: at most one ship may be relocated per turn -- keyed per player (not a single
   * shared flag) because the special building phase runs several players' build slots through
   * this same TurnState in turn, and each player's slot needs its own independent allowance. */
  shipMovedThisTurn: Record<string, boolean>;
}

export type GamePhase = 'LOBBY' | 'SETUP' | 'PLAYING' | 'GAME_OVER';

export interface GameLogEntry {
  id: string;
  timestamp: number;
  message: string;
}

export interface Bank {
  resources: ResourceHand;
  devCardDeck: DevCard[];
}

export interface GameState {
  roomId: string;
  roomCode: string;
  hostPlayerId: string;
  phase: GamePhase;
  boardMode: BoardMode;
  specialBuildingPhaseEnabled: boolean;
  friendlyRobberEnabled: boolean;
  seafarersEnabled: boolean;
  board: Board;
  bank: Bank;
  players: Player[];
  setup: SetupState | null;
  turn: TurnState | null;
  longestRoadPlayerId: string | null;
  largestArmyPlayerId: string | null;
  winnerId: string | null;
  log: GameLogEntry[];
  updatedAt: number;
}

export interface PublicPlayerView {
  id: string;
  name: string;
  color: PlayerColor;
  connected: boolean;
  resourceCount: number;
  devCardCount: number;
  revealedDevCards: DevCardType[];
  visibleVictoryPoints: number;
  buildingStock: Player['buildingStock'];
  knightsPlayed: number;
  hasLongestRoad: boolean;
  hasLargestArmy: boolean;
  stats: PlayerStats;
  isBot: boolean;
}

export interface PrivatePlayerView extends PublicPlayerView {
  resources: ResourceHand;
  devCards: DevCard[];
  /** visibleVictoryPoints plus hidden VP dev cards -- only ever sent for the viewer's own player. */
  totalVictoryPoints: number;
}

export interface ScoreBreakdown {
  settlements: number;
  cities: number;
  hasLongestRoad: boolean;
  hasLargestArmy: boolean;
  victoryPointCards: number;
  total: number;
}

export interface ClientBank {
  resourceCounts: ResourceHand;
  devCardCount: number;
}

export interface ClientGameState {
  roomId: string;
  roomCode: string;
  hostPlayerId: string;
  phase: GamePhase;
  friendlyRobberEnabled: boolean;
  seafarersEnabled: boolean;
  board: Board;
  bank: ClientBank;
  players: PublicPlayerView[];
  me: PrivatePlayerView;
  setup: SetupState | null;
  turn: TurnState | null;
  longestRoadPlayerId: string | null;
  largestArmyPlayerId: string | null;
  winnerId: string | null;
  log: GameLogEntry[];
  updatedAt: number;
}

export const EMPTY_RESOURCE_HAND: ResourceHand = {
  BRICK: 0,
  LUMBER: 0,
  WOOL: 0,
  GRAIN: 0,
  ORE: 0,
};

export function createEmptyHand(): ResourceHand {
  return { ...EMPTY_RESOURCE_HAND };
}

export function totalResources(hand: Partial<ResourceHand>): number {
  return (hand.BRICK ?? 0) + (hand.LUMBER ?? 0) + (hand.WOOL ?? 0) + (hand.GRAIN ?? 0) + (hand.ORE ?? 0);
}

/**
 * Guards against a negative amount smuggled into a client-supplied resource payload. Every one of
 * these payloads (discard, gold pick, year of plenty, bank/player trades) is applied directly to a
 * hand and the bank without re-deriving the amounts server-side, so a negative entry would let the
 * sender fabricate resources (or drain someone else's hand) in a way totalResources()/canAfford()
 * alone don't catch -- a negative "cost" reads as trivially affordable, and nets a gain once applied.
 */
export function hasOnlyNonNegativeAmounts(hand: Partial<ResourceHand>): boolean {
  return (Object.values(hand) as (number | undefined)[]).every((v) => (v ?? 0) >= 0);
}

// re-export board hex/vertex/edge id types for convenience
export type { HexId, VertexId, EdgeId };
