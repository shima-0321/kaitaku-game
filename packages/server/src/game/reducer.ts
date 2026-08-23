import { produce } from 'immer';
import type { GameState, ResourceHand } from '@catan-online/shared';
import {
  TERRAIN_RESOURCE,
  RESOURCE_LABELS_JA,
  ROAD_COST,
  SETTLEMENT_COST,
  CITY_COST,
  DEV_CARD_COST,
  INITIAL_BUILDING_STOCK,
  createEmptyHand,
  createEmptyPlayerStats,
  calculateResourceGains,
  applyBankScarcity,
  determineLongestRoadHolder,
  determineLargestArmyHolder,
  totalResources,
} from '@catan-online/shared';
import type { GameAction } from './actions.js';
import { startGame, rollTurnOrder } from './setup.js';
import { calculateTotalVictoryPoints } from './scoring.js';

function addLog(draft: GameState, message: string) {
  draft.log.push({ id: `log-${draft.log.length}-${Date.now()}`, timestamp: Date.now(), message });
}

function playerName(state: GameState, playerId: string): string {
  return state.players.find((p) => p.id === playerId)?.name ?? 'Unknown';
}

function spend(draft: GameState, playerId: string, cost: Partial<ResourceHand>) {
  const player = draft.players.find((p) => p.id === playerId)!;
  for (const key of Object.keys(cost) as (keyof ResourceHand)[]) {
    const amount = cost[key] ?? 0;
    player.resources[key] -= amount;
    draft.bank.resources[key] += amount;
  }
}

/** Tracks cumulative resources received (dice production, trades, steals, dev cards...) for the end-game results screen. */
function trackGain(draft: GameState, playerId: string, resource: keyof ResourceHand, amount: number) {
  if (amount <= 0) return;
  const player = draft.players.find((p) => p.id === playerId)!;
  player.stats.resourcesGained[resource] += amount;
}

function refreshLongestRoad(draft: GameState) {
  const previousHolder = draft.longestRoadPlayerId;
  draft.longestRoadPlayerId = determineLongestRoadHolder(
    draft.board,
    draft.players.map((p) => p.id),
    draft.longestRoadPlayerId,
  );
  if (draft.longestRoadPlayerId && draft.longestRoadPlayerId !== previousHolder) {
    addLog(draft, `${playerName(draft, draft.longestRoadPlayerId)}が最長交易路を獲得しました。`);
  }
}

function refreshLargestArmy(draft: GameState) {
  const previousHolder = draft.largestArmyPlayerId;
  const knightsPlayed = Object.fromEntries(draft.players.map((p) => [p.id, p.knightsPlayed]));
  draft.largestArmyPlayerId = determineLargestArmyHolder(
    knightsPlayed,
    draft.players.map((p) => p.id),
    draft.largestArmyPlayerId,
  );
  if (draft.largestArmyPlayerId && draft.largestArmyPlayerId !== previousHolder) {
    addLog(draft, `${playerName(draft, draft.largestArmyPlayerId)}が最大騎士力を獲得しました。`);
  }
}

/**
 * Per the official rule, a win only ends the game immediately when the acting player themself
 * reaches 10+ points. Actions in this codebase only ever grant VP to the player performing them,
 * so checking the acting player after every VP-affecting action is sufficient.
 */
function checkWinCondition(draft: GameState, actingPlayerId: string) {
  if (draft.winnerId) return;
  const points = calculateTotalVictoryPoints(draft, actingPlayerId);
  if (points >= 10) {
    draft.winnerId = actingPlayerId;
    draft.phase = 'GAME_OVER';
    addLog(draft, `${playerName(draft, actingPlayerId)} wins with ${points} victory points!`);
  }
}

