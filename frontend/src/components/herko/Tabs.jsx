import React from 'react'

export default function Tabs({ tabs, activeTab, onTabChange }) {
  return (
    <div className="herko-tabs">
      {tabs.map(tab => (
        <button
          key={tab.key}
          className={`herko-tab${activeTab === tab.key ? ' active' : ''}`}
          onClick={() => onTabChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
