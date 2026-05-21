import React from 'react'

export default function FormSelect({ label, name, value, onChange, options = [], error, required, disabled, style }) {
  return (
    <div className="herko-form-group" style={style}>
      {label && (
        <label className="herko-label" htmlFor={name}>
          {label}{required && <span className="required">*</span>}
        </label>
      )}
      <select
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`herko-select${error ? ' error' : ''}`}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && <p className="herko-error-msg">{error}</p>}
    </div>
  )
}
