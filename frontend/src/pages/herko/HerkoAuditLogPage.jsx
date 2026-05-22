import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { toast } from 'sonner'

// ── constants ──────────────────────────────────────────────────────────────
const ENTITY_TYPES = ['label', 'dataset', 'review', 'vehicle_sw_id', 'sw_release', 'approval', 'system']
const PER_PAGE_OPTIONS = [10, 25, 50, 100]

const ENTITY_COLORS = {
  label: '#0078D4',
  dataset: '#2D5016',
  review: '#FF8C00',
  vehicle_sw_id: '#7B2FBE',
  sw_release: '#00627A',
  approval: '#106EBE',
  system: '#999999',
}

const ACTION_COLORS = {
  CREATED: '#2D5016',
  LABEL_UPDATED: '#0078D4',
  APPROVED: '#107C10',
  RELEASED: '#107C10',
  REJECTED: '#D13438',
  DEPRECATED: '#A80000',
  REVIEWED: '#FF8C00',
  SUBMITTED_FOR_APPROVAL: '#FF8C00',
  DELETED: '#D13438',
  RENAMED: '#605E5C',
}

function actionColor(action) {
  for (const [key, color] of Object.entries(ACTION_COLORS)) {
    if (action && action.includes(key)) return color
  }
  return '#605E5C'
}

