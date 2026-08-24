import { useEffect, useMemo, useRef, useState } from 'react'
import {
  canPlaceSettlement,
  canPlaceRoad,
  canUpgradeToCity,
  canAfford,
  totalResources,
  calculateLongestRoad,
  ROAD_COST,
  SETTLEMENT_COST,
  CITY_COST,
  DEV_CARD_COST,
  RESOURCE_LABELS_JA,
} from '@catan-online/shared'
import type { EdgeId, HexId, VertexId, ResourceHand, ResourceType } from '@catan-online/shared'
import { useGameStore } from '../hooks/useGameStore'
import { socket } from '../lib/socket'
import { HexBoard } from '../components/board/HexBoard'
import { DiceRoller } from '../components/board/DiceRoller'
import { TradePanel } from '../components/panels/TradePanel'
import { DevCardPanel } from '../components/panels/DevCardPanel'
import { DiscardModal } from '../components/modals/DiscardModal'
import { StealTargetModal } from '../components/modals/StealTargetModal'
import { IncomingTradeModal } from '../components/modals/IncomingTradeModal'
import { FinalizeTradeModal } from '../components/modals/FinalizeTradeModal'
import { YearOfPlentyModal } from '../components/modals/YearOfPlentyModal'
import { MonopolyModal } from '../components/modals/MonopolyModal'
import { GameOverModal } from '../components/modals/GameOverModal'
import { GameRulesModal } from '../components/modals/GameRulesModal'
import { CardHelpModal } from '../components/modals/CardHelpModal'
import { InfoModal } from '../components/modals/InfoModal'
import { PLAYER_COLOR_HEX } from '../lib/colors'
import { startBgm, stopBgm, playGameSound, SOUND_URLS } from '../lib/sound'

type BuildMode = 'NONE' | 'ROAD' | 'SETTLEMENT' | 'CITY'

const RESOURCE_ORDER: ResourceType[] = ['BRICK', 'LUMBER', 'WOOL', 'GRAIN', 'ORE']
function formatCost(cost: Partial<ResourceHand>): string {
  return RESOURCE_ORDER.filter((res) => cost[res])
    .map((res) => `${RESOURCE_LABELS_JA[res]}${cost[res]}`)
    .join(' ')
}

