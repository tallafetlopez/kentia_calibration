import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { toast } from 'sonner'

// ── constants ──────────────────────────────────────────────────────────────
const STATE_COLORS = {
  EDIT: '#997755', UNDER_APPROVAL: '#FF8C00', APPROVED: '#107C10',
  RELEASE_CANDIDATE: '#0078D4', RELEASED: '#2D5016', DEPRECATED: '#D13438',
}
const CONTEXT_COLORS = {
  PRODUCTION: '#2D5016', VARIANT_SPECIFIC: '#0078D4',
  POST_SALES: '#FF8C00', VIN_SPECIFIC: '#7B2FBE', DEVELOPMENT: '#999',
}
const SR_STATUS_COLORS = {
  VALID_FOR_CALIBRATION: '#2D5016', DRAFT: '#999', DEPRECATED: '#D13438',
}

function StateBadge({ state }) {
  const color = STATE_COLORS[state] || '#999'
  return (
    <span style={{
      background: color, color: '#fff', borderRadius: 3,
      padding: '1px 7px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: 0.4, whiteSpace: 'nowrap',
    }}>{state}</span>
  )
}

function ContextTag({ ctx }) {
  const color = CONTEXT_COLORS[ctx] || '#999'
  return (
    <span style={{
      border: `1px solid ${color}`, color, borderRadius: 3,
      padding: '1px 6px', fontSize: 10, fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap',
    }}>{ctx}</span>
  )
}

