import { useNavigate } from 'react-router-dom'
import type { DevCardType, ScoreBreakdown } from '@catan-online/shared'
import { RESOURCE_LABELS_JA, DEV_CARD_LABELS_JA } from '@catan-online/shared'
import { useGameStore } from '../../hooks/useGameStore'
import { socket } from '../../lib/socket'
import { PLAYER_COLOR_HEX } from '../../lib/colors'

function formatBreakdown(b: ScoreBreakdown): string {
  const parts: string[] = []
  if (b.settlements > 0) parts.push(`開拓地${b.settlements}(${b.settlements}点)`)
  if (b.cities > 0) parts.push(`都市${b.cities}(${b.cities * 2}点)`)
  if (b.hasLongestRoad) parts.push('最長交易路(2点)')
  if (b.hasLargestArmy) parts.push('最大騎士力(2点)')
  if (b.victoryPointCards > 0) parts.push(`勝利点カード${b.victoryPointCards}(${b.victoryPointCards}点)`)
  return parts.join(' + ') || 'なし'
}

export function GameOverModal() {
  const clientState = useGameStore((s) => s.clientState)
  const gameOverPayload = useGameStore((s) => s.gameOverPayload)
  const playerId = useGameStore((s) => s.playerId)
  const reset = useGameStore((s) => s.reset)
  const navigate = useNavigate()
  if (!clientState) return null

  const winnerId = gameOverPayload?.winnerId ?? clientState.winnerId
  const allPlayers = [clientState.me, ...clientState.players]
  const nameById = Object.fromEntries(allPlayers.map((p) => [p.id, p.name]))
  const winnerName = winnerId ? (nameById[winnerId] ?? '不明') : '不明'
  const isHost = clientState.hostPlayerId === playerId

  const scores: { playerId: string; points: number; breakdown?: ScoreBreakdown }[] =
    gameOverPayload?.finalScores ?? allPlayers.map((p) => ({ playerId: p.id, points: p.visibleVictoryPoints }))
  const sortedScores = [...scores].sort((a, b) => b.points - a.points)

  function handleRematch() {
    socket.emit('rematch', {}, () => {})
  }

  function handleBackToTitle() {
    socket.emit('leave_room', {}, () => {})
    reset()
    navigate('/')
  }

  return (
    <div className="game-over-overlay">
      <div className="modal game-over-modal">
        <h2>🎉 {winnerName} の勝利！</h2>
        <ul className="game-over-modal__scores">
          {sortedScores.map((s) => (
            <li key={s.playerId} className={s.playerId === winnerId ? 'winner' : ''}>
              <div className="game-over-modal__score-row">
                <span>{nameById[s.playerId] ?? '不明'}</span>
                <span>{s.points}点</span>
              </div>
              {s.breakdown && <div className="game-over-modal__score-breakdown">{formatBreakdown(s.breakdown)}</div>}
            </li>
          ))}
        </ul>

        <div className="game-over-modal__stats">
          {allPlayers.map((p) => {
            const usedCards = Object.entries(p.stats.devCardsUsed).filter(([, n]) => n > 0)
            return (
              <div key={p.id} className="game-over-modal__player-stats">
                <h3 style={{ color: PLAYER_COLOR_HEX[p.color] }}>{p.name}</h3>
                <ul>
                  <li>開拓地: {p.stats.settlementsBuilt}</li>
                  <li>都市: {p.stats.citiesBuilt}</li>
                  <li>道路: {p.stats.roadsBuilt}</li>
                  <li>
                    獲得資源:{' '}
                    {(Object.keys(p.stats.resourcesGained) as (keyof typeof p.stats.resourcesGained)[])
                      .map((res) => `${RESOURCE_LABELS_JA[res]}${p.stats.resourcesGained[res]}`)
                      .join(' ')}
                  </li>
                  <li>発展カード購入: {p.stats.devCardsBought}枚</li>
                  <li>
                    使用した発展カード:{' '}
                    {usedCards.length > 0
                      ? usedCards.map(([type, n]) => `${DEV_CARD_LABELS_JA[type as DevCardType]}${n}`).join(' ')
                      : 'なし'}
                  </li>
                </ul>
              </div>
            )
          })}
        </div>

        <div className="game-over-modal__actions">
          {isHost && <button onClick={handleRematch}>次のマップへ</button>}
          <button onClick={handleBackToTitle}>タイトルに戻る</button>
        </div>
      </div>
    </div>
  )
}
