import React from 'react'

export default function Button({ variant = 'primary', size = 'md', disabled, onClick, children, type = 'button', style, className = '' }) {
  const sizeClass = size === 'sm' ? ' herko-btn-sm' : size === 'lg' ? ' herko-btn-lg' : ''
  return (
    <button
      type={type}
      className={`herko-btn herko-btn-${variant}${sizeClass} ${className}`}
      disabled={disabled}
      onClick={onClick}
      style={style}
    >
      {children}
    </button>
  )
}
