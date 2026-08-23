import { socket } from '../../lib/socket'
import { useGameStore } from '../../hooks/useGameStore'

/** Pops up for the proposer once at least one player has accepted their open trade -- an open offer
 * never settles on its own (someone else might still accept), so this is how the proposer picks who
 * to actually trade with. Not shown for targeted (1:1) offers: those settle automatically on accept,
 * since there's only ever one possible partner and nothing to choose between. */
export function FinalizeTradeModal() {
  const clientState = useGameStore((s) => s.clientState)
  const playerId = useGameStore((s) => s.playerId)
  const setLastError = useGameStore((s) => s.setLastError)

  if (!clientState || !playerId) return null
  const trade = (clientState.turn?.pendingTrades ?? []).find((t) => t.proposerId === playerId && t.acceptedBy.length > 0)
  if (!trade) return null

  function finalize(withPlayerId: string) {
    socket.emit('finalize_trade', { tradeId: trade!.id, withPlayerId }, (ack) => {
      if (!ack.ok) setLastError(ack.error)
    })
  }

  const accepters = trade.acceptedBy
    .map((id) => clientState!.players.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p)

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>交易の相手を選んでください</h2>
        <p className="incoming-trade__detail">この提案を承諾したのは{accepters.length}人です。誰と成立させますか？</p>
        <div className="modal__button-list">
          {accepters.map((p) => (
            <button key={p.id} onClick={() => finalize(p.id)}>
              {p.name}さんと成立させる
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
