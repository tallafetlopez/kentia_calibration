import React from 'react'

const LABELS = {
  EDIT: 'EDIT',
  UNDER_APPROVAL: 'APP',
  APP: 'APP',
  RELEASE_CANDIDATE: 'RC',
  RC: 'RC',
  RELEASED: 'REL',
  REL: 'REL',
  DEPRECATED: 'DEP',
  DEP: 'DEP',
  DRAFT: 'DRAFT',
}

export default function StateBadge({ state }) {
  const label = LABELS[state] || state
  return (
    <span className={`herko-badge herko-badge-${state}`}>
      {label}
    </span>
  )
}