function formatDate(raw) {
  if (!raw) return '—'
  const d = new Date(raw)
  if (isNaN(d)) return String(raw)
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function defaultFrom() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

function defaultTo() {
  return new Date().toISOString().slice(0, 10)
}

// ── sub-components ─────────────────────────────────────────────────────────
function EntityBadge({ type }) {
  const color = ENTITY_COLORS[type] || '#999'
  return (
    <span style={{
      background: color, color: '#fff', borderRadius: 3,
      padding: '2px 7px', fontSize: 11, fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap',
    }}>{type || '—'}</span>
  )
}

function ActionCell({ action }) {
  return (
    <span style={{ color: actionColor(action), fontWeight: 600, fontSize: 12 }}>
      {action || '—'}
    </span>
  )
}

function DetailsCell({ entry }) {
  if (entry.from_state && entry.to_state) {
    return (
      <span style={{ fontSize: 12, color: '#3C3C3C' }}>
        <span style={{ color: '#999' }}>{entry.from_state}</span>
        {' → '}
        <span style={{ color: actionColor(entry.action) }}>{entry.to_state}</span>
      </span>
    )
  }
  if (entry.previous_value !== null && entry.previous_value !== undefined && entry.new_value !== undefined) {
    const prev = String(entry.previous_value ?? '—').slice(0, 20)
    const next = String(entry.new_value ?? '—').slice(0, 20)
    return (
      <span style={{ fontSize: 12, color: '#3C3C3C' }}>
        <span style={{ color: '#999' }}>{prev}</span>
        {' → '}
        <span style={{ color: actionColor(entry.action) }}>{next}</span>
      </span>
    )
  }
  return <span style={{ color: '#ccc', fontSize: 12 }}>—</span>
}

function VehicleModal({ entry, onClose }) {
  const fields = {
    'Entity ID': entry.entity_id,
    'Dataset ID': entry.dataset_id,
    'Author': entry.author,
    'Date': formatDate(entry.date),
    'Action': entry.action,
    'Justification': entry.justification,
    ...(entry.extra || {}),
  }
  return (
    <div className="herko-modal-backdrop" onClick={onClose}>
      <div className="herko-modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <button className="herko-modal-close" onClick={onClose}>✕</button>
        <div className="herko-modal-title">Vehicle SW ID Details</div>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <tbody>
            {Object.entries(fields).filter(([, v]) => v != null && v !== '').map(([k, v]) => (
              <tr key={k}>
                <td style={{ padding: '6px 8px', fontWeight: 600, color: '#666', width: 160, borderBottom: '1px solid #eee' }}>{k}</td>
                <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee', wordBreak: 'break-all' }}>{String(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="herko-modal-actions">
          <button className="herko-btn herko-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ── main page ──────────────────────────────────────────────────────────────
export default function HerkoAuditLogPage() {
  const navigate = useNavigate()

  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [authors, setAuthors] = useState([])

  // filters
  const [fromDate, setFromDate] = useState(defaultFrom())
  const [toDate, setToDate] = useState(defaultTo())
  const [entityTypeFilters, setEntityTypeFilters] = useState([])
  const [actionFilters, setActionFilters] = useState([])
  const [authorFilter, setAuthorFilter] = useState('')
  const [entityIdFilter, setEntityIdFilter] = useState('')
  const [searchText, setSearchText] = useState('')

  // UI state
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [expandedRows, setExpandedRows] = useState(new Set())
  const [vehicleModal, setVehicleModal] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    const params = { limit: 500 }
    if (entityTypeFilters.length > 0) params.entity_type = entityTypeFilters.join(',')
    if (entityIdFilter) params.entity_id = entityIdFilter
    if (authorFilter) params.author = authorFilter
    if (actionFilters.length > 0) params.action = actionFilters.join(',')
    if (fromDate) params.from_date = fromDate + 'T00:00:00'
    if (toDate) params.to_date = toDate + 'T23:59:59'

    api.get('/v1/traceability/audit-logs', { params })
      .then(r => setEntries(r.data))
      .catch(() => toast.error('Failed to load audit log'))
      .finally(() => setLoading(false))
  }, [entityTypeFilters, entityIdFilter, authorFilter, actionFilters, fromDate, toDate])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    api.get('/v1/traceability/audit-logs/authors')
      .then(r => setAuthors(r.data))
      .catch(() => {})
  }, [])

  // client-side search filter
  const filtered = useMemo(() => {
    if (!searchText.trim()) return entries
    const q = searchText.toLowerCase()
    return entries.filter(e =>
      (e.justification || '').toLowerCase().includes(q) ||
      (e.action || '').toLowerCase().includes(q) ||
      (e.entity_id || '').toLowerCase().includes(q) ||
      (e.author || '').toLowerCase().includes(q) ||
      JSON.stringify(e.extra || {}).toLowerCase().includes(q)
    )
  }, [entries, searchText])

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const pageEntries = filtered.slice((page - 1) * perPage, page * perPage)

  // stats
  const stats = useMemo(() => {
    const byType = {}
    const byAction = {}
    const byAuthor = {}
    filtered.forEach(e => {
      byType[e.entity_type] = (byType[e.entity_type] || 0) + 1
      byAction[e.action] = (byAction[e.action] || 0) + 1
      byAuthor[e.author] = (byAuthor[e.author] || 0) + 1
    })
    const topAuthors = Object.entries(byAuthor).sort((a, b) => b[1] - a[1]).slice(0, 5)
    return { byType, byAction, topAuthors }
  }, [filtered])

  function toggleRow(id) {
    setExpandedRows(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleEntityClick(e, entry) {
    e.stopPropagation()
    const et = entry.entity_type
    const eid = entry.entity_id
    const did = entry.dataset_id
    if (et === 'dataset') { navigate(`/herko/datasets/${eid}`); return }
    if (et === 'label') { navigate(`/herko/datasets/${did || eid}`); return }
    if (et === 'review') { navigate(`/herko/datasets/${did || eid}/review`); return }
    if (et === 'vehicle_sw_id') { setVehicleModal(entry); return }
  }

  function handleAuthorClick(e, author) {
    e.stopPropagation()
    setAuthorFilter(author)
    setPage(1)
  }

  function clearFilters() {
    setFromDate(defaultFrom())
    setToDate(defaultTo())
    setEntityTypeFilters([])
    setActionFilters([])
    setAuthorFilter('')
    setEntityIdFilter('')
    setSearchText('')
    setPage(1)
  }

  function exportCSV() {
    const rows = [
      ['Timestamp', 'Entity Type', 'Entity ID', 'Dataset ID', 'Action', 'Author', 'From State', 'To State', 'Prev Value', 'New Value', 'Details', 'Justification'],
      ...filtered.map(e => {
        let details = ''
        if (e.from_state && e.to_state) details = `${e.from_state} → ${e.to_state}`
        else if (e.previous_value != null) details = `${e.previous_value} → ${e.new_value}`
        return [
          e.date ? new Date(e.date).toISOString() : '',
          e.entity_type,
          e.entity_id,
          e.dataset_id || '',
          e.action,
          e.author,
          e.from_state || '',
          e.to_state || '',
          e.previous_value ?? '',
          e.new_value ?? '',
          details,
          e.justification || '',
        ].map(v => `"${String(v).replace(/"/g, '""')}"`)
      }),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit_log_${fromDate}_${toDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ padding: '0 0 40px 0' }}>
      {/* header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              Workflow 8 · Audit Log
            </div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1A1A1A' }}>Audit Log</h1>
            <p style={{ margin: '4px 0 0', color: '#666', fontSize: 13 }}>Complete audit trail of all system changes</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="herko-btn herko-btn-secondary herko-btn-sm" onClick={clearFilters}>Clear filters</button>
            <button className="herko-btn herko-btn-primary herko-btn-sm" onClick={exportCSV}>Export CSV ↓</button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* main panel */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* filters */}
          <div className="herko-card" style={{ marginBottom: 16, padding: '16px 20px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
              <div>
                <label style={labelStyle}>From</label>
                <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1) }} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>To</label>
                <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1) }} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Entity Type</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
                  {ENTITY_TYPES.map(et => (
                    <label key={et} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', color: '#3C3C3C' }}>
                      <input
                        type="checkbox"
                        checked={entityTypeFilters.includes(et)}
                        onChange={e => {
                          const updated = e.target.checked ? [...entityTypeFilters, et] : entityTypeFilters.filter(x => x !== et)
                          setEntityTypeFilters(updated)
                          setPage(1)
                        }}
                      />
                      {et}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Action</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
                  {['CREATED', 'LABEL_UPDATED', 'SUBMITTED_FOR_APPROVAL', 'REVIEWED', 'APPROVED', 'RELEASED', 'REJECTED', 'DEPRECATED'].map(ac => (
                    <label key={ac} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', color: '#3C3C3C' }}>
                      <input
                        type="checkbox"
                        checked={actionFilters.includes(ac)}
                        onChange={e => {
                          const updated = e.target.checked ? [...actionFilters, ac] : actionFilters.filter(x => x !== ac)
                          setActionFilters(updated)
                          setPage(1)
                        }}
                      />
                      {ac}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Author</label>
                <input
                  list="author-list"
                  placeholder="Author..."
                  value={authorFilter}
                  onChange={e => { setAuthorFilter(e.target.value); setPage(1) }}
                  style={{ ...inputStyle, width: 140 }}
                />
                <datalist id="author-list">
                  {authors.map(a => <option key={a} value={a} />)}
                </datalist>
              </div>
              <div>
                <label style={labelStyle}>Entity ID</label>
                <input
                  placeholder="Entity ID..."
                  value={entityIdFilter}
                  onChange={e => { setEntityIdFilter(e.target.value); setPage(1) }}
                  style={{ ...inputStyle, width: 140 }}
                />
              </div>
              <div>
                <label style={labelStyle}>Search</label>
                <input
                  placeholder="Search text..."
                  value={searchText}
                  onChange={e => { setSearchText(e.target.value); setPage(1) }}
                  style={{ ...inputStyle, width: 180 }}
                />
              </div>
              <button className="herko-btn herko-btn-primary herko-btn-sm" onClick={() => { load(); setPage(1) }}>
                Apply
              </button>
            </div>
          </div>

          {/* table controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: '#666' }}>
              {loading
                ? 'Loading…'
                : `Showing ${filtered.length === 0 ? 0 : (page - 1) * perPage + 1}–${Math.min(page * perPage, filtered.length)} of ${filtered.length} entries`
              }
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: 12, color: '#666' }}>Per page:</label>
              <select
                value={perPage}
                onChange={e => { setPerPage(Number(e.target.value)); setPage(1) }}
                style={{ fontSize: 12, padding: '3px 6px', border: '1px solid #ccc', borderRadius: 3 }}
              >
                {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          {/* table */}
          <div className="herko-card" style={{ padding: 0, overflow: 'auto' }}>
            {loading ? (
              <div className="herko-empty">Loading audit log…</div>
            ) : filtered.length === 0 ? (
              <div className="herko-empty">No audit entries found. Try adjusting your filters.</div>
            ) : (
              <table className="herko-table" style={{ minWidth: 980 }}>
                <thead>
                  <tr>
                    <th style={{ width: 160 }}>Timestamp</th>
                    <th style={{ width: 110 }}>Entity Type</th>
                    <th style={{ width: 120 }}>Entity ID</th>
                    <th style={{ width: 160 }}>Action</th>
                    <th style={{ width: 110 }}>Author</th>
                    <th style={{ width: 180 }}>Details</th>
                    <th>Justification</th>
                  </tr>
                </thead>
                <tbody>
                  {pageEntries.map((entry, idx) => {
                    const rowKey = entry.id || idx
                    const expanded = expandedRows.has(rowKey)
                    const justif = entry.justification || ''
                    return (
                      <React.Fragment key={rowKey}>
                        <tr
                          style={{ cursor: 'pointer' }}
                          onClick={() => toggleRow(rowKey)}
                        >
                          <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: '#555' }}>
                            {formatDate(entry.date)}
                          </td>
                          <td><EntityBadge type={entry.entity_type} /></td>
                          <td>
                            <span
                              style={{
                                fontFamily: 'monospace', fontSize: 11, color: '#0078D4',
                                cursor: 'pointer', textDecoration: 'underline',
                                display: 'inline-block', maxWidth: 110, overflow: 'hidden',
                                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}
                              title={entry.entity_id}
                              onClick={e => handleEntityClick(e, entry)}
                            >
                              {entry.entity_id}
                            </span>
                          </td>
                          <td><ActionCell action={entry.action} /></td>
                          <td>
                            <span
                              style={{ fontSize: 12, color: '#2D5016', cursor: 'pointer', textDecoration: 'underline' }}
                              title={`Filter by: ${entry.author}`}
                              onClick={e => handleAuthorClick(e, entry.author)}
                            >
                              {entry.author}
                            </span>
                          </td>
                          <td><DetailsCell entry={entry} /></td>
                          <td>
                            <span
                              style={{ fontSize: 12, color: '#3C3C3C', display: 'block', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              title={justif}
                            >
                              {justif || <span style={{ color: '#ccc' }}>—</span>}
                            </span>
                          </td>
                        </tr>
                        {expanded && (
                          <tr>
                            <td colSpan={7} style={{ background: '#F9F9F9', padding: '12px 20px' }}>
                              <pre style={{ margin: 0, fontSize: 11, color: '#3C3C3C', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                {JSON.stringify(entry, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 16 }}>
              <button
                className="herko-btn herko-btn-secondary herko-btn-sm"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >‹ Prev</button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let p = i + 1
                if (totalPages > 7) {
                  if (page <= 4) p = i + 1
                  else if (page >= totalPages - 3) p = totalPages - 6 + i
                  else p = page - 3 + i
                }
                return (
                  <button
                    key={p}
                    className={`herko-btn herko-btn-sm ${p === page ? 'herko-btn-primary' : 'herko-btn-secondary'}`}
                    onClick={() => setPage(p)}
                  >{p}</button>
                )
              })}
              <button
                className="herko-btn herko-btn-secondary herko-btn-sm"
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
              >Next ›</button>
            </div>
          )}
        </div>

        {/* sidebar stats */}
        <div style={{ width: 220, flexShrink: 0 }}>
          <div className="herko-card" style={{ padding: '16px', marginBottom: 12 }}>
            <div style={sidebarTitle}>Total Entries</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#2D5016' }}>{filtered.length}</div>
            {filtered.length !== entries.length && (
              <div style={{ fontSize: 11, color: '#888' }}>of {entries.length} loaded</div>
            )}
          </div>

          <div className="herko-card" style={{ padding: '16px', marginBottom: 12 }}>
            <div style={sidebarTitle}>By Entity Type</div>
            {Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
              <div key={t} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <EntityBadge type={t} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#3C3C3C' }}>{n}</span>
              </div>
            ))}
            {Object.keys(stats.byType).length === 0 && <div style={{ fontSize: 12, color: '#ccc' }}>—</div>}
          </div>

          <div className="herko-card" style={{ padding: '16px', marginBottom: 12 }}>
            <div style={sidebarTitle}>By Action</div>
            {Object.entries(stats.byAction).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([a, n]) => (
              <div key={a} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, gap: 4 }}>
                <span style={{ fontSize: 11, color: actionColor(a), fontWeight: 600, wordBreak: 'break-all' }}>{a}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#3C3C3C', flexShrink: 0 }}>{n}</span>
              </div>
            ))}
            {Object.keys(stats.byAction).length === 0 && <div style={{ fontSize: 12, color: '#ccc' }}>—</div>}
          </div>

          <div className="herko-card" style={{ padding: '16px' }}>
            <div style={sidebarTitle}>Top Authors</div>
            {stats.topAuthors.map(([author, n]) => (
              <div
                key={author}
                style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, cursor: 'pointer' }}
                title="Click to filter by this author"
                onClick={() => { setAuthorFilter(author); setPage(1) }}
              >
                <span style={{ fontSize: 12, color: '#0078D4', textDecoration: 'underline' }}>{author}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#3C3C3C' }}>{n}</span>
              </div>
            ))}
            {stats.topAuthors.length === 0 && <div style={{ fontSize: 12, color: '#ccc' }}>—</div>}
          </div>
        </div>
      </div>

      {vehicleModal && <VehicleModal entry={vehicleModal} onClose={() => setVehicleModal(null)} />}
    </div>
  )
}

const labelStyle = { display: 'block', fontSize: 11, fontWeight: 600, color: '#666', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }
const inputStyle = { padding: '6px 8px', border: '1px solid #D1D1D1', borderRadius: 3, fontSize: 13, color: '#3C3C3C', outline: 'none', height: 32 }
const sidebarTitle = { fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }
