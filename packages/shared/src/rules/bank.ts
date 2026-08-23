import type { Board, ResourceType } from '../types/board.js';
import { TERRAIN_RESOURCE } from '../types/board.js';
import type { ResourceHand } from '../types/game.js';

export interface ResourceGain {
  playerId: string;
  resource: ResourceType;
  amount: number;
}

function vertexIdsForTile(board: Board, hexId: string): string[] {
  return Object.values(board.vertices)
    .filter((v) => v.hexIds.includes(hexId))
    .map((v) => v.id);
}

/** Computes resource gains for a dice roll (does not mutate state). Robber tile never produces. */
export function calculateResourceGains(board: Board, diceTotal: number): ResourceGain[] {
  const gains = new Map<string, Map<ResourceType, number>>();

  for (const tile of Object.values(board.tiles)) {
    if (tile.numberToken !== diceTotal) continue;
    if (tile.id === board.robberHexId) continue;
    const resource = TERRAIN_RESOURCE[tile.terrain];
    if (!resource) continue;

    for (const vertexId of vertexIdsForTile(board, tile.id)) {
      const vertex = board.vertices[vertexId];
      if (!vertex?.building) continue;
      const amount = vertex.building.type === 'CITY' ? 2 : 1;
      if (!gains.has(vertex.building.playerId)) gains.set(vertex.building.playerId, new Map());
      const perPlayer = gains.get(vertex.building.playerId)!;
      perPlayer.set(resource, (perPlayer.get(resource) ?? 0) + amount);
    }
  }

  const result: ResourceGain[] = [];
  for (const [playerId, perResource] of gains) {
    for (const [resource, amount] of perResource) {
      result.push({ playerId, resource, amount });
    }
  }
  return result;
}

/**
 * Bank-scarcity rule: if the bank can't cover everyone entitled to a resource,
 * nobody gets it -- unless exactly one player was entitled, in which case
 * they get whatever remains.
 */
export function applyBankScarcity(gains: ResourceGain[], bankResources: ResourceHand): ResourceGain[] {
  const byResource = new Map<ResourceType, ResourceGain[]>();
  for (const gain of gains) {
    if (!byResource.has(gain.resource)) byResource.set(gain.resource, []);
    byResource.get(gain.resource)!.push(gain);
  }

  const adjusted: ResourceGain[] = [];
  for (const [resource, list] of byResource) {
    const totalRequested = list.reduce((sum, g) => sum + g.amount, 0);
    const available = bankResources[resource];
    if (totalRequested <= available) {
      adjusted.push(...list);
    } else if (list.length === 1) {
      adjusted.push({ ...list[0], amount: available });
    }
    // else: 2+ players wanted it and the bank can't cover everyone -> nobody gets it
  }
  return adjusted;
}
