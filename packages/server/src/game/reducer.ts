import { produce } from 'immer';
import type { GameState, ResourceHand, TradeOffer } from '@catan-online/shared';
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
  calculateGoldPicksOwed,
  applyBankScarcity,
  determineLongestRoadHolder,
  determineLargestArmyHolder,
  totalResources,
  SHIP_COST,
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

/** Swaps the resources for an accepted trade and removes it from the pending list. Shared by the
 * immediate-settle path (accepting a targeted offer) and FINALIZE_TRADE (the proposer's explicit pick). */
function settleTrade(draft: GameState, trade: TradeOffer, withPlayerId: string) {
  const proposer = draft.players.find((p) => p.id === trade.proposerId)!;
  const responder = draft.players.find((p) => p.id === withPlayerId)!;
  for (const key of Object.keys(trade.give) as (keyof ResourceHand)[]) {
    const amount = trade.give[key] ?? 0;
    proposer.resources[key] -= amount;
    responder.resources[key] += amount;
    trackGain(draft, withPlayerId, key, amount);
  }
  for (const key of Object.keys(trade.request) as (keyof ResourceHand)[]) {
    const amount = trade.request[key] ?? 0;
    responder.resources[key] -= amount;
    proposer.resources[key] += amount;
    trackGain(draft, trade.proposerId, key, amount);
  }
  draft.turn!.pendingTrades = draft.turn!.pendingTrades.filter((t) => t.id !== trade.id);
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
  // During someone else's special building slot the actor isn't the real current player -- per
  // the rule, reaching 10 points there doesn't end the game until it's actually their own turn.
  if (actingPlayerId !== draft.turn?.currentPlayerId) return;
  const points = calculateTotalVictoryPoints(draft, actingPlayerId);
  if (points >= 10) {
    draft.winnerId = actingPlayerId;
    draft.phase = 'GAME_OVER';
    addLog(draft, `${playerName(draft, actingPlayerId)}が${points}点で勝利しました！`);
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
        addLog(draft, 'ゲームを開始しました。初期配置フェーズです。');
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
        addLog(draft, '再戦！新しいマップを生成しました。');
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
        addLog(draft, `${playerName(draft, action.playerId)}が初期の開拓地を配置しました。`);
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
        addLog(draft, `${playerName(draft, action.playerId)}が初期の道路を配置しました。`);

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
            specialBuild: null,
            pendingGoldPick: null,
          };
          draft.setup = null;
          addLog(draft, '初期配置が完了しました。ゲーム開始です！');
          checkWinCondition(draft, draft.players[0].id);
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
        addLog(draft, `${playerName(draft, action.playerId)}がサイコロを振って${d1} + ${d2} = ${total}が出ました。`);

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
            needsDiscard ? '7が出ました。手札が8枚以上のプレイヤーは半分捨ててください。' : '7が出ました。盗賊を移動してください。',
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

        const goldOwed = calculateGoldPicksOwed(draft.board, total);
        if (goldOwed.length > 0) {
          draft.turn!.pendingGoldPick = Object.fromEntries(goldOwed.map((g) => [g.playerId, g.count]));
          for (const g of goldOwed) {
            addLog(draft, `${playerName(draft, g.playerId)}が金鉱から${g.count}枚選べます。`);
          }
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
        addLog(draft, `${playerName(draft, action.playerId)}がカードを捨てました。`);

        const stillWaiting = Object.values(pending.discardsRemaining).some((n) => n > 0);
        if (!stillWaiting) pending.stage = 'MOVE_ROBBER';
      });

    case 'MOVE_ROBBER':
      return produce(state, (draft) => {
        draft.board.robberHexId = action.hexId;
        addLog(draft, `${playerName(draft, action.playerId)}が盗賊を移動しました。`);

        const targetIds = new Set<string>();
        for (const vertex of Object.values(draft.board.vertices)) {
          if (!vertex.hexIds.includes(action.hexId)) continue;
          if (vertex.building && vertex.building.playerId !== action.playerId) targetIds.add(vertex.building.playerId);
        }

        if (targetIds.size === 0) {
          draft.turn!.pendingRobber = null;
          addLog(draft, 'そのマスには奪える相手がいませんでした。');
        } else {
          draft.turn!.pendingRobber!.stage = 'SELECT_TARGET';
          draft.turn!.pendingRobber!.eligibleStealTargets = Array.from(targetIds);
        }
      });

    case 'MOVE_PIRATE':
      return produce(state, (draft) => {
        draft.board.pirateHexId = action.hexId;
        addLog(draft, `${playerName(draft, action.playerId)}が海賊船を移動しました。`);

        const targetIds = new Set<string>();
        for (const edge of Object.values(draft.board.edges)) {
          if (!edge.hexIds.includes(action.hexId)) continue;
          if (edge.ship && edge.ship.playerId !== action.playerId) targetIds.add(edge.ship.playerId);
        }

        if (targetIds.size === 0) {
          draft.turn!.pendingRobber = null;
          addLog(draft, 'そのマスには奪える相手がいませんでした。');
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
        addLog(draft, `${playerName(draft, action.playerId)}が${playerName(draft, action.targetPlayerId)}からカードを奪いました。`);
        draft.turn!.pendingRobber = null;
      });

    case 'SELECT_GOLD_RESOURCES':
      return produce(state, (draft) => {
        const player = draft.players.find((p) => p.id === action.playerId)!;
        for (const key of Object.keys(action.resources) as (keyof ResourceHand)[]) {
          const amount = action.resources[key] ?? 0;
          player.resources[key] += amount;
          draft.bank.resources[key] -= amount;
          trackGain(draft, action.playerId, key, amount);
        }
        const pending = draft.turn!.pendingGoldPick!;
        delete pending[action.playerId];
        addLog(draft, `${playerName(draft, action.playerId)}が金鉱から資源を選びました。`);

        if (Object.keys(pending).length === 0) draft.turn!.pendingGoldPick = null;
      });

    case 'BUILD_ROAD':
      return produce(state, (draft) => {
        spend(draft, action.playerId, ROAD_COST);
        draft.board.edges[action.edgeId].road = { playerId: action.playerId };
        const player = draft.players.find((p) => p.id === action.playerId)!;
        player.buildingStock.roads -= 1;
        player.stats.roadsBuilt += 1;
        addLog(draft, `${playerName(draft, action.playerId)}が道路を建設しました。`);
        refreshLongestRoad(draft);
        checkWinCondition(draft, action.playerId); // a new longest-road award can itself be the winning point
      });

    case 'BUILD_SHIP':
      return produce(state, (draft) => {
        spend(draft, action.playerId, SHIP_COST);
        draft.board.edges[action.edgeId].ship = { playerId: action.playerId };
        const player = draft.players.find((p) => p.id === action.playerId)!;
        player.buildingStock.ships -= 1;
        addLog(draft, `${playerName(draft, action.playerId)}が船を建設しました。`);
        refreshLongestRoad(draft);
        checkWinCondition(draft, action.playerId);
      });

    case 'BUILD_SETTLEMENT':
      return produce(state, (draft) => {
        spend(draft, action.playerId, SETTLEMENT_COST);
        draft.board.vertices[action.vertexId].building = { playerId: action.playerId, type: 'SETTLEMENT' };
        const player = draft.players.find((p) => p.id === action.playerId)!;
        player.buildingStock.settlements -= 1;
        player.stats.settlementsBuilt += 1;
        addLog(draft, `${playerName(draft, action.playerId)}が開拓地を建設しました。`);
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
        addLog(draft, `${playerName(draft, action.playerId)}が都市に更新しました。`);
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
        addLog(draft, `${playerName(draft, action.playerId)}が発展カードを購入しました。`);
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
            addLog(draft, `${playerName(draft, action.playerId)}が騎士カードを使用しました。`);
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
            addLog(draft, `${playerName(draft, action.playerId)}が街道建設カードを使用しました。`);
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
            addLog(draft, `${playerName(draft, action.playerId)}が発明カードを使用しました。`);
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
            addLog(draft, `${playerName(draft, action.playerId)}が独占カードで${RESOURCE_LABELS_JA[resource]}を独占しました。`);
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
        addLog(draft, `${playerName(draft, action.playerId)}が銀行と交易しました。`);
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
          acceptedBy: [],
        });
        addLog(draft, `${playerName(draft, action.playerId)}が交易を提案しました。`);
      });

    case 'RESPOND_TRADE':
      return produce(state, (draft) => {
        const trade = draft.turn!.pendingTrades.find((t) => t.id === action.tradeId)!;
        if (action.accept) {
          if (!trade.acceptedBy.includes(action.playerId)) trade.acceptedBy.push(action.playerId);
          // A targeted (1:1) offer can only ever have one possible acceptor, so there's nothing for
          // the proposer to choose between -- settle it immediately, same as before FINALIZE_TRADE
          // existed. An open offer (targetId === null) could still draw more accepters, so it waits.
          if (trade.targetId !== null) {
            addLog(draft, `${playerName(draft, action.playerId)}が${playerName(draft, trade.proposerId)}の交易を承諾しました。`);
            settleTrade(draft, trade, action.playerId);
          } else {
            addLog(draft, `${playerName(draft, action.playerId)}が${playerName(draft, trade.proposerId)}の交易に承諾の意思を示しました。`);
          }
        } else {
          trade.acceptedBy = trade.acceptedBy.filter((id) => id !== action.playerId);
          addLog(draft, `${playerName(draft, action.playerId)}が交易を拒否しました。`);
          // A 1:1 offer ends on rejection; an open offer (targetId === null) stays available for others.
          if (trade.targetId !== null) {
            draft.turn!.pendingTrades = draft.turn!.pendingTrades.filter((t) => t.id !== action.tradeId);
          }
        }
      });

    case 'CANCEL_TRADE':
      return produce(state, (draft) => {
        draft.turn!.pendingTrades = draft.turn!.pendingTrades.filter((t) => t.id !== action.tradeId);
        addLog(draft, `${playerName(draft, action.playerId)}が交易を取り消しました。`);
      });

    case 'FINALIZE_TRADE':
      return produce(state, (draft) => {
        const trade = draft.turn!.pendingTrades.find((t) => t.id === action.tradeId)!;
        addLog(draft, `${playerName(draft, trade.proposerId)}が${playerName(draft, action.withPlayerId)}との交易を成立させました。`);
        settleTrade(draft, trade, action.withPlayerId);
      });

    case 'END_TURN':
      return produce(state, (draft) => {
        addLog(draft, `${playerName(draft, action.playerId)}が手番を終了しました。`);

        // Seat order starting right after the player who just went, wrapping around --
        // this is "everyone else, in rotation order" either way the rule below branches.
        const currentIndex = draft.players.findIndex((p) => p.id === action.playerId);
        const order = draft.players
          .slice(currentIndex + 1)
          .concat(draft.players.slice(0, currentIndex))
          .map((p) => p.id);
        const nextPlayerId = order[0] ?? action.playerId;

        if (draft.specialBuildingPhaseEnabled && order.length > 0) {
          const [activePlayerId, ...queue] = order;
          draft.turn!.specialBuild = { queue, activePlayerId, nextPlayerId };
          draft.turn!.pendingTrades = []; // no trading is allowed once the special build phase starts
          addLog(draft, `${playerName(draft, activePlayerId)}の特別建造フェイズです。`);
        } else {
          draft.turn = {
            turnNumber: draft.turn!.turnNumber + 1,
            currentPlayerId: nextPlayerId,
            hasRolled: false,
            lastDiceRoll: null,
            devCardPlayedThisTurn: false,
            pendingRobber: null,
            pendingTrades: [],
            specialBuild: null,
            pendingGoldPick: null,
          };
          checkWinCondition(draft, nextPlayerId);
        }
      });

    case 'PASS_SPECIAL_BUILD':
      return produce(state, (draft) => {
        const sb = draft.turn!.specialBuild!;
        if (sb.queue.length === 0) {
          draft.turn = {
            turnNumber: draft.turn!.turnNumber + 1,
            currentPlayerId: sb.nextPlayerId,
            hasRolled: false,
            lastDiceRoll: null,
            devCardPlayedThisTurn: false,
            pendingRobber: null,
            pendingTrades: [],
            specialBuild: null,
            pendingGoldPick: null,
          };
          addLog(draft, `${playerName(draft, sb.nextPlayerId)}の手番です。`);
          checkWinCondition(draft, sb.nextPlayerId);
        } else {
          const [activePlayerId, ...queue] = sb.queue;
          draft.turn!.specialBuild = { queue, activePlayerId, nextPlayerId: sb.nextPlayerId };
          addLog(draft, `${playerName(draft, activePlayerId)}の特別建造フェイズです。`);
        }
      });

    default:
      return state;
  }
}
