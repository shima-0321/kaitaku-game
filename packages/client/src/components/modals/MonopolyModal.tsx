import type { ResourceType } from '@catan-online/shared'
import { RESOURCE_LABELS_JA as RESOURCE_LABELS } from '@catan-online/shared'
import { socket } from '../../lib/socket'
import { useGameStore } from '../../hooks/useGameStore'

const RESOURCES: ResourceType[] = ['BRICK', 'LUMBER', 'WOOL', 'GRAIN', 'ORE']

export function MonopolyModal({ devCardId, onClose }: { devCardId: string; onClose: () => void }) {
  const setLastError = useGameStore((s) => s.setLastError)

  function handleSelect(resource: ResourceType) {
    socket.emit('play_dev_card', { devCardId, params: { resource } }, (ack) => {
      if (!ack.ok) setLastError(ack.error)
      else onClose()
    })
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>独占する資源を選んでください</h2>
        <div className="modal__button-list">
          {RESOURCES.map((res) => (
            <button key={res} onClick={() => handleSelect(res)}>
              {RESOURCE_LABELS[res]}
            </button>
          ))}
        </div>
        <button onClick={onClose}>キャンセル</button>
      </div>
    </div>
  )
}
