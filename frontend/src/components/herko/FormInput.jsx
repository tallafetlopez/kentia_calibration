import React from 'react'

export default function FormInput({ label, name, value, onChange, error, required, placeholder, type = 'text', disabled, style }) {
  return (
    <div className="herko-form-group" style={style}>
      {label && (
        <label className="herko-label" htmlFor={name}>
          {label}{required && <span className="required">*</span>}
        </label>
      )}
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={`herko-input${error ? ' error' : ''}`}
      />
      {error && <p className="herko-error-msg">{error}</p>}
    </div>
  )
}
