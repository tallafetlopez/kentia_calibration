import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { toast } from 'sonner'

// ── constants ──────────────────────────────────────────────────────────────
const STATE_CONFIG = {
  EDIT:              { label: 'Edit',              color: '#997755', bg: '#FFF8F0' },
  UNDER_APPROVAL:    { label: 'Under Approval',    color: '#FF8C00', bg: '#FFF5E6' },
  APPROVED:          { label: 'Approved',           color: '#107C10', bg: '#EFF7EF' },
  RELEASE_CANDIDATE: { label: 'Release Candidate', color: '#0078D4', bg: '#EBF3FB' },
  RELEASED:          { label: 'Released',           color: '#2D5016', bg: '#E8F4E8' },
  DEPRECATED:        { label: 'Deprecated',         color: '#D13438', bg: '#FDE8E8' },
}

const CONTEXT_COLORS = {
  PRODUCTION:       '#2D5016',
  VARIANT_SPECIFIC: '#0078D4',
  POST_SALES:       '#FF8C00',
  VIN_SPECIFIC:     '#7B2FBE',
  DEVELOPMENT:      '#999999',
}

const ROLE_STEPS = {
  Calibration_Engineer: [
    { text: 'Edit labels in your assigned datasets', to: '/herko/datasets?lifecycle_state=EDIT' },
    { text: 'Submit ready datasets for approval', to: '/herko/datasets?lifecycle_state=EDIT' },
    { text: 'Review label change justifications', to: '/herko/labels' },
  ],
  Configuration_Manager: [
    { text: 'Review datasets under approval', to: '/herko/datasets?lifecycle_state=UNDER_APPROVAL' },
    { text: 'Release approved datasets', to: '/herko/release-center' },
    { text: 'Manage SW releases & A2L files', to: '/herko/sw-releases' },
  ],
  PD_Verification_Validation_Engineer: [
    { text: 'Verify datasets under approval (VnV domain)', to: '/herko/datasets?lifecycle_state=UNDER_APPROVAL' },
    { text: 'Check traceability chain', to: '/herko/audit-log' },
  ],
  PI_Regulatory_Compliance_Specialist: [
    { text: 'Perform regulatory compliance review', to: '/herko/datasets?lifecycle_state=UNDER_APPROVAL' },
    { text: 'Audit regulatory approvals', to: '/herko/audit-log?entity_type=review' },
  ],
  PD_Project_Manager: [
    { text: 'Monitor dataset pipeline status', to: '/herko/datasets' },
    { text: 'Review release center', to: '/herko/release-center' },
    { text: 'Check audit log for activity', to: '/herko/audit-log' },
  ],
  Post_Sales_Engineer: [
    { text: 'Manage post-sales datasets', to: '/herko/datasets' },
    { text: 'Check VIN-specific assignments', to: '/herko/release-center' },
  ],
  DM_Administrator: [
    { text: 'Manage users and permissions', to: '/admin' },
    { text: 'Review full audit trail', to: '/herko/audit-log' },
  ],
}

function formatDate(raw) {
  if (!raw) return '—'
  const d = new Date(raw)
  if (isNaN(d)) return String(raw)
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function actionColor(action) {
  if (!action) return '#999'
  if (action.includes('APPROVED') || action.includes('RELEASED') || action.includes('CREATED')) return '#107C10'
  if (action.includes('REJECTED') || action.includes('DEPRECATED') || action.includes('DELETED')) return '#D13438'
  if (action.includes('REVIEW') || action.includes('SUBMITTED') || action.includes('TRANSITION')) return '#FF8C00'
  return '#0078D4'
}

// ── sub-components ─────────────────────────────────────────────────────────
function KpiCard({ title, children, style }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #E5E5E5', borderRadius: 6,
      padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', ...style,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 16 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function StateRow({ stateKey, count, onClick }) {
  const cfg = STATE_CONFIG[stateKey] || { label: stateKey, color: '#999', bg: '#F9F9F9' }
  return (
    <div
      onClick={() => count > 0 && onClick(stateKey)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 10px', borderRadius: 4, marginBottom: 4, cursor: count > 0 ? 'pointer' : 'default',
        background: cfg.bg, border: `1px solid ${cfg.color}22`,
        transition: 'opacity 0.15s',
      }}
      onMouseEnter={e => { if (count > 0) e.currentTarget.style.opacity = '0.8' }}
      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: '#3C3C3C', fontWeight: 500 }}>{cfg.label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: cfg.color }}>{count ?? 0}</span>
        {count > 0 && <span style={{ fontSize: 10, color: cfg.color }}>›</span>}
      </div>
    </div>
  )
}

