import { useState } from 'react'
import type { ResourceHand, ResourceType } from '@catan-online/shared'
import { totalResources, RESOURCE_LABELS_JA as RESOURCE_LABELS } from '@catan-online/shared'
import { socket } from '../../lib/socket'
import { useGameStore } from '../../hooks/useGameStore'

const RESOURCES: ResourceType[] = ['BRICK', 'LUMBER', 'WOOL', 'GRAIN', 'ORE']

export function GoldPickModal({ owed }: { owed: number }) {
  const setLastError = useGameStore((s) => s.setLastError)
  const [selected, setSelected] = useState<Record<ResourceType, number>>({ BRICK: 0, LUMBER: 0, WOOL: 0, GRAIN: 0, ORE: 0 })
  const selectedTotal = totalResources(selected as ResourceHand)

  function adjust(res: ResourceType, delta: number) {
    setSelected((prev) => ({ ...prev, [res]: Math.max(0, prev[res] + delta) }))
  }

  function handleSubmit() {
    const resources = Object.fromEntries(Object.entries(selected).filter(([, v]) => v > 0)) as Partial<ResourceHand>
    socket.emit('select_gold_resources', { resources }, (ack) => {
      if (!ack.ok) setLastError(ack.error)
    })
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>
          金鉱から選ぶ ({selectedTotal}/{owed})
        </h2>
        <p>銀行から好きな資源を{owed}枚選んでください。</p>
        {RESOURCES.map((res) => (
          <div key={res} className="resource-picker__row">
            <span>{RESOURCE_LABELS[res]}</span>
            <button type="button" onClick={() => adjust(res, -1)}>
              -
            </button>
            <span>{selected[res]}</span>
            <button type="button" onClick={() => adjust(res, 1)}>
              +
            </button>
          </div>
        ))}
        <button disabled={selectedTotal !== owed} onClick={handleSubmit}>
          決定
        </button>
      </div>
    </div>
  )
}
