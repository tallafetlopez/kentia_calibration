import React from 'react'

export default function Checkbox({ label, checked, onChange, name, disabled }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: '#3C3C3C' }}>
      <input type="checkbox" className="herko-checkbox" name={name} checked={checked} onChange={onChange} disabled={disabled} />
      {label}
    </label>
  )
}