function ActionRow({ label, count, to, navigate }) {
  if (count === 0) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '9px 0', borderBottom: '1px solid #F0F0F0',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#FF8C00' }} />
        <span style={{ fontSize: 13, color: '#3C3C3C' }}>{label}</span>
        <span style={{
          background: '#FF8C00', color: '#fff', borderRadius: 10,
          padding: '1px 7px', fontSize: 11, fontWeight: 700,
        }}>{count}</span>
      </div>
      <button
        className="herko-btn herko-btn-secondary herko-btn-sm"
        style={{ fontSize: 11 }}
        onClick={() => navigate(to)}
      >Open →</button>
    </div>
  )
}

function BarChart({ data, max }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {data.map(({ label, value, color }) => (
        <div key={label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 11, color: '#666' }}>{label}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color }}>{value}</span>
          </div>
          <div style={{ height: 8, background: '#F0F0F0', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 4, background: color,
              width: max > 0 ? `${Math.max(2, (value / max) * 100)}%` : '2%',
              transition: 'width 0.6s ease',
            }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function DonutChart({ slices, size = 120 }) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  if (total === 0) return <div style={{ textAlign: 'center', color: '#ccc', fontSize: 12 }}>No data</div>

  const cx = size / 2, cy = size / 2, r = size * 0.38, ir = size * 0.22
  let angle = -Math.PI / 2
  const paths = slices.map(s => {
    const sweep = (s.value / total) * 2 * Math.PI
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle)
    const x2 = cx + r * Math.cos(angle + sweep), y2 = cy + r * Math.sin(angle + sweep)
    const ix1 = cx + ir * Math.cos(angle), iy1 = cy + ir * Math.sin(angle)
    const ix2 = cx + ir * Math.cos(angle + sweep), iy2 = cy + ir * Math.sin(angle + sweep)
    const large = sweep > Math.PI ? 1 : 0
    const d = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${ir} ${ir} 0 ${large} 0 ${ix1} ${iy1} Z`
    angle += sweep
    return { ...s, d }
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        {paths.map(p => (
          <path key={p.label} d={p.d} fill={p.color} stroke="#fff" strokeWidth={1.5}>
            <title>{p.label}: {p.value}</title>
          </path>
        ))}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {slices.map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#555' }}>{s.label}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#3C3C3C', marginLeft: 4 }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ActivityEntry({ entry, navigate }) {
  const et = entry.entity_type || entry.entity || 'unknown'
  const eid = entry.entity_id || ''
  const did = entry.dataset_id

  function handleClick() {
    if (et === 'dataset') navigate(`/herko/datasets/${eid}`)
    else if (et === 'label') navigate(`/herko/datasets/${did || eid}`)
    else if (et === 'review') navigate(`/herko/datasets/${did || eid}/review`)
  }

  let details = ''
  if (entry.from_state && entry.to_state) details = `${entry.from_state} → ${entry.to_state}`
  else if (entry.previous_value != null && entry.new_value != null) details = `${entry.previous_value} → ${entry.new_value}`

  return (
    <div
      onClick={handleClick}
      style={{
        padding: '12px 16px', borderBottom: '1px solid #F0F0F0',
        cursor: 'pointer', transition: 'background 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = '#F9F9F9'}
      onMouseLeave={e => e.currentTarget.style.background = ''}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: actionColor(entry.action) + '20',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, fontSize: 12, color: actionColor(entry.action), fontWeight: 700,
        }}>
          {(entry.author || '?').slice(0, 1).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <span style={{ fontWeight: 600, fontSize: 12, color: '#3C3C3C' }}>{entry.author || 'system'}</span>
            <span style={{ fontSize: 11, color: '#999' }}>{formatDate(entry.date || entry.timestamp)}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: actionColor(entry.action) }}>{entry.action}</span>
            {eid && (
              <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#0078D4', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {eid}
              </span>
            )}
            {details && <span style={{ fontSize: 11, color: '#666' }}>{details}</span>}
          </div>
          {entry.justification && (
            <div style={{ fontSize: 11, color: '#888', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              "{entry.justification}"
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── main page ──────────────────────────────────────────────────────────────
export default function HerkoDashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [stats, setStats] = useState(null)
  const [activity, setActivity] = useState([])
  const [contextCounts, setContextCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    Promise.allSettled([
      api.get('/dashboard/stats'),
      api.get('/v1/traceability/audit-logs', { params: { limit: 8 } }),
      api.get('/datasets'),
    ]).then(([statsRes, auditRes, dsRes]) => {
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data)
      if (auditRes.status === 'fulfilled') setActivity(auditRes.value.data || [])
      if (dsRes.status === 'fulfilled') {
        const counts = {}
        ;(dsRes.value.data || []).forEach(ds => {
          const ctx = ds.deployment_context || 'UNKNOWN'
          counts[ctx] = (counts[ctx] || 0) + 1
        })
        setContextCounts(counts)
      }
      setLastRefresh(new Date())
    }).catch(() => toast.error('Failed to load dashboard')).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function handleStateClick(state) {
    navigate(`/herko/datasets?lifecycle_state=${state}`)
  }

  const byState = stats?.datasets_by_state || {}
  const totalDatasets = Object.values(byState).reduce((s, n) => s + n, 0)
  const maxStateCount = Math.max(...Object.values(byState), 1)

  // actions for current user
  const userRoles = user?.roles || []
  const isReviewer = userRoles.some(r => ['Configuration_Manager', 'PD_Verification_Validation_Engineer', 'PI_Regulatory_Compliance_Specialist'].includes(r))
  const isCfgMgr = userRoles.includes('Configuration_Manager')

  const pendingReviews = isReviewer ? (byState.UNDER_APPROVAL || 0) : 0
  const readyToRelease = isCfgMgr ? (byState.APPROVED || 0) : 0
  const hasAnyActions = pendingReviews + readyToRelease > 0

  // next steps by role
  const activeRole = user?.active_role || (userRoles[0] || '')
  const nextSteps = ROLE_STEPS[activeRole] || ROLE_STEPS[userRoles.find(r => ROLE_STEPS[r])] || ROLE_STEPS.PD_Project_Manager

  // bar chart by state
  const stateBarData = Object.entries(STATE_CONFIG).map(([k, cfg]) => ({
    label: cfg.label, value: byState[k] || 0, color: cfg.color,
  })).filter(x => x.value > 0)

  // donut by deployment context
  const contextSlices = Object.entries(contextCounts).map(([ctx, n]) => ({
    label: ctx.replace(/_/g, ' '), value: n, color: CONTEXT_COLORS[ctx] || '#999',
  })).sort((a, b) => b.value - a.value)

  return (
    <div style={{ padding: '0 0 48px 0' }}>
      {/* page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1A1A1A' }}>Dashboard</h1>
          <p style={{ margin: '4px 0 0', color: '#666', fontSize: 13 }}>
            Your view into calibration workflow status and actions
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {lastRefresh && (
            <span style={{ fontSize: 11, color: '#999' }}>
              Updated {lastRefresh.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            className="herko-btn herko-btn-secondary herko-btn-sm"
            onClick={load}
            disabled={loading}
          >{loading ? 'Loading…' : '↺ Refresh'}</button>
        </div>
      </div>

      {/* top row: 3 kpi cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>

        {/* card 1: datasets by state */}
        <KpiCard title="My Active Datasets">
          {loading ? <LoadingSkeleton /> : (
            <>
              {Object.keys(STATE_CONFIG).map(s => (
                <StateRow key={s} stateKey={s} count={byState[s] || 0} onClick={handleStateClick} />
              ))}
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #F0F0F0', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#888' }}>Total</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A' }}>{totalDatasets}</span>
              </div>
            </>
          )}
        </KpiCard>

        {/* card 2: actions */}
        <KpiCard title="Actions for You">
          {loading ? <LoadingSkeleton /> : !hasAnyActions ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#ccc' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
              <div style={{ fontSize: 13, color: '#888' }}>No pending actions</div>
            </div>
          ) : (
            <>
              <ActionRow label="Reviews awaiting" count={pendingReviews} to="/herko/datasets?lifecycle_state=UNDER_APPROVAL" navigate={navigate} />
              <ActionRow label="Datasets to release" count={readyToRelease} to="/herko/release-center" navigate={navigate} />
            </>
          )}
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #F0F0F0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
              Your next steps
            </div>
            {nextSteps.map((step, i) => (
              <div
                key={i}
                onClick={() => navigate(step.to)}
                style={{ display: 'flex', gap: 8, padding: '6px 0', cursor: 'pointer', alignItems: 'flex-start' }}
                onMouseEnter={e => e.currentTarget.style.color = '#2D5016'}
                onMouseLeave={e => e.currentTarget.style.color = ''}
              >
                <span style={{ color: '#2D5016', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{i + 1}.</span>
                <span style={{ fontSize: 12, color: '#3C3C3C', lineHeight: 1.4 }}>{step.text}</span>
              </div>
            ))}
          </div>
        </KpiCard>

        {/* card 3: system overview */}
        <KpiCard title="System Overview">
          {loading ? <LoadingSkeleton /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[
                { label: 'Total datasets', value: totalDatasets },
                { label: 'Released', value: (byState.RELEASED || 0) + (byState.RELEASE_CANDIDATE || 0) },
                { label: 'Vehicle SW IDs', value: stats?.vehicle_sw_ids ?? '—' },
                { label: 'SW Releases', value: stats?.software_releases_total ?? '—' },
                { label: 'SW Releases valid', value: stats?.software_releases_valid ?? '—' },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '9px 0', borderBottom: '1px solid #F0F0F0',
                }}>
                  <span style={{ fontSize: 13, color: '#555' }}>{label}</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#2D5016' }}>
                    {typeof value === 'number' ? value.toLocaleString() : value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </KpiCard>
      </div>

      {/* middle row: charts + activity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>

        {/* chart 1: by state bar */}
        <div style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: 6, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={sidebarTitle}>Datasets by State</div>
          {loading ? <LoadingSkeleton /> : <BarChart data={stateBarData} max={maxStateCount} />}
        </div>

        {/* chart 2: by context donut */}
        <div style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: 6, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={sidebarTitle}>By Deployment Context</div>
          {loading ? <LoadingSkeleton /> : <DonutChart slices={contextSlices} size={120} />}
        </div>

        {/* quick actions */}
        <div style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: 6, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={sidebarTitle}>Quick Actions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: '+ New Dataset', to: '/herko/datasets/create', primary: true },
              { label: '📁 Labels Manager', to: '/herko/labels' },
              { label: '📋 Release Center', to: '/herko/release-center' },
              { label: '🔍 Audit Log', to: '/herko/audit-log' },
              { label: '🚀 SW Releases', to: '/herko/sw-releases' },
            ].map(({ label, to, primary }) => (
              <button
                key={to}
                className={`herko-btn ${primary ? 'herko-btn-primary' : 'herko-btn-secondary'}`}
                style={{ width: '100%', textAlign: 'left', justifyContent: 'flex-start' }}
                onClick={() => navigate(to)}
              >{label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* bottom: recent activity */}
      <div style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: 6, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E5E5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={sidebarTitle}>Recent Activity</span>
          <button
            className="herko-btn herko-btn-secondary herko-btn-sm"
            onClick={() => navigate('/herko/audit-log')}
          >View All Audit Log →</button>
        </div>
        {loading ? (
          <div style={{ padding: 24 }}><LoadingSkeleton lines={4} /></div>
        ) : activity.length === 0 ? (
          <div className="herko-empty">No recent activity found.</div>
        ) : (
          activity.slice(0, 8).map((entry, i) => (
            <ActivityEntry key={entry.id || i} entry={entry} navigate={navigate} />
          ))
        )}
      </div>
    </div>
  )
}

// ── helpers ────────────────────────────────────────────────────────────────
function LoadingSkeleton({ lines = 3 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} style={{
          height: 16, borderRadius: 4, background: '#F0F0F0',
          width: `${60 + (i * 13) % 40}%`, animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      ))}
    </div>
  )
}

const sidebarTitle = { fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14 }
