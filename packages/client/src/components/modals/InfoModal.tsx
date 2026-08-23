import type { ReactNode } from 'react'

export function InfoModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal info-modal" onClick={(e) => e.stopPropagation()}>
        <div className="info-modal__header">
          <h2>{title}</h2>
          <button type="button" className="info-modal__close" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>
        <div className="info-modal__body">{children}</div>
      </div>
    </div>
  )
}
