import React from 'react'

export default function Card({ children, className = '', padding, style }) {
  return (
    <div
      className={`herko-card ${className}`}
      style={{ ...(padding ? { padding } : {}), ...style }}
    >
      {children}
    </div>
  )
}
