import { useState } from 'react'
import type { ResourceHand, ResourceType } from '@catan-online/shared'
import { canAfford, RESOURCE_LABELS_JA as RESOURCE_LABELS } from '@catan-online/shared'
import { socket } from '../../lib/socket'
import { useGameStore } from '../../hooks/useGameStore'

function formatResources(hand: Partial<ResourceHand>): string {
  return (
    Object.entries(hand)
      .filter(([, amt]) => (amt ?? 0) > 0)
      .map(([res, amt]) => `${RESOURCE_LABELS[res as ResourceType]}${amt}`)
      .join('+') || '(なし)'
  )
}

/** Pops up for a proposal addressed to me that I haven't acted on yet -- the point is to make sure
 * an incoming offer is impossible to miss (the sidebar's trade list alone was too easy to overlook). */
export function IncomingTradeModal() {
  const clientState = useGameStore((s) => s.clientState)
  const playerId = useGameStore((s) => s.playerId)
  const setLastError = useGameStore((s) => s.setLastError)
  // Once I've responded, don't pop the same trade back up -- an open offer stays pending (waiting
  // on the proposer to pick a partner) even after I decline it, so this can't be derived from server state alone.
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())

  if (!clientState || !playerId) return null
  const me = clientState.me
  const pendingTrades = clientState.turn?.pendingTrades ?? []
  const trade = pendingTrades.find(
    (t) =>
      t.proposerId !== playerId &&
      (t.targetId === null || t.targetId === playerId) &&
      !t.acceptedBy.includes(playerId) &&
      !dismissedIds.has(t.id),
  )
  if (!trade || !me) return null

  const proposerName = clientState.players.find((p) => p.id === trade.proposerId)?.name ?? '相手'

  function respond(accept: boolean) {
    const tradeId = trade!.id
    socket.emit('respond_trade', { tradeId, accept }, (ack) => {
      if (!ack.ok) setLastError(ack.error)
    })
    setDismissedIds((prev) => new Set(prev).add(tradeId))
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>{proposerName}さんから交易の提案</h2>
        <p className="incoming-trade__detail">
          {formatResources(trade.give)} を渡すので {formatResources(trade.request)} をください
        </p>
        <div className="modal__button-list">
          <button disabled={!canAfford(me.resources, trade.request)} onClick={() => respond(true)}>
            承諾
          </button>
          <button onClick={() => respond(false)}>拒否</button>
        </div>
      </div>
    </div>
  )
}
