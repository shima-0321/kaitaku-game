import type { Board, ResourceType } from '../types/board.js';
import type { ResourceHand } from '../types/game.js';

export type TradeRatios = Record<ResourceType, number>;

const DEFAULT_RATIO = 4;
const GENERIC_PORT_RATIO = 3;
const SPECIFIC_PORT_RATIO = 2;

/** This player's bank-trade ratio for each resource, based on which ports their settlements/cities touch. */
export function calculateTradeRatios(board: Board, playerId: string): TradeRatios {
  const ratios: TradeRatios = { BRICK: DEFAULT_RATIO, LUMBER: DEFAULT_RATIO, WOOL: DEFAULT_RATIO, GRAIN: DEFAULT_RATIO, ORE: DEFAULT_RATIO };

  const ownedPortIds = new Set(
    Object.values(board.vertices)
      .filter((v) => v.building?.playerId === playerId && v.portId)
      .map((v) => v.portId as string),
  );

  for (const port of board.ports) {
    if (!ownedPortIds.has(port.id)) continue;
    if (port.type === 'GENERIC') {
      for (const resource of Object.keys(ratios) as ResourceType[]) {
        ratios[resource] = Math.min(ratios[resource], GENERIC_PORT_RATIO);
      }
    } else {
      ratios[port.type] = Math.min(ratios[port.type], SPECIFIC_PORT_RATIO);
    }
  }

  return ratios;
}

function singleResourceEntry(hand: Partial<ResourceHand>): [ResourceType, number] | null {
  const entries = (Object.entries(hand) as [ResourceType, number | undefined][]).filter(([, v]) => (v ?? 0) > 0);
  if (entries.length !== 1) return null;
  return [entries[0][0], entries[0][1] as number];
}

/**
 * A bank trade must give exactly one resource type (in a multiple of that resource's ratio) and
 * receive exactly one different resource type, in the amount the ratio buys.
 */
export function validateBankTradeAmounts(
  ratios: TradeRatios,
  give: Partial<ResourceHand>,
  receive: Partial<ResourceHand>,
): boolean {
  const giveEntry = singleResourceEntry(give);
  const receiveEntry = singleResourceEntry(receive);
  if (!giveEntry || !receiveEntry) return false;

  const [giveResource, giveAmount] = giveEntry;
  const [receiveResource, receiveAmount] = receiveEntry;
  if (giveResource === receiveResource) return false;

  const ratio = ratios[giveResource];
  if (giveAmount % ratio !== 0) return false;
  return giveAmount / ratio === receiveAmount;
}
