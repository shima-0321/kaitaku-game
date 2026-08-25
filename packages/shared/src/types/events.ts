import type { ClientGameState, ResourceHand, ScoreBreakdown } from './game.js';
import type { HexId, VertexId, EdgeId, ResourceType, BoardMode } from './board.js';

export type AckOkWith<T = unknown> = { ok: true } & T;
export interface AckErr {
  ok: false;
  error: string;
}
export type Ack<T = unknown> = AckOkWith<T> | AckErr;

// ---- Client -> Server payloads ----
export interface CreateRoomPayload {
  playerName: string;
}
export interface CreateRoomResult {
  roomId: string;
  roomCode: string;
  playerId: string;
  sessionToken: string;
}

export interface JoinRoomPayload {
  roomCode: string;
  playerName: string;
  sessionToken?: string;
}
export interface JoinRoomResult {
  roomId: string;
  roomCode: string;
  playerId: string;
  sessionToken: string;
}

export interface PlaceSetupSettlementPayload {
  vertexId: VertexId;
}
export interface PlaceSetupRoadPayload {
  edgeId: EdgeId;
}
export interface SelectDiscardPayload {
  resources: Partial<ResourceHand>;
}
export interface MoveRobberPayload {
  hexId: HexId;
}
export interface StealFromPayload {
  targetPlayerId: string;
}
export interface BuildRoadPayload {
  edgeId: EdgeId;
}
export interface BuildSettlementPayload {
  vertexId: VertexId;
}
export interface BuildCityPayload {
  vertexId: VertexId;
}
export interface PlayDevCardParams {
  resources?: Partial<ResourceHand>; // YEAR_OF_PLENTY: exactly 2 total
  resource?: keyof ResourceHand; // MONOPOLY
  edgeIds?: [EdgeId, EdgeId]; // ROAD_BUILDING
}
export interface PlayDevCardPayload {
  devCardId: string;
  params?: PlayDevCardParams;
}
export interface ProposeTradePayload {
  give: Partial<ResourceHand>;
  request: Partial<ResourceHand>;
  targetPlayerId?: string | null;
}
export interface RespondTradePayload {
  tradeId: string;
  accept: boolean;
}
export interface CancelTradePayload {
  tradeId: string;
}
export interface FinalizeTradePayload {
  tradeId: string;
  withPlayerId: string;
}
export interface BankTradePayload {
  give: Partial<ResourceHand>;
  receive: Partial<ResourceHand>;
}
export interface SetBoardModePayload {
  mode: BoardMode;
}
export interface SetSpecialBuildingPhasePayload {
  enabled: boolean;
}
export interface SetFriendlyRobberPayload {
  enabled: boolean;
}
export interface SetSeafarersPayload {
  enabled: boolean;
}
export interface BuildShipPayload {
  edgeId: EdgeId;
}
export interface MovePiratePayload {
  hexId: HexId;
}
export interface MoveShipPayload {
  fromEdgeId: EdgeId;
  toEdgeId: EdgeId;
}
export interface SelectGoldResourcesPayload {
  resources: Partial<ResourceHand>;
}