function formatDate(raw) {
  if (!raw) return '—'
  const d = new Date(raw)
  if (isNaN(d)) return String(raw).slice(0, 16)
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function ConfidenceDot({ status }) {
  const map = { VALIDATED: '#107C10', CALIBRATED: '#0078D4', DOCUMENTED: '#FF8C00', MISSING: '#D13438' }
  return (
    <span title={status} style={{
      display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
      background: map[status] || '#ccc', flexShrink: 0,
    }} />
  )
}

function VehicleModal({ vehicle, onClose }) {
  const rows = [
    ['ID', vehicle.id],
    ['VIN', vehicle.vin],
    ['Variant', vehicle.variant],
    ['Mfg Order Ref', vehicle.mfg_order_ref],
    ['Service Case Ref', vehicle.service_case_ref],
    ['Created', formatDate(vehicle.created_at)],
  ].filter(([, v]) => v)
  return (
    <div className="herko-modal-backdrop" onClick={onClose}>
      <div className="herko-modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <button className="herko-modal-close" onClick={onClose}>✕</button>
        <div className="herko-modal-title">Vehicle SW ID</div>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td style={{ padding: '7px 8px', fontWeight: 600, color: '#666', width: 160, borderBottom: '1px solid #eee' }}>{k}</td>
                <td style={{ padding: '7px 8px', borderBottom: '1px solid #eee', fontFamily: k === 'VIN' || k === 'ID' ? 'monospace' : undefined, wordBreak: 'break-all' }}>{v}</td>
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

function LabelRow({ label, navigate, datasetId }) {
  const [expanded, setExpanded] = useState(false)
  const isModified = label.modified
  const isRegulatory = label.regulatory_relevance === 'YES'

  return (
    <>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 8px 4px 0', cursor: 'pointer', borderRadius: 3,
          background: isModified ? '#FFFBF0' : undefined,
        }}
        onClick={() => setExpanded(x => !x)}
        title={label.label_name}
      >
        <ConfidenceDot status={label.confidence_status} />
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#1A1A1A', fontWeight: 500, minWidth: 180 }}>
          {label.label_name}
        </span>
        {label.current_value !== undefined && label.current_value !== null && (
          <span style={{ fontSize: 12, color: '#555', minWidth: 80 }}>
            {String(label.current_value)}
          </span>
        )}
        {isRegulatory && (
          <span style={{ fontSize: 9, fontWeight: 700, color: '#D13438', border: '1px solid #D13438', borderRadius: 2, padding: '0 4px' }}>REG</span>
        )}
        {isModified && (
          <span style={{ fontSize: 9, fontWeight: 700, color: '#FF8C00', border: '1px solid #FF8C00', borderRadius: 2, padding: '0 4px' }}>MOD</span>
        )}
        {label.last_modified_by && (
          <span style={{ fontSize: 11, color: '#888', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            {label.last_modified_by} · {formatDate(label.last_modification_date)}
          </span>
        )}
      </div>
      {expanded && (
        <div style={{
          marginLeft: 16, marginBottom: 4, padding: '8px 10px',
          background: '#F9F9F9', borderRadius: 3, fontSize: 12,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '3px 8px', color: '#555' }}>
            <span style={{ fontWeight: 600 }}>Level:</span><span>{label.level || '—'}</span>
            <span style={{ fontWeight: 600 }}>Confidence:</span><span>{label.confidence_status || '—'}</span>
            <span style={{ fontWeight: 600 }}>Regulatory:</span><span>{label.regulatory_relevance || '—'}</span>
            {label.change_justification && (
              <><span style={{ fontWeight: 600 }}>Justification:</span><span style={{ fontStyle: 'italic' }}>{label.change_justification}</span></>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function DatasetSection({ dataset, navigate, vehicleModal, setVehicleModal, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)
  const [labelsOpen, setLabelsOpen] = useState(false)
  const stateColor = STATE_COLORS[dataset.lifecycle_state] || '#999'

  return (
    <div style={{ marginBottom: 2, borderLeft: `3px solid ${stateColor}30`, paddingLeft: 12 }}>
      {/* dataset header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0',
          cursor: 'pointer',
        }}
        onClick={() => setOpen(x => !x)}
      >
        <span style={{ fontSize: 12, color: '#999', userSelect: 'none', width: 10, flexShrink: 0 }}>
          {open ? '▾' : '▸'}
        </span>
        <span
          style={{ fontWeight: 600, fontSize: 13, color: '#1A1A1A', cursor: 'pointer' }}
          onClick={e => { e.stopPropagation(); navigate(`/herko/datasets/${dataset.id}`) }}
          title={`Open dataset ${dataset.dataset_name}`}
        >
          {dataset.dataset_name}
        </span>
        <StateBadge state={dataset.lifecycle_state} />
        <ContextTag ctx={dataset.deployment_context} />
        <span style={{ fontSize: 11, color: '#888', marginLeft: 4 }}>{dataset.author}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#888' }}>
          {dataset.labels?.length ?? 0} labels · {dataset.vehicle_sw_ids?.length ?? 0} vehicles
        </span>
      </div>

      {open && (
        <div style={{ paddingLeft: 18, paddingBottom: 8 }}>
          {/* labels accordion */}
          {dataset.labels?.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', cursor: 'pointer', color: '#555', fontSize: 12 }}
                onClick={() => setLabelsOpen(x => !x)}
              >
                <span style={{ userSelect: 'none' }}>{labelsOpen ? '▾' : '▸'}</span>
                <span style={{ fontWeight: 600 }}>Labels</span>
                <span style={{ color: '#999' }}>({dataset.labels.length})</span>
                {dataset.labels.filter(l => l.modified).length > 0 && (
                  <span style={{ fontSize: 10, color: '#FF8C00', fontWeight: 700 }}>
                    {dataset.labels.filter(l => l.modified).length} modified
                  </span>
                )}
              </div>
              {labelsOpen && (
                <div style={{ borderLeft: '2px solid #E5E5E5', paddingLeft: 12, marginTop: 2 }}>
                  {dataset.labels.map((label, i) => (
                    <LabelRow key={label.id || i} label={label} navigate={navigate} datasetId={dataset.id} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* vehicle SW IDs */}
          {dataset.vehicle_sw_ids?.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4 }}>
                Vehicle Assignments ({dataset.vehicle_sw_ids.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {dataset.vehicle_sw_ids.map((v, i) => (
                  <div
                    key={v.id || i}
                    onClick={() => setVehicleModal(v)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '5px 8px', borderRadius: 3, cursor: 'pointer',
                      background: '#F9F9F9', border: '1px solid #E5E5E5', fontSize: 12,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F0F0F0'}
                    onMouseLeave={e => e.currentTarget.style.background = '#F9F9F9'}
                  >
                    <span style={{ fontSize: 10, color: '#7B2FBE', fontWeight: 700 }}>🆔</span>
                    <span style={{ fontFamily: 'monospace', color: '#7B2FBE', fontSize: 11 }}>
                      {String(v.id).slice(0, 8)}
                    </span>
                    {v.vin && <span style={{ color: '#555' }}>→ {v.vin}</span>}
                    {v.variant && <span style={{ color: '#888' }}>· {v.variant}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!dataset.labels?.length && !dataset.vehicle_sw_ids?.length && (
            <div style={{ fontSize: 12, color: '#ccc', padding: '4px 0' }}>No labels or vehicle assignments</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── main page ──────────────────────────────────────────────────────────────
export default function HerkoTraceabilityPage() {
  const navigate = useNavigate()

  const [chain, setChain] = useState([])
  const [loading, setLoading] = useState(true)
  const [vehicleModal, setVehicleModal] = useState(null)

  // filters
  const [releasedOnly, setReleasedOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [contextFilter, setContextFilter] = useState('')

  useEffect(() => {
    api.get('/v1/traceability/chain')
      .then(r => setChain(r.data))
      .catch(() => toast.error('Failed to load traceability chain'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    return chain.map(sr => {
      let datasets = sr.datasets || []
      if (releasedOnly) datasets = datasets.filter(d => d.lifecycle_state === 'RELEASED' || d.lifecycle_state === 'RELEASE_CANDIDATE')
      if (contextFilter) datasets = datasets.filter(d => d.deployment_context === contextFilter)
      if (search.trim()) {
        const q = search.toLowerCase()
        datasets = datasets.filter(d => (d.dataset_name || '').toLowerCase().includes(q))
      }
      return { ...sr, datasets }
    }).filter(sr => sr.datasets.length > 0)
  }, [chain, releasedOnly, search, contextFilter])

  function exportCSV() {
    const rows = [
      ['SW Release', 'SR Version', 'SR Status', 'Dataset', 'State', 'Context', 'Label', 'Current Value', 'Level', 'Confidence', 'Regulatory', 'Modified By', 'Modified Date', 'Vehicle SW ID', 'VIN'],
    ]
    chain.forEach(sr => {
      ;(sr.datasets || []).forEach(ds => {
        if ((ds.labels || []).length === 0 && (ds.vehicle_sw_ids || []).length === 0) {
          rows.push([sr.sw_release.identifier, sr.sw_release.version, sr.sw_release.status,
            ds.dataset_name, ds.lifecycle_state, ds.deployment_context,
            '', '', '', '', '', '', '', '', ''])
        }
        ;(ds.labels || []).forEach(l => {
          rows.push([
            sr.sw_release.identifier, sr.sw_release.version, sr.sw_release.status,
            ds.dataset_name, ds.lifecycle_state, ds.deployment_context,
            l.label_name, l.current_value ?? '', l.level, l.confidence_status,
            l.regulatory_relevance, l.last_modified_by, l.last_modification_date || '', '', '',
          ])
        })
        ;(ds.vehicle_sw_ids || []).forEach(v => {
          rows.push([
            sr.sw_release.identifier, sr.sw_release.version, sr.sw_release.status,
            ds.dataset_name, ds.lifecycle_state, ds.deployment_context,
            '', '', '', '', '', '', '', v.id, v.vin || '',
          ])
        })
      })
    })
    const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `traceability_chain_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalDatasets = chain.reduce((s, sr) => s + (sr.datasets?.length || 0), 0)
  const totalLabels = chain.reduce((s, sr) => s + (sr.datasets || []).reduce((ds, d) => ds + (d.labels?.length || 0), 0), 0)
  const totalVehicles = chain.reduce((s, sr) => s + (sr.datasets || []).reduce((ds, d) => ds + (d.vehicle_sw_ids?.length || 0), 0), 0)

  return (
    <div style={{ padding: '0 0 48px 0' }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Workflow 9 · Traceability
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1A1A1A' }}>Traceability Chain</h1>
          <p style={{ margin: '4px 0 0', color: '#666', fontSize: 13 }}>
            SW Release → Datasets → Labels → Vehicle SW IDs
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="herko-btn herko-btn-secondary herko-btn-sm" onClick={() => navigate('/herko/audit-log')}>
            Audit Trail →
          </button>
          <button className="herko-btn herko-btn-primary herko-btn-sm" onClick={exportCSV}>
            Export CSV ↓
          </button>
        </div>
      </div>

      {/* summary chips */}
      {!loading && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'SW Releases', value: chain.length, color: '#0078D4' },
            { label: 'Datasets', value: totalDatasets, color: '#2D5016' },
            { label: 'Labels', value: totalLabels.toLocaleString(), color: '#FF8C00' },
            { label: 'Vehicle SW IDs', value: totalVehicles, color: '#7B2FBE' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: '#fff', border: `1px solid ${color}40`,
              borderRadius: 4, padding: '6px 14px', display: 'flex', gap: 8, alignItems: 'center',
            }}>
              <span style={{ fontSize: 18, fontWeight: 700, color }}>{value}</span>
              <span style={{ fontSize: 11, color: '#666' }}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* filters */}
      <div className="herko-card" style={{ padding: '14px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={releasedOnly} onChange={e => setReleasedOnly(e.target.checked)} />
            Released only
          </label>
          <input
            placeholder="Search dataset name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '5px 10px', border: '1px solid #D1D1D1', borderRadius: 3, fontSize: 13, width: 220 }}
          />
          <select
            value={contextFilter}
            onChange={e => setContextFilter(e.target.value)}
            style={{ padding: '5px 10px', border: '1px solid #D1D1D1', borderRadius: 3, fontSize: 13, width: 180 }}
          >
            <option value="">All contexts</option>
            {['PRODUCTION', 'VARIANT_SPECIFIC', 'POST_SALES', 'VIN_SPECIFIC', 'DEVELOPMENT'].map(c => (
              <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
            ))}
          </select>
          {(releasedOnly || search || contextFilter) && (
            <button
              className="herko-btn herko-btn-secondary herko-btn-sm"
              onClick={() => { setReleasedOnly(false); setSearch(''); setContextFilter('') }}
            >Clear</button>
          )}
          {!loading && (
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#888' }}>
              {filtered.reduce((s, sr) => s + sr.datasets.length, 0)} datasets shown
            </span>
          )}
        </div>
      </div>

      {/* chain */}
      {loading ? (
        <div className="herko-empty">Loading traceability chain…</div>
      ) : filtered.length === 0 ? (
        <div className="herko-empty">No SW releases found. Try adjusting your filters.</div>
      ) : (
        filtered.map((sr, srIdx) => {
          const srColor = SR_STATUS_COLORS[sr.sw_release.status] || '#999'
          return (
            <div key={sr.sw_release.id || srIdx} className="herko-card" style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}>
              {/* SW Release header */}
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 20px', background: '#F8F8F8',
                  borderBottom: '2px solid #E5E5E5', cursor: 'pointer',
                }}
                onClick={() => navigate(`/herko/sw-releases`)}
                title="Go to SW Releases"
              >
                <span style={{ fontSize: 14, color: '#888', marginRight: 4 }}>⬡</span>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#1A1A1A' }}>
                  {sr.sw_release.identifier}
                </span>
                <span style={{ fontSize: 13, color: '#555' }}>v{sr.sw_release.version}</span>
                <span style={{
                  background: srColor, color: '#fff', borderRadius: 3,
                  padding: '2px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                }}>{sr.sw_release.status?.replace(/_/g, ' ')}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#888' }}>
                  {sr.datasets.length} dataset{sr.datasets.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* datasets */}
              <div style={{ padding: '8px 20px 12px 20px' }}>
                {sr.datasets.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#ccc', padding: '8px 0' }}>No datasets</div>
                ) : (
                  sr.datasets.map((ds, dsIdx) => (
                    <DatasetSection
                      key={ds.id || dsIdx}
                      dataset={ds}
                      navigate={navigate}
                      vehicleModal={vehicleModal}
                      setVehicleModal={setVehicleModal}
                      defaultOpen={sr.datasets.length === 1}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })
      )}

      {vehicleModal && <VehicleModal vehicle={vehicleModal} onClose={() => setVehicleModal(null)} />}
    </div>
  )
}
