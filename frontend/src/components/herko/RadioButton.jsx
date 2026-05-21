import React from 'react'

export default function RadioButton({ label, value, checked, onChange, name, disabled }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: '#3C3C3C' }}>
      <input type="radio" className="herko-radio" name={name} value={value} checked={checked} onChange={onChange} disabled={disabled} />
      {label}
    </label>
  )
}