export function applyAction(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_GAME': {
      const rolls = rollTurnOrder(state.players);
      const started = startGame(state, rolls);
      return produce(started, (draft) => {
        for (const r of rolls) {
          addLog(draft, `${playerName(draft, r.playerId)}がサイコロで${r.dice[0] + r.dice[1]}を出しました。`);
        }
        addLog(draft, `${playerName(draft, rolls[0].playerId)}が先手です。`);
        addLog(draft, 'Game started. Setup phase begins.');
      });
    }

    case 'REMATCH': {
      const resetPlayers = state.players.map((p) => ({
        ...p,
        resources: createEmptyHand(),
        devCards: [],
        buildingStock: { ...INITIAL_BUILDING_STOCK },
        knightsPlayed: 0,
        stats: createEmptyPlayerStats(),
      }));
      const rolls = rollTurnOrder(resetPlayers);
      const started = startGame({ ...state, players: resetPlayers, winnerId: null, longestRoadPlayerId: null, largestArmyPlayerId: null }, rolls);
      return produce(started, (draft) => {
        draft.log = [];
        for (const r of rolls) {
          addLog(draft, `${playerName(draft, r.playerId)}がサイコロで${r.dice[0] + r.dice[1]}を出しました。`);
        }
        addLog(draft, `${playerName(draft, rolls[0].playerId)}が先手です。`);
        addLog(draft, 'Rematch! New map generated.');
      });
    }

    case 'PLACE_SETUP_SETTLEMENT':
      return produce(state, (draft) => {
        const player = draft.players.find((p) => p.id === action.playerId)!;
        const setup = draft.setup!;

        // undo the previous placement first if the player is re-picking before placing the road
        if (setup.awaitingRoadForVertexId) {
          draft.board.vertices[setup.awaitingRoadForVertexId].building = null;
          player.buildingStock.settlements += 1;
        }

        draft.board.vertices[action.vertexId].building = { playerId: action.playerId, type: 'SETTLEMENT' };
        player.buildingStock.settlements -= 1;
        setup.awaitingRoadForVertexId = action.vertexId;
        addLog(draft, `${playerName(draft, action.playerId)} placed a starting settlement.`);
      });

    case 'PLACE_SETUP_ROAD':
      return produce(state, (draft) => {
        const setup = draft.setup!;
        const settlementVertexId = setup.awaitingRoadForVertexId!;
        draft.board.edges[action.edgeId].road = { playerId: action.playerId };
        const player = draft.players.find((p) => p.id === action.playerId)!;
        player.buildingStock.roads -= 1;
        // the settlement itself is only counted once it's locked in by placing its road (it can
        // still be re-picked before then), matching roadsBuilt's own +1 for this same action
        player.stats.settlementsBuilt += 1;
        player.stats.roadsBuilt += 1;
        addLog(draft, `${playerName(draft, action.playerId)} placed a starting road.`);

        if (setup.round === 2) {
          const vertex = draft.board.vertices[settlementVertexId];
          for (const hexId of vertex.hexIds) {
            const resource = TERRAIN_RESOURCE[draft.board.tiles[hexId].terrain];
            if (!resource) continue;
            player.resources[resource] += 1;
            draft.bank.resources[resource] -= 1;
            trackGain(draft, action.playerId, resource, 1);
          }
        }

        setup.awaitingRoadForVertexId = null;
        setup.step += 1;

        if (setup.step >= setup.order.length) {
          draft.phase = 'PLAYING';
          draft.turn = {
            turnNumber: 1,
            currentPlayerId: draft.players[0].id,
            hasRolled: false,
            lastDiceRoll: null,
            devCardPlayedThisTurn: false,
            pendingRobber: null,
            pendingTrades: [],
          };
          draft.setup = null;
          addLog(draft, 'Setup complete. The game begins!');
        } else {
          setup.round = setup.step >= setup.order.length / 2 ? 2 : 1;
        }
      });

    case 'ROLL_DICE':
      return produce(state, (draft) => {
        const [d1, d2] = action.dice;
        const total = d1 + d2;
        draft.turn!.hasRolled = true;
        draft.turn!.lastDiceRoll = action.dice;
        addLog(draft, `${playerName(draft, action.playerId)} rolled ${d1} + ${d2} = ${total}.`);

        if (total === 7) {
          const discardsRemaining: Record<string, number> = {};
          for (const p of draft.players) {
            const count = totalResources(p.resources);
            if (count > 7) discardsRemaining[p.id] = Math.floor(count / 2);
          }
          const needsDiscard = Object.keys(discardsRemaining).length > 0;
          draft.turn!.pendingRobber = {
            reason: 'DICE_SEVEN',
            stage: needsDiscard ? 'DISCARD' : 'MOVE_ROBBER',
            discardsRemaining,
            eligibleStealTargets: null,
          };
          addLog(
            draft,
            needsDiscard ? 'Rolled a 7 -- players with more than 7 cards must discard.' : 'Rolled a 7 -- move the robber.',
          );
          return;
        }

        const gains = calculateResourceGains(draft.board, total);
        const adjusted = applyBankScarcity(gains, draft.bank.resources);
        for (const gain of adjusted) {
          const player = draft.players.find((p) => p.id === gain.playerId);
          if (!player) continue;
          player.resources[gain.resource] += gain.amount;
          draft.bank.resources[gain.resource] -= gain.amount;
          trackGain(draft, gain.playerId, gain.resource, gain.amount);
        }

        // log who actually received what, grouped per player for a readable line
        const gainsByPlayer = new Map<string, string[]>();
        for (const gain of adjusted) {
          const list = gainsByPlayer.get(gain.playerId) ?? [];
          list.push(`${RESOURCE_LABELS_JA[gain.resource]}${gain.amount}`);
          gainsByPlayer.set(gain.playerId, list);
        }
        for (const [gainPlayerId, items] of gainsByPlayer) {
          addLog(draft, `${playerName(draft, gainPlayerId)}が${items.join('、')}を獲得。`);
        }
      });

    case 'SELECT_DISCARD':
      return produce(state, (draft) => {
        const player = draft.players.find((p) => p.id === action.playerId)!;
        for (const key of Object.keys(action.resources) as (keyof ResourceHand)[]) {
          const amount = action.resources[key] ?? 0;
          player.resources[key] -= amount;
          draft.bank.resources[key] += amount;
        }
        const pending = draft.turn!.pendingRobber!;
        delete pending.discardsRemaining[action.playerId];
        addLog(draft, `${playerName(draft, action.playerId)} discarded cards.`);

        const stillWaiting = Object.values(pending.discardsRemaining).some((n) => n > 0);
        if (!stillWaiting) pending.stage = 'MOVE_ROBBER';
      });

    case 'MOVE_ROBBER':
      return produce(state, (draft) => {
        draft.board.robberHexId = action.hexId;
        addLog(draft, `${playerName(draft, action.playerId)} moved the robber.`);

        const targetIds = new Set<string>();
        for (const vertex of Object.values(draft.board.vertices)) {
          if (!vertex.hexIds.includes(action.hexId)) continue;
          if (vertex.building && vertex.building.playerId !== action.playerId) targetIds.add(vertex.building.playerId);
        }

        if (targetIds.size === 0) {
          draft.turn!.pendingRobber = null;
          addLog(draft, 'No one to steal from there.');
        } else {
          draft.turn!.pendingRobber!.stage = 'SELECT_TARGET';
          draft.turn!.pendingRobber!.eligibleStealTargets = Array.from(targetIds);
        }
      });

    case 'STEAL_FROM':
      return produce(state, (draft) => {
        if (action.stolenResource) {
          const target = draft.players.find((p) => p.id === action.targetPlayerId)!;
          const thief = draft.players.find((p) => p.id === action.playerId)!;
          target.resources[action.stolenResource] -= 1;
          thief.resources[action.stolenResource] += 1;
          trackGain(draft, action.playerId, action.stolenResource, 1);
        }
        addLog(draft, `${playerName(draft, action.playerId)} stole a card from ${playerName(draft, action.targetPlayerId)}.`);
        draft.turn!.pendingRobber = null;
      });

    case 'BUILD_ROAD':
      return produce(state, (draft) => {
        spend(draft, action.playerId, ROAD_COST);
        draft.board.edges[action.edgeId].road = { playerId: action.playerId };
        const player = draft.players.find((p) => p.id === action.playerId)!;
        player.buildingStock.roads -= 1;
        player.stats.roadsBuilt += 1;
        addLog(draft, `${playerName(draft, action.playerId)} built a road.`);
        refreshLongestRoad(draft);
        checkWinCondition(draft, action.playerId); // a new longest-road award can itself be the winning point
      });

    case 'BUILD_SETTLEMENT':
      return produce(state, (draft) => {
        spend(draft, action.playerId, SETTLEMENT_COST);
        draft.board.vertices[action.vertexId].building = { playerId: action.playerId, type: 'SETTLEMENT' };
        const player = draft.players.find((p) => p.id === action.playerId)!;
        player.buildingStock.settlements -= 1;
        player.stats.settlementsBuilt += 1;
        addLog(draft, `${playerName(draft, action.playerId)} built a settlement.`);
        refreshLongestRoad(draft); // a new settlement can cut an opponent's road
        checkWinCondition(draft, action.playerId);
      });

    case 'BUILD_CITY':
      return produce(state, (draft) => {
        spend(draft, action.playerId, CITY_COST);
        draft.board.vertices[action.vertexId].building = { playerId: action.playerId, type: 'CITY' };
        const player = draft.players.find((p) => p.id === action.playerId)!;
        player.buildingStock.cities -= 1;
        player.buildingStock.settlements += 1; // the settlement piece returns to stock
        player.stats.citiesBuilt += 1;
        addLog(draft, `${playerName(draft, action.playerId)} built a city.`);
        checkWinCondition(draft, action.playerId);
      });

    case 'BUY_DEV_CARD':
      return produce(state, (draft) => {
        spend(draft, action.playerId, DEV_CARD_COST);
        const card = draft.bank.devCardDeck.shift()!;
        card.boughtOnTurn = draft.turn!.turnNumber;
        const player = draft.players.find((p) => p.id === action.playerId)!;
        player.devCards.push(card);
        player.stats.devCardsBought += 1;
        addLog(draft, `${playerName(draft, action.playerId)} bought a development card.`);
        if (card.type === 'VICTORY_POINT') checkWinCondition(draft, action.playerId);
      });

    case 'PLAY_DEV_CARD':
      return produce(state, (draft) => {
        const player = draft.players.find((p) => p.id === action.playerId)!;
        const card = player.devCards.find((c) => c.id === action.devCardId)!;
        card.used = true;
        draft.turn!.devCardPlayedThisTurn = true;
        player.stats.devCardsUsed[card.type] += 1;

        switch (card.type) {
          case 'KNIGHT': {
            player.knightsPlayed += 1;
            refreshLargestArmy(draft);
            addLog(draft, `${playerName(draft, action.playerId)} played a knight.`);
            draft.turn!.pendingRobber = {
              reason: 'KNIGHT_CARD',
              stage: 'MOVE_ROBBER',
              discardsRemaining: {},
              eligibleStealTargets: null,
            };
            checkWinCondition(draft, action.playerId); // largest army can itself be the winning point
            break;
          }
          case 'ROAD_BUILDING': {
            const [e1, e2] = action.params!.edgeIds!;
            draft.board.edges[e1].road = { playerId: action.playerId };
            player.buildingStock.roads -= 1;
            draft.board.edges[e2].road = { playerId: action.playerId };
            player.buildingStock.roads -= 1;
            player.stats.roadsBuilt += 2;
            addLog(draft, `${playerName(draft, action.playerId)} played road building.`);
            refreshLongestRoad(draft);
            checkWinCondition(draft, action.playerId);
            break;
          }
          case 'YEAR_OF_PLENTY': {
            const resources = action.params!.resources!;
            for (const key of Object.keys(resources) as (keyof ResourceHand)[]) {
              const amount = resources[key] ?? 0;
              player.resources[key] += amount;
              draft.bank.resources[key] -= amount;
              trackGain(draft, action.playerId, key, amount);
            }
            addLog(draft, `${playerName(draft, action.playerId)} played year of plenty.`);
            break;
          }
          case 'MONOPOLY': {
            const resource = action.params!.resource!;
            let total = 0;
            for (const other of draft.players) {
              if (other.id === action.playerId) continue;
              total += other.resources[resource];
              other.resources[resource] = 0;
            }
            player.resources[resource] += total;
            trackGain(draft, action.playerId, resource, total);
            addLog(draft, `${playerName(draft, action.playerId)} played monopoly on ${resource}.`);
            break;
          }
        }
      });

    case 'BANK_TRADE':
      return produce(state, (draft) => {
        const player = draft.players.find((p) => p.id === action.playerId)!;
        for (const key of Object.keys(action.give) as (keyof ResourceHand)[]) {
          const amount = action.give[key] ?? 0;
          player.resources[key] -= amount;
          draft.bank.resources[key] += amount;
        }
        for (const key of Object.keys(action.receive) as (keyof ResourceHand)[]) {
          const amount = action.receive[key] ?? 0;
          player.resources[key] += amount;
          draft.bank.resources[key] -= amount;
          trackGain(draft, action.playerId, key, amount);
        }
        addLog(draft, `${playerName(draft, action.playerId)} traded with the bank.`);
      });

    case 'PROPOSE_TRADE':
      return produce(state, (draft) => {
        draft.turn!.pendingTrades.push({
          id: action.tradeId,
          proposerId: action.playerId,
          targetId: action.targetPlayerId,
          give: action.give,
          request: action.request,
          status: 'PENDING',
        });
        addLog(draft, `${playerName(draft, action.playerId)} proposed a trade.`);
      });

    case 'RESPOND_TRADE':
      return produce(state, (draft) => {
        const trade = draft.turn!.pendingTrades.find((t) => t.id === action.tradeId)!;
        if (action.accept) {
          const proposer = draft.players.find((p) => p.id === trade.proposerId)!;
          const responder = draft.players.find((p) => p.id === action.playerId)!;
          for (const key of Object.keys(trade.give) as (keyof ResourceHand)[]) {
            const amount = trade.give[key] ?? 0;
            proposer.resources[key] -= amount;
            responder.resources[key] += amount;
            trackGain(draft, action.playerId, key, amount);
          }
          for (const key of Object.keys(trade.request) as (keyof ResourceHand)[]) {
            const amount = trade.request[key] ?? 0;
            responder.resources[key] -= amount;
            proposer.resources[key] += amount;
            trackGain(draft, trade.proposerId, key, amount);
          }
          addLog(draft, `${playerName(draft, action.playerId)} accepted a trade from ${playerName(draft, trade.proposerId)}.`);
          draft.turn!.pendingTrades = draft.turn!.pendingTrades.filter((t) => t.id !== action.tradeId);
        } else {
          addLog(draft, `${playerName(draft, action.playerId)} rejected a trade.`);
          // A 1:1 offer ends on rejection; an open offer (targetId === null) stays available for others.
          if (trade.targetId !== null) {
            draft.turn!.pendingTrades = draft.turn!.pendingTrades.filter((t) => t.id !== action.tradeId);
          }
        }
      });

    case 'CANCEL_TRADE':
      return produce(state, (draft) => {
        draft.turn!.pendingTrades = draft.turn!.pendingTrades.filter((t) => t.id !== action.tradeId);
        addLog(draft, `${playerName(draft, action.playerId)} cancelled a trade.`);
      });

    case 'END_TURN':
      return produce(state, (draft) => {
        const currentIndex = draft.players.findIndex((p) => p.id === action.playerId);
        const nextIndex = (currentIndex + 1) % draft.players.length;
        draft.turn = {
          turnNumber: draft.turn!.turnNumber + 1,
          currentPlayerId: draft.players[nextIndex].id,
          hasRolled: false,
          lastDiceRoll: null,
          devCardPlayedThisTurn: false,
          pendingRobber: null,
          pendingTrades: [],
        };
        addLog(draft, `${playerName(draft, action.playerId)} ended their turn.`);
      });

    default:
      return state;
  }
}
