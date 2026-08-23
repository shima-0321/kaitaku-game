import { useState } from 'react'
import type { ResourceHand, ResourceType } from '@catan-online/shared'
import { totalResources, RESOURCE_LABELS_JA as RESOURCE_LABELS } from '@catan-online/shared'
import { socket } from '../../lib/socket'
import { useGameStore } from '../../hooks/useGameStore'

const RESOURCES: ResourceType[] = ['BRICK', 'LUMBER', 'WOOL', 'GRAIN', 'ORE']

export function YearOfPlentyModal({ devCardId, onClose }: { devCardId: string; onClose: () => void }) {
  const setLastError = useGameStore((s) => s.setLastError)
  const [selected, setSelected] = useState<Record<ResourceType, number>>({ BRICK: 0, LUMBER: 0, WOOL: 0, GRAIN: 0, ORE: 0 })
  const selectedTotal = totalResources(selected as ResourceHand)

  function adjust(res: ResourceType, delta: number) {
    setSelected((prev) => ({ ...prev, [res]: Math.max(0, prev[res] + delta) }))
  }

  function handleSubmit() {
    const resources = Object.fromEntries(Object.entries(selected).filter(([, v]) => v > 0)) as Partial<ResourceHand>
    socket.emit('play_dev_card', { devCardId, params: { resources } }, (ack) => {
      if (!ack.ok) setLastError(ack.error)
      else onClose()
    })
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>発明 ({selectedTotal}/2)</h2>
        <p>銀行から好きな資源を2枚選んでください。</p>
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
        <button disabled={selectedTotal !== 2} onClick={handleSubmit}>
          決定
        </button>
        <button onClick={onClose}>キャンセル</button>
      </div>
    </div>
  )
}
