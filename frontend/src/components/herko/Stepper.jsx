import React from 'react'

export default function Stepper({ steps, currentStep }) {
  return (
    <div className="herko-stepper">
      {steps.map((step, i) => {
        const status = i + 1 < currentStep ? 'completed' : i + 1 === currentStep ? 'active' : 'inactive'
        return (
          <React.Fragment key={step.label}>
            <div className="herko-step">
              <div className={`herko-step-circle ${status}`}>
                {status === 'completed' ? '✓' : i + 1}
              </div>
              <span className={`herko-step-label ${status === 'inactive' ? 'inactive' : ''}`}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`herko-step-connector ${status === 'completed' ? 'completed' : 'inactive'}`} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
