import { socket } from '../../lib/socket'
import { useGameStore } from '../../hooks/useGameStore'

export function StealTargetModal({ eligiblePlayerIds }: { eligiblePlayerIds: string[] }) {
  const clientState = useGameStore((s) => s.clientState)
  const setLastError = useGameStore((s) => s.setLastError)
  if (!clientState) return null

  const candidates = clientState.players.filter((p) => eligiblePlayerIds.includes(p.id))

  function handleSteal(targetPlayerId: string) {
    socket.emit('steal_from', { targetPlayerId }, (ack) => {
      if (!ack.ok) setLastError(ack.error)
    })
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>誰から奪いますか？</h2>
        <div className="modal__button-list">
          {candidates.map((p) => (
            <button key={p.id} onClick={() => handleSteal(p.id)}>
              {p.name} (手札 {p.resourceCount}枚)
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
