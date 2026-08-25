import { socket } from '../../lib/socket'
import { useGameStore } from '../../hooks/useGameStore'
import { DEV_CARD_COST, canAfford, DEV_CARD_LABELS_JA as DEV_CARD_LABELS } from '@catan-online/shared'

export interface DevCardPanelProps {
  roadBuildingDevCardId: string | null
  onStartRoadBuilding: (devCardId: string) => void
  onOpenYearOfPlenty: (devCardId: string) => void
  onOpenMonopoly: (devCardId: string) => void
  onPlayKnight: () => void
}

export function DevCardPanel({
  roadBuildingDevCardId,
  onStartRoadBuilding,
  onOpenYearOfPlenty,
  onOpenMonopoly,
  onPlayKnight,
}: DevCardPanelProps) {
  const clientState = useGameStore((s) => s.clientState)
  const playerId = useGameStore((s) => s.playerId)
  const setLastError = useGameStore((s) => s.setLastError)

  if (!clientState || !playerId) return null
  const me = clientState.me
  const isMyTurn = clientState.phase === 'PLAYING' && clientState.turn?.currentPlayerId === playerId
  const specialBuild = clientState.turn?.specialBuild ?? null
  const isMySpecialBuildTurn = specialBuild?.activePlayerId === playerId
  // Buying is also allowed during your own special-build slot; playing a card never is (for anyone).
  const canBuyNow = specialBuild ? isMySpecialBuildTurn : isMyTurn && !!clientState.turn?.hasRolled
  const canPlayAny = isMyTurn && !specialBuild && !!clientState.turn?.hasRolled && !clientState.turn.pendingRobber && !clientState.turn.devCardPlayedThisTurn

  function handleBuy() {
    socket.emit('buy_dev_card', {}, (ack) => {
      if (!ack.ok) setLastError(ack.error)
    })
  }

  function handlePlayKnight(devCardId: string) {
    onPlayKnight()
    // sound is played for everyone via the server's knight_played broadcast, not here
    socket.emit('play_dev_card', { devCardId }, (ack) => {
      if (!ack.ok) setLastError(ack.error)
    })
  }

  const unusedCards = me.devCards.filter((c) => !c.used)

  return (
    <section className="dev-card-panel panel-section">
      <h2>発展カード ({me.devCards.filter((c) => c.used).length + unusedCards.length}枚所持)</h2>
      <button disabled={!canAfford(me.resources, DEV_CARD_COST) || !canBuyNow} onClick={handleBuy}>
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