export function GamePage() {
  const clientState = useGameStore((s) => s.clientState)
  const playerId = useGameStore((s) => s.playerId)
  const lastError = useGameStore((s) => s.lastError)
  const setLastError = useGameStore((s) => s.setLastError)
  const [buildMode, setBuildMode] = useState<BuildMode>('NONE')
  const [roadBuildingDevCardId, setRoadBuildingDevCardId] = useState<string | null>(null)
  const [roadBuildingFirstEdge, setRoadBuildingFirstEdge] = useState<EdgeId | null>(null)
  const [yearOfPlentyDevCardId, setYearOfPlentyDevCardId] = useState<string | null>(null)
  const [monopolyDevCardId, setMonopolyDevCardId] = useState<string | null>(null)
  const [showRules, setShowRules] = useState(false)
  const [showCardHelp, setShowCardHelp] = useState(false)
  const [mobilePopup, setMobilePopup] = useState<'INFO' | 'TRADE' | 'ACTION' | null>(null)

  useEffect(() => {
    startBgm()
    return () => stopBgm()
  }, [])

  const isMyTurnForSound = clientState?.phase === 'PLAYING' && clientState?.turn?.currentPlayerId === playerId
  const prevIsMyTurnRef = useRef<boolean | null>(null)
  const [showTurnBanner, setShowTurnBanner] = useState(false)
  useEffect(() => {
    if (prevIsMyTurnRef.current === false && isMyTurnForSound) {
      playGameSound(SOUND_URLS.myTurnStart)
      setShowTurnBanner(true)
      const timer = setTimeout(() => setShowTurnBanner(false), 2200)
      prevIsMyTurnRef.current = isMyTurnForSound
      return () => clearTimeout(timer)
    }
    prevIsMyTurnRef.current = isMyTurnForSound
  }, [isMyTurnForSound])

  const robbedDetailEvent = useGameStore((s) => s.robbedDetailEvent)
  const prevRobbedDetailEventRef = useRef<typeof robbedDetailEvent>(null)
  const [robBanner, setRobBanner] = useState<{ text: string; variant: 'rob' | 'robbed' } | null>(null)
  useEffect(() => {
    if (!robbedDetailEvent || robbedDetailEvent === prevRobbedDetailEventRef.current) return
    prevRobbedDetailEventRef.current = robbedDetailEvent
    if (!playerId || !clientState) return
    const isRobber = robbedDetailEvent.robberId === playerId
    const isVictim = robbedDetailEvent.victimId === playerId
    if (!isRobber && !isVictim) return
    const otherId = isRobber ? robbedDetailEvent.victimId : robbedDetailEvent.robberId
    const allPlayers = clientState.me ? [clientState.me, ...clientState.players] : clientState.players
    const otherName = allPlayers.find((p) => p.id === otherId)?.name ?? '相手'
    const resourceLabel = RESOURCE_LABELS_JA[robbedDetailEvent.resource]
    const text = isRobber ? `${otherName}から${resourceLabel}を奪いました！` : `${otherName}に${resourceLabel}を奪われました…`
    setRobBanner({ text, variant: isRobber ? 'rob' : 'robbed' })
    const timer = setTimeout(() => setRobBanner(null), 2200)
    return () => clearTimeout(timer)
  }, [robbedDetailEvent, playerId, clientState])

  // Every game-log line pops up as a brief toast too, so players can follow what's happening
  // without having to keep an eye on the log panel. Skipped on first load/reconnect (the whole
  // history would otherwise flood in as toasts) and capped so a burst of actions doesn't pile up forever.
  const [actionToasts, setActionToasts] = useState<{ id: string; message: string }[]>([])
  const seenLogIdsRef = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!clientState) return
    if (seenLogIdsRef.current === null) {
      seenLogIdsRef.current = new Set(clientState.log.map((e) => e.id))
      return
    }
    const seen = seenLogIdsRef.current
    const newEntries = clientState.log.filter((e) => !seen.has(e.id))
    if (newEntries.length === 0) return
    for (const e of newEntries) seen.add(e.id)
    setActionToasts((prev) => [...prev, ...newEntries.map((e) => ({ id: e.id, message: e.message }))].slice(-4))
    for (const e of newEntries) {
      setTimeout(() => setActionToasts((prev) => prev.filter((t) => t.id !== e.id)), 3200)
    }
  }, [clientState])

  const playerColorById = useMemo(() => {
    const map: Record<string, string> = {}
    if (!clientState) return map
    if (clientState.me) map[clientState.me.id] = PLAYER_COLOR_HEX[clientState.me.color]
    for (const p of clientState.players) map[p.id] = PLAYER_COLOR_HEX[p.color]
    return map
  }, [clientState])

  if (!clientState || !playerId) {
    return (
      <div className="page">
        <p>ゲーム情報を読み込み中…</p>
      </div>
    )
  }

  // Captured as a fresh const (rather than reusing the narrowed `clientState`) so the render*
  // helper functions below -- which are nested function declarations -- see a non-nullable type
  // too; TS doesn't carry narrowing on `clientState` itself across a function boundary.
  const state = clientState
  const me = state.me
  const isSetupPhase = state.phase === 'SETUP'
  const isMySetupTurn = isSetupPhase && clientState.setup?.order[clientState.setup.step] === playerId
  const isMyTurn = clientState.phase === 'PLAYING' && clientState.turn?.currentPlayerId === playerId
  const awaitingRoadVertexId = clientState.setup?.awaitingRoadForVertexId ?? null
  const rolledTotal = clientState.turn?.lastDiceRoll
    ? clientState.turn.lastDiceRoll[0] + clientState.turn.lastDiceRoll[1]
    : null

  const pendingRobber = clientState.turn?.pendingRobber ?? null
  const myDiscardRequired = pendingRobber?.stage === 'DISCARD' ? (pendingRobber.discardsRemaining[playerId] ?? 0) : 0
  const isMoveRobberStage = isMyTurn && pendingRobber?.stage === 'MOVE_ROBBER'
  const isSelectTargetStage = isMyTurn && pendingRobber?.stage === 'SELECT_TARGET'

  // A build button should only glow/be enabled when the player can actually afford it AND has
  // both remaining stock and at least one legal spot on the board -- resources alone aren't enough.
  const canBuildRoad =
    canAfford(me.resources, ROAD_COST) &&
    me.buildingStock.roads > 0 &&
    Object.values(clientState.board.edges).some((e) => canPlaceRoad(clientState.board, e.id, playerId))
  const canBuildSettlement =
    canAfford(me.resources, SETTLEMENT_COST) &&
    me.buildingStock.settlements > 0 &&
    Object.values(clientState.board.vertices).some((v) => canPlaceSettlement(clientState.board, v.id, playerId, true))
  const canBuildCity =
    canAfford(me.resources, CITY_COST) &&
    me.buildingStock.cities > 0 &&
    Object.values(clientState.board.vertices).some((v) => canUpgradeToCity(clientState.board, v.id, playerId))

  // Mirrors the condition under which the action-bar always shows at least one enabled (pulsing)
  // button, so the mobile "アクション" tab itself can pulse without the popup being open.
  const hasPendingAction = clientState.phase === 'PLAYING' && !pendingRobber && isMyTurn

  const selectableVertexIds = new Set<VertexId>()
  const selectableEdgeIds = new Set<EdgeId>()
  const selectableHexIds = new Set<HexId>()

  if (isMoveRobberStage) {
    for (const hexId of Object.keys(clientState.board.tiles)) {
      if (hexId !== clientState.board.robberHexId) selectableHexIds.add(hexId)
    }
  } else if (roadBuildingDevCardId) {
    if (!roadBuildingFirstEdge) {
      for (const edge of Object.values(clientState.board.edges)) {
        if (canPlaceRoad(clientState.board, edge.id, playerId)) selectableEdgeIds.add(edge.id)
      }
    } else {
      const virtualBoard = {
        ...clientState.board,
        edges: {
          ...clientState.board.edges,
          [roadBuildingFirstEdge]: { ...clientState.board.edges[roadBuildingFirstEdge], road: { playerId } },
        },
      }
      for (const edge of Object.values(clientState.board.edges)) {
        if (edge.id === roadBuildingFirstEdge) continue
        if (canPlaceRoad(virtualBoard, edge.id, playerId)) selectableEdgeIds.add(edge.id)
      }
    }
  } else if (isMySetupTurn) {
    if (awaitingRoadVertexId) {
      for (const edgeId of clientState.board.vertices[awaitingRoadVertexId].edgeIds) {
        if (!clientState.board.edges[edgeId].road) selectableEdgeIds.add(edgeId)
      }
      // still allow re-picking the settlement itself before the road is placed -- ignore the
      // just-placed settlement when checking the distance rule, matching the server's logic
      const virtualBoard = {
        ...clientState.board,
        vertices: {
          ...clientState.board.vertices,
          [awaitingRoadVertexId]: { ...clientState.board.vertices[awaitingRoadVertexId], building: null },
        },
      }
      for (const vertex of Object.values(clientState.board.vertices)) {
        if (vertex.id === awaitingRoadVertexId) continue
        if (canPlaceSettlement(virtualBoard, vertex.id, playerId, false)) selectableVertexIds.add(vertex.id)
      }
    } else {
      for (const vertex of Object.values(clientState.board.vertices)) {
        if (canPlaceSettlement(clientState.board, vertex.id, playerId, false)) selectableVertexIds.add(vertex.id)
      }
    }
  } else if (isMyTurn && clientState.turn?.hasRolled && !pendingRobber) {
    // Only highlight a mode's targets when the resources for it are actually there -- otherwise
    // a spot can look clickable (position is legal) while the server still rejects it for cost.
    if (buildMode === 'ROAD' && canBuildRoad) {
      for (const edge of Object.values(clientState.board.edges)) {
        if (canPlaceRoad(clientState.board, edge.id, playerId)) selectableEdgeIds.add(edge.id)
      }
    } else if (buildMode === 'SETTLEMENT' && canBuildSettlement) {
      for (const vertex of Object.values(clientState.board.vertices)) {
        if (canPlaceSettlement(clientState.board, vertex.id, playerId, true)) selectableVertexIds.add(vertex.id)
      }
    } else if (buildMode === 'CITY' && canBuildCity) {
      for (const vertex of Object.values(clientState.board.vertices)) {
        if (canUpgradeToCity(clientState.board, vertex.id, playerId)) selectableVertexIds.add(vertex.id)
      }
    }
  }

  function handleVertexClick(vertexId: VertexId) {
    if (isMySetupTurn) {
      socket.emit('place_setup_settlement', { vertexId }, (ack) => {
        if (!ack.ok) setLastError(ack.error)
      })
      return
    }
    // sound is played for everyone via the server's game_sound broadcast, not here
    if (buildMode === 'SETTLEMENT') {
      socket.emit('build_settlement', { vertexId }, (ack) => {
        if (!ack.ok) setLastError(ack.error)
        else setBuildMode('NONE')
      })
    } else if (buildMode === 'CITY') {
      socket.emit('build_city', { vertexId }, (ack) => {
        if (!ack.ok) setLastError(ack.error)
        else setBuildMode('NONE')
      })
    }
  }

  function handleEdgeClick(edgeId: EdgeId) {
    if (isMySetupTurn && awaitingRoadVertexId) {
      socket.emit('place_setup_road', { edgeId }, (ack) => {
        if (!ack.ok) setLastError(ack.error)
      })
      return
    }
    if (roadBuildingDevCardId) {
      if (!roadBuildingFirstEdge) {
        setRoadBuildingFirstEdge(edgeId)
        return
      }
      socket.emit(
        'play_dev_card',
        { devCardId: roadBuildingDevCardId, params: { edgeIds: [roadBuildingFirstEdge, edgeId] } },
        (ack) => {
          if (!ack.ok) setLastError(ack.error)
          setRoadBuildingDevCardId(null)
          setRoadBuildingFirstEdge(null)
        },
      )
      return
    }
    if (buildMode === 'ROAD') {
      socket.emit('build_road', { edgeId }, (ack) => {
        if (!ack.ok) setLastError(ack.error)
        else setBuildMode('NONE')
      })
    }
  }

  function handleHexClick(hexId: HexId) {
    if (!isMoveRobberStage) return
    socket.emit('move_robber', { hexId }, (ack) => {
      if (!ack.ok) setLastError(ack.error)
    })
  }

  function handleRollDice() {
    socket.emit('roll_dice', {}, (ack) => {
      if (!ack.ok) setLastError(ack.error)
    })
  }

  function handleEndTurn() {
    setBuildMode('NONE')
    setRoadBuildingDevCardId(null)
    setRoadBuildingFirstEdge(null)
    setMobilePopup(null)
    socket.emit('end_turn', {}, (ack) => {
      if (!ack.ok) setLastError(ack.error)
    })
  }

  // Each of these renders one self-contained group of the sidebar. They're called once for the
  // desktop sidebar (all groups inline) and once more inside whichever mobile popup is open
  // (grouped as 情報/アクション[手札を含む]/交易), so the two layouts never drift out of sync.
  function renderHelpButtonsSection() {
    return (
      <section className="help-buttons panel-section">
        <button type="button" onClick={() => setShowRules(true)}>
          📖 ゲーム説明
        </button>
        <button type="button" onClick={() => setShowCardHelp(true)}>
          🃏 カード説明
        </button>
      </section>
    )
  }

  function renderPlayerSummarySection() {
    return (
      <section className="player-summary-list panel-section">
        <h2>プレイヤー</h2>
        <ul>
          {[me, ...state.players].map((p) => (
            <li
              key={p.id}
              style={{ color: PLAYER_COLOR_HEX[p.color] }}
              className={state.turn?.currentPlayerId === p.id ? 'player-summary-list__current' : ''}
            >
              {p.isBot && '\u{1F916} '}
              {p.name}
              {state.turn?.currentPlayerId === p.id && ' ▶'}
              {' - 得点 '}
              {p.id === me.id ? me.totalVictoryPoints : p.visibleVictoryPoints}
              {' / 資源 '}
              {p.resourceCount}
              {' / 騎士 '}
              {p.knightsPlayed}
              {' / 道 '}
              {calculateLongestRoad(state.board, p.id)}
              {p.hasLongestRoad && <span className="title-badge title-badge--road">{'\u{1F6E3}'} 最長交易路</span>}
              {p.hasLargestArmy && <span className="title-badge title-badge--army">⚔ 最大騎士力</span>}
              {!p.connected && ' (切断中)'}
            </li>
          ))}
        </ul>
      </section>
    )
  }

  function renderBuildRecipesSection() {
    return (
      <section className="build-recipes panel-section">
        <h2>建築レシピ</h2>
        <ul>
          <li>道路: {formatCost(ROAD_COST)}</li>
          <li>開拓地: {formatCost(SETTLEMENT_COST)}</li>
          <li>都市: {formatCost(CITY_COST)}</li>
          <li>発展カード: {formatCost(DEV_CARD_COST)}</li>
        </ul>
      </section>
    )
  }

  function renderGameLogSection() {
    return (
      <section className="game-log panel-section">
        <h2>ログ</h2>
        <ul>
          {[...state.log]
            .reverse()
            .map((entry) => (
              <li key={entry.id}>{entry.message}</li>
            ))}
        </ul>
      </section>
    )
  }

  function renderInfoGroup() {
    return (
      <>
        {renderHelpButtonsSection()}
        {renderPlayerSummarySection()}
        {renderBuildRecipesSection()}
        {renderGameLogSection()}
      </>
    )
  }

  function renderHandGroup() {
    if (!me) return null
    return (
      <section className="hand-panel panel-section">
        <h2>手札 (合計 {totalResources(me.resources)}枚)</h2>
        <ul>
          <li>レンガ: {me.resources.BRICK}</li>
          <li>木材: {me.resources.LUMBER}</li>
          <li>羊毛: {me.resources.WOOL}</li>
          <li>麦: {me.resources.GRAIN}</li>
          <li>鉱石: {me.resources.ORE}</li>
        </ul>
      </section>
    )
  }

  // What the player should do right now -- kept separate from renderActionGroup() so it can sit
  // always-visible (between the tab buttons and the player list on mobile) rather than hidden
  // behind the アクション popup, since board-driven actions like setup placement or moving the
  // robber have no button of their own to surface an error next to.
  function renderStatusSection() {
    return (
      <>
        {lastError && <p className="error-text">{lastError}</p>}

        {isSetupPhase && (
          <p>
            {isMySetupTurn
              ? awaitingRoadVertexId
                ? '道路を置く場所を選んでください（開拓地はクリックし直せます）'
                : '開拓地を置く場所を選んでください'
              : '他のプレイヤーの初期配置を待っています…'}
          </p>
        )}

        {state.phase === 'PLAYING' && pendingRobber && (
          <section className="action-bar panel-section">
            {pendingRobber.stage === 'DISCARD' &&
              (myDiscardRequired > 0 ? <p>カードを{myDiscardRequired}枚捨ててください</p> : <p>他のプレイヤーの捨て札を待っています…</p>)}
            {pendingRobber.stage === 'MOVE_ROBBER' &&
              (isMoveRobberStage ? <p>盗賊を移動するタイルを選んでください</p> : <p>盗賊の移動を待っています…</p>)}
            {pendingRobber.stage === 'SELECT_TARGET' &&
              (isSelectTargetStage ? <p>誰から奪うか選んでください</p> : <p>盗賊の対象選択を待っています…</p>)}
          </section>
        )}
      </>
    )
  }

  function renderTradeGroup() {
    return state.phase === 'PLAYING' ? <TradePanel /> : null
  }

  function renderActionBarSection() {
    if (state.phase !== 'PLAYING' || pendingRobber) return null
    return (
      <section className="action-bar panel-section">
        {isMyTurn && !state.turn?.hasRolled && <button onClick={handleRollDice}>サイコロを振る</button>}
        {isMyTurn && state.turn?.hasRolled && (
          <>
            <button
              className={buildMode === 'ROAD' ? 'active' : ''}
              disabled={!canBuildRoad}
              onClick={() => setBuildMode(buildMode === 'ROAD' ? 'NONE' : 'ROAD')}
            >
              道路を建設
            </button>
            <button
              className={buildMode === 'SETTLEMENT' ? 'active' : ''}
              disabled={!canBuildSettlement}
              onClick={() => setBuildMode(buildMode === 'SETTLEMENT' ? 'NONE' : 'SETTLEMENT')}
            >
              開拓地を建設
            </button>
            <button
              className={buildMode === 'CITY' ? 'active' : ''}
              disabled={!canBuildCity}
              onClick={() => setBuildMode(buildMode === 'CITY' ? 'NONE' : 'CITY')}
            >
              都市に更新
            </button>
            <button onClick={handleEndTurn}>手番を終了</button>
          </>
        )}
        {!isMyTurn && <p>{state.players.find((p) => p.id === state.turn?.currentPlayerId)?.name ?? '相手'}の手番です</p>}
        <DiceRoller />
      </section>
    )
  }

  function renderDevCardSection() {
    if (state.phase !== 'PLAYING' || pendingRobber) return null
    return (
      <DevCardPanel
        roadBuildingDevCardId={roadBuildingDevCardId}
        onStartRoadBuilding={(devCardId) => {
          setBuildMode('NONE')
          setRoadBuildingDevCardId(devCardId)
          setRoadBuildingFirstEdge(null)
        }}
        onOpenYearOfPlenty={setYearOfPlentyDevCardId}
        onOpenMonopoly={setMonopolyDevCardId}
      />
    )
  }

  function renderGameOverSection() {
    if (state.phase !== 'GAME_OVER') return null
    return (
      <section className="game-over panel-section">
        <h2>ゲーム終了</h2>
      </section>
    )
  }

  function renderActionGroup() {
    return (
      <>
        {renderHandGroup()}
        {renderActionBarSection()}
        {renderDevCardSection()}
        {renderGameOverSection()}
      </>
    )
  }

  return (
    <div className={isMyTurn ? 'game-page game-page--my-turn' : 'game-page'}>
      {showTurnBanner && <div className="turn-banner">あなたの番です！</div>}
      {robBanner && <div className={`turn-banner turn-banner--${robBanner.variant}`}>{robBanner.text}</div>}
      <div className="action-toast-stack">
        {actionToasts.map((t) => (
          <div key={t.id} className="action-toast">
            {t.message}
          </div>
        ))}
      </div>
      {myDiscardRequired > 0 && <DiscardModal required={myDiscardRequired} />}
      {isSelectTargetStage && pendingRobber?.eligibleStealTargets && (
        <StealTargetModal eligiblePlayerIds={pendingRobber.eligibleStealTargets} />
      )}
      <IncomingTradeModal />
      <FinalizeTradeModal />
      {yearOfPlentyDevCardId && (
        <YearOfPlentyModal devCardId={yearOfPlentyDevCardId} onClose={() => setYearOfPlentyDevCardId(null)} />
      )}
      {monopolyDevCardId && <MonopolyModal devCardId={monopolyDevCardId} onClose={() => setMonopolyDevCardId(null)} />}
      {clientState.phase === 'GAME_OVER' && <GameOverModal />}
      {showRules && <GameRulesModal onClose={() => setShowRules(false)} />}
      {showCardHelp && <CardHelpModal onClose={() => setShowCardHelp(false)} />}

      <div className="game-page__board">
        <HexBoard
          board={clientState.board}
          playerColorById={playerColorById}
          selectableVertexIds={selectableVertexIds}
          selectableEdgeIds={selectableEdgeIds}
          selectableHexIds={selectableHexIds}
          highlightedNumber={rolledTotal}
          onVertexClick={handleVertexClick}
          onEdgeClick={handleEdgeClick}
          onHexClick={handleHexClick}
        />
      </div>

      {/* Desktop sidebar deliberately doesn't reuse renderInfoGroup()/renderActionGroup() --
          those are grouped for the mobile tab popups specifically. Desktop keeps its own,
          original section order here since the two layouts are independent designs. */}
      <aside className="game-page__sidebar">
        {renderHelpButtonsSection()}
        {renderPlayerSummarySection()}
        {renderHandGroup()}
        {renderBuildRecipesSection()}
        {renderStatusSection()}
        {renderActionBarSection()}
        {renderDevCardSection()}
        {renderTradeGroup()}
        {renderGameOverSection()}
        {renderGameLogSection()}
      </aside>

      <div className="mobile-portrait-tabs">
        <button
          type="button"
          className={hasPendingAction ? 'mobile-tab-bar__btn mobile-tab-bar__btn--actionable' : 'mobile-tab-bar__btn'}
          onClick={() => setMobilePopup('ACTION')}
        >
          🎲 アクション
        </button>
        <button type="button" className="mobile-tab-bar__btn" onClick={() => setMobilePopup('TRADE')}>
          🔄 交易
        </button>
      </div>

      <div className="mobile-portrait-status">{renderStatusSection()}</div>

      <div className="mobile-portrait-info">
        {renderPlayerSummarySection()}
        {renderBuildRecipesSection()}
        {renderGameLogSection()}
      </div>

      <div className="mobile-portrait-help">{renderHelpButtonsSection()}</div>

      <nav className="mobile-tab-bar">
        <button type="button" className="mobile-tab-bar__btn" onClick={() => setMobilePopup('INFO')}>
          📋 情報
        </button>
        <button type="button" className="mobile-tab-bar__btn" onClick={() => setMobilePopup('TRADE')}>
          🔄 交易
        </button>
        <button
          type="button"
          className={hasPendingAction ? 'mobile-tab-bar__btn mobile-tab-bar__btn--actionable' : 'mobile-tab-bar__btn'}
          onClick={() => setMobilePopup('ACTION')}
        >
          🎲 アクション
        </button>
      </nav>

      {mobilePopup === 'INFO' && (
        <InfoModal title="情報" onClose={() => setMobilePopup(null)}>
          {renderInfoGroup()}
        </InfoModal>
      )}
      {mobilePopup === 'TRADE' && (
        <InfoModal title="交易" onClose={() => setMobilePopup(null)}>
          {renderTradeGroup()}
        </InfoModal>
      )}
      {mobilePopup === 'ACTION' && (
        <InfoModal title="アクション" onClose={() => setMobilePopup(null)}>
          {renderStatusSection()}
          {renderActionGroup()}
        </InfoModal>
      )}
    </div>
  )
}
