import type { ResourceHand, ResourceType } from '@catan-online/shared';

export interface PlayDevCardParams {
  resources?: Partial<ResourceHand>; // YEAR_OF_PLENTY
  resource?: ResourceType; // MONOPOLY
  edgeIds?: [string, string]; // ROAD_BUILDING
}

export type GameAction =
  | { type: 'START_GAME'; playerId: string }
  | { type: 'REMATCH'; playerId: string }
  | { type: 'PLACE_SETUP_SETTLEMENT'; playerId: string; vertexId: string }
  | { type: 'PLACE_SETUP_ROAD'; playerId: string; edgeId: string }
  | { type: 'ROLL_DICE'; playerId: string; dice: [number, number] }
  | { type: 'SELECT_DISCARD'; playerId: string; resources: Partial<ResourceHand> }
  | { type: 'MOVE_ROBBER'; playerId: string; hexId: string }
  | { type: 'STEAL_FROM'; playerId: string; targetPlayerId: string; stolenResource: ResourceType | null }
  | { type: 'BUILD_ROAD'; playerId: string; edgeId: string }
  | { type: 'BUILD_SETTLEMENT'; playerId: string; vertexId: string }
  | { type: 'BUILD_CITY'; playerId: string; vertexId: string }
  | { type: 'BUY_DEV_CARD'; playerId: string }
  | { type: 'PLAY_DEV_CARD'; playerId: string; devCardId: string; params?: PlayDevCardParams }
  | { type: 'BANK_TRADE'; playerId: string; give: Partial<ResourceHand>; receive: Partial<ResourceHand> }
  | {
      type: 'PROPOSE_TRADE';
      playerId: string;
      tradeId: string;
      give: Partial<ResourceHand>;
      request: Partial<ResourceHand>;
      targetPlayerId: string | null;
    }
  | { type: 'RESPOND_TRADE'; playerId: string; tradeId: string; accept: boolean }
  | { type: 'CANCEL_TRADE'; playerId: string; tradeId: string }
  | { type: 'END_TURN'; playerId: string };

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export const VALID: ValidationResult = { ok: true };
export function invalid(error: string): ValidationResult {
  return { ok: false, error };
}
