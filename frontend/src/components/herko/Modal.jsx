import React, { useEffect } from 'react'

export default function Modal({ isOpen, onClose, title, children, actions = [] }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    if (isOpen) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="herko-modal-backdrop" onClick={onClose}>
      <div className="herko-modal" onClick={e => e.stopPropagation()}>
        <button className="herko-modal-close" onClick={onClose}>✕</button>
        {title && <h3 className="herko-modal-title">{title}</h3>}
        {children}
        {actions.length > 0 && (
          <div className="herko-modal-actions">
            {actions.map(a => (
              <button
                key={a.label}
                className={`herko-btn herko-btn-${a.variant || 'secondary'}`}
                onClick={a.onClick}
              >{a.label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
