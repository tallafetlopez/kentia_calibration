import React from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../lib/auth'

const NAV_ITEMS = [
  { to: '/herko/dashboard', label: 'Dashboard' },
  { to: '/herko/datasets', label: 'Datasets' },
  { to: '/herko/sw-releases', label: 'SW Releases' },
  { to: '/herko/release-center', label: 'Release Center' },
  { to: '/herko/labels', label: 'Labels' },
  { to: '/herko/traceability', label: 'Traceability' },
  { to: '/herko/audit-log', label: 'Audit Log' },
  { to: '/work-packages', label: 'WorkPackages' },
  { to: '/admin', label: 'Admin' },
]

export default function Header() {
  const { user, logout } = useAuth()
  const initials = user?.name?.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase() || 'U'

  return (
    <header className="herko-header">
      <NavLink to="/herko/datasets" className="herko-header-logo">
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="2" fill="rgba(255,255,255,0.2)"/>
          <path d="M8 8h4v16H8zM20 8h4v16h-4zM8 14h16v4H8z" fill="white"/>
        </svg>
        HERKO Calibration
      </NavLink>
      <nav className="herko-nav">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `herko-nav-link${isActive ? ' active' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="herko-header-user">
        <div className="herko-avatar">{initials}</div>
        <span style={{ fontSize: 13 }}>{user?.name || 'User'}</span>
        <button
          onClick={logout}
          style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: 3, cursor: 'pointer', fontSize: 12, marginLeft: 8 }}
        >
          Logout
        </button>
      </div>
    </header>
  )
}