// ---- Client -> Server event map ----
export interface ClientToServerEvents {
  create_room: (payload: CreateRoomPayload, cb: (ack: Ack<CreateRoomResult>) => void) => void;
  join_room: (payload: JoinRoomPayload, cb: (ack: Ack<JoinRoomResult>) => void) => void;
  leave_room: (payload: Record<string, never>, cb: (ack: Ack) => void) => void;
  start_game: (payload: Record<string, never>, cb: (ack: Ack) => void) => void;
  rematch: (payload: Record<string, never>, cb: (ack: Ack) => void) => void;
  add_bot: (payload: Record<string, never>, cb: (ack: Ack) => void) => void;
  remove_bot: (payload: { playerId: string }, cb: (ack: Ack) => void) => void;
  set_board_mode: (payload: SetBoardModePayload, cb: (ack: Ack) => void) => void;
  set_special_building_phase: (payload: SetSpecialBuildingPhasePayload, cb: (ack: Ack) => void) => void;
  set_friendly_robber: (payload: SetFriendlyRobberPayload, cb: (ack: Ack) => void) => void;
  set_seafarers: (payload: SetSeafarersPayload, cb: (ack: Ack) => void) => void;
  place_setup_settlement: (payload: PlaceSetupSettlementPayload, cb: (ack: Ack) => void) => void;
  place_setup_road: (payload: PlaceSetupRoadPayload, cb: (ack: Ack) => void) => void;
  roll_dice: (payload: Record<string, never>, cb: (ack: Ack) => void) => void;
  select_discard: (payload: SelectDiscardPayload, cb: (ack: Ack) => void) => void;
  move_robber: (payload: MoveRobberPayload, cb: (ack: Ack) => void) => void;
  move_pirate: (payload: MovePiratePayload, cb: (ack: Ack) => void) => void;
  steal_from: (payload: StealFromPayload, cb: (ack: Ack) => void) => void;
  build_road: (payload: BuildRoadPayload, cb: (ack: Ack) => void) => void;
  build_ship: (payload: BuildShipPayload, cb: (ack: Ack) => void) => void;
  move_ship: (payload: MoveShipPayload, cb: (ack: Ack) => void) => void;
  select_gold_resources: (payload: SelectGoldResourcesPayload, cb: (ack: Ack) => void) => void;
  build_settlement: (payload: BuildSettlementPayload, cb: (ack: Ack) => void) => void;
  build_city: (payload: BuildCityPayload, cb: (ack: Ack) => void) => void;
  buy_dev_card: (payload: Record<string, never>, cb: (ack: Ack) => void) => void;
  play_dev_card: (payload: PlayDevCardPayload, cb: (ack: Ack) => void) => void;
  propose_trade: (payload: ProposeTradePayload, cb: (ack: Ack) => void) => void;
  respond_trade: (payload: RespondTradePayload, cb: (ack: Ack) => void) => void;
  cancel_trade: (payload: CancelTradePayload, cb: (ack: Ack) => void) => void;
  finalize_trade: (payload: FinalizeTradePayload, cb: (ack: Ack) => void) => void;
  bank_trade: (payload: BankTradePayload, cb: (ack: Ack) => void) => void;
  end_turn: (payload: Record<string, never>, cb: (ack: Ack) => void) => void;
  pass_special_build: (payload: Record<string, never>, cb: (ack: Ack) => void) => void;
}

// ---- Server -> Client event map ----
export interface RoomPlayerSummary {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
  isBot: boolean;
}
export interface RoomUpdatedPayload {
  roomCode: string;
  hostPlayerId: string;
  boardMode: BoardMode;
  specialBuildingPhaseEnabled: boolean;
  friendlyRobberEnabled: boolean;
  seafarersEnabled: boolean;
  players: RoomPlayerSummary[];
}
export interface DiceRolledPayload {
  playerId: string;
  dice: [number, number];
}
export interface RobbedNoticePayload {
  robberId: string;
  victimId: string;
  hexId: HexId;
}
/** Sent privately to the robber and the victim only -- the stolen resource stays hidden from everyone else. */
export interface RobbedDetailPayload {
  robberId: string;
  victimId: string;
  resource: ResourceType;
}
export interface KnightPlayedPayload {
  playerId: string;
}
export type GameSoundKind = 'BUILD' | 'LEVEL_UP';
export interface GameSoundPayload {
  kind: GameSoundKind;
  playerId: string;
}
export interface PlayerConnectionPayload {
  playerId: string;
}
export interface GameOverPayload {
  winnerId: string;
  finalScores: { playerId: string; points: number; breakdown: ScoreBreakdown }[];
}
export interface ErrorToastPayload {
  message: string;
}

export interface ServerToClientEvents {
  room_updated: (payload: RoomUpdatedPayload) => void;
  game_started: (payload: ClientGameState) => void;
  state_update: (payload: ClientGameState) => void;
  dice_rolled: (payload: DiceRolledPayload) => void;
  robbed_notice: (payload: RobbedNoticePayload) => void;
  robbed_detail: (payload: RobbedDetailPayload) => void;
  knight_played: (payload: KnightPlayedPayload) => void;
  game_sound: (payload: GameSoundPayload) => void;
  player_disconnected: (payload: PlayerConnectionPayload) => void;
  player_reconnected: (payload: PlayerConnectionPayload) => void;
  game_over: (payload: GameOverPayload) => void;
  error_toast: (payload: ErrorToastPayload) => void;
}
