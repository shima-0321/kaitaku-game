import { useState } from 'react'
import type { ResourceHand, ResourceType } from '@catan-online/shared'
import { totalResources, RESOURCE_LABELS_JA as RESOURCE_LABELS } from '@catan-online/shared'
import { socket } from '../../lib/socket'
import { useGameStore } from '../../hooks/useGameStore'

const RESOURCES: ResourceType[] = ['BRICK', 'LUMBER', 'WOOL', 'GRAIN', 'ORE']

export function DiscardModal({ required }: { required: number }) {
  const clientState = useGameStore((s) => s.clientState)
  const setLastError = useGameStore((s) => s.setLastError)
  const [selected, setSelected] = useState<Record<ResourceType, number>>({ BRICK: 0, LUMBER: 0, WOOL: 0, GRAIN: 0, ORE: 0 })

  if (!clientState) return null
  const me = clientState.me
  const selectedTotal = totalResources(selected as ResourceHand)

  function adjust(res: ResourceType, delta: number) {
    setSelected((prev) => {
      const next = Math.max(0, Math.min(me.resources[res], prev[res] + delta))
      return { ...prev, [res]: next }
    })
  }

  function handleSubmit() {
    const resources = Object.fromEntries(Object.entries(selected).filter(([, v]) => v > 0)) as Partial<ResourceHand>
    socket.emit('select_discard', { resources }, (ack) => {
      if (!ack.ok) setLastError(ack.error)
    })
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>
          カードを捨てる ({selectedTotal}/{required})
        </h2>
        <p>手札が8枚以上のため、半分を捨てる必要があります。</p>
        {RESOURCES.map((res) => (
          <div key={res} className="resource-picker__row">
            <span>
              {RESOURCE_LABELS[res]} (所持: {me.resources[res]})
            </span>
            <button type="button" onClick={() => adjust(res, -1)}>
              -
            </button>
            <span>{selected[res]}</span>
            <button type="button" onClick={() => adjust(res, 1)} disabled={selected[res] >= me.resources[res]}>
              +
            </button>
          </div>
        ))}
        <button disabled={selectedTotal !== required} onClick={handleSubmit}>
          捨てる
        </button>
      </div>
    </div>
  )
}
