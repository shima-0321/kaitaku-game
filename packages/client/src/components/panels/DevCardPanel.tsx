import { socket } from '../../lib/socket'
import { useGameStore } from '../../hooks/useGameStore'
import { DEV_CARD_COST, canAfford } from '@catan-online/shared'
import type { DevCardType } from '@catan-online/shared'

const DEV_CARD_LABELS: Record<DevCardType, string> = {
  KNIGHT: '騎士',
  ROAD_BUILDING: '街道建設',
  YEAR_OF_PLENTY: '発明',
  MONOPOLY: '独占',
  VICTORY_POINT: '勝利点',
}

export interface DevCardPanelProps {
  roadBuildingDevCardId: string | null
  onStartRoadBuilding: (devCardId: string) => void
  onOpenYearOfPlenty: (devCardId: string) => void
  onOpenMonopoly: (devCardId: string) => void
}

export function DevCardPanel({ roadBuildingDevCardId, onStartRoadBuilding, onOpenYearOfPlenty, onOpenMonopoly }: DevCardPanelProps) {
  const clientState = useGameStore((s) => s.clientState)
  const playerId = useGameStore((s) => s.playerId)
  const setLastError = useGameStore((s) => s.setLastError)

  if (!clientState || !playerId) return null
  const me = clientState.me
  const isMyTurn = clientState.phase === 'PLAYING' && clientState.turn?.currentPlayerId === playerId
  const canPlayAny = isMyTurn && !!clientState.turn?.hasRolled && !clientState.turn.pendingRobber && !clientState.turn.devCardPlayedThisTurn

  function handleBuy() {
    socket.emit('buy_dev_card', {}, (ack) => {
      if (!ack.ok) setLastError(ack.error)
    })
  }

  function handlePlayKnight(devCardId: string) {
    // sound is played for everyone via the server's knight_played broadcast, not here
    socket.emit('play_dev_card', { devCardId }, (ack) => {
      if (!ack.ok) setLastError(ack.error)
    })
  }

  const unusedCards = me.devCards.filter((c) => !c.used)

  return (
    <section className="dev-card-panel">
      <h2>発展カード ({me.devCards.filter((c) => c.used).length + unusedCards.length}枚所持)</h2>
      <button disabled={!canAfford(me.resources, DEV_CARD_COST) || !isMyTurn || !clientState.turn?.hasRolled} onClick={handleBuy}>
        購入する
      </button>

      {unusedCards.length > 0 && (
        <ul className="dev-card-panel__list">
          {unusedCards.map((card) => {
            const boughtThisTurn = card.boughtOnTurn === clientState.turn?.turnNumber
            const playable = canPlayAny && !boughtThisTurn && card.type !== 'VICTORY_POINT'
            return (
              <li key={card.id}>
                <span>{DEV_CARD_LABELS[card.type]}</span>
                {card.type === 'KNIGHT' && (
                  <button disabled={!playable} onClick={() => handlePlayKnight(card.id)}>
                    使う
                  </button>
                )}
                {card.type === 'ROAD_BUILDING' && (
                  <button disabled={!playable || roadBuildingDevCardId !== null} onClick={() => onStartRoadBuilding(card.id)}>
                    {roadBuildingDevCardId === card.id ? '道路を選択中…' : '使う'}
                  </button>
                )}
                {card.type === 'YEAR_OF_PLENTY' && (
                  <button disabled={!playable} onClick={() => onOpenYearOfPlenty(card.id)}>
                    使う
                  </button>
                )}
                {card.type === 'MONOPOLY' && (
                  <button disabled={!playable} onClick={() => onOpenMonopoly(card.id)}>
                    使う
                  </button>
                )}
                {card.type === 'VICTORY_POINT' && <span>(非公開の得点)</span>}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
