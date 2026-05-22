import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { toast } from 'sonner'
import Button from '../../components/herko/Button'
import StateBadge from '../../components/herko/StateBadge'

const CONTEXT_COLORS = {
  PRODUCTION:       { background: '#DCFCE7', color: '#14532D' },
  VARIANT_SPECIFIC: { background: '#DBEAFE', color: '#1E3A5F' },
  POST_SALES:       { background: '#FEF3C7', color: '#78350F' },
  DEVELOPMENT:      { background: '#F3F4F6', color: '#374151' },
  VIN_SPECIFIC:     { background: '#F3E8FF', color: '#4C1D95' },
}

const EMPTY_FORM = { vin: '', variant_id: '', manufacturing_order_reference: '', service_case_reference: '' }

export default function HerkoReleaseCenterPage() {
  const navigate = useNavigate()
  const [datasets, setDatasets] = useState([])
  const [swReleases, setSwReleases] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('candidates')

  // Filters — Candidates
  const [cSearch, setCSearch] = useState('')
  const [cSWR, setCSWR] = useState('all')
  const [cContext, setCContext] = useState('all')

  // Filters — Released
  const [rSearch, setRSearch] = useState('')
  const [rStatus, setRStatus] = useState('all')
  const [rSWR, setRSWR] = useState('all')

  // Modal state
  const [modal, setModal] = useState(null)   // null | { step: 1|2, dataset }
  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [dsRes, srRes] = await Promise.all([
        api.get('/datasets'),
        api.get('/software-releases'),
      ])
      setDatasets(dsRes.data || [])
      setSwReleases(srRes.data || [])
    } catch {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const candidates = datasets.filter(d => {
    if (d.lifecycle_state !== 'APPROVED') return false
    const q = cSearch.toLowerCase()
    if (q && !d.dataset_name?.toLowerCase().includes(q)) return false
    if (cSWR !== 'all' && d.software_release_id !== cSWR) return false
    if (cContext !== 'all' && d.deployment_context !== cContext) return false
    return true
  })

  const released = datasets.filter(d => {
    if (!['RELEASE_CANDIDATE', 'RELEASED'].includes(d.lifecycle_state)) return false
    const q = rSearch.toLowerCase()
    if (q && !d.dataset_name?.toLowerCase().includes(q)) return false
    if (rStatus !== 'all' && d.lifecycle_state !== rStatus) return false
    if (rSWR !== 'all' && d.software_release_id !== rSWR) return false
    return true
  })

  const getSWLabel = (id) => swReleases.find(sr => sr.id === id)?.software_release_identifier || id || '—'

  const openModal = (dataset) => {
    setForm(EMPTY_FORM)
    setModal({ step: 1, dataset })
  }

  const closeModal = () => { setModal(null); setForm(EMPTY_FORM) }

  // Step 1: transition to RELEASE_CANDIDATE
  const handleStep1 = async () => {
    setBusy(true)
    try {
      await api.post(`/datasets/${modal.dataset.id}/release-select`, {
        vin: form.vin || null,
        variant_id: form.variant_id || null,
        manufacturing_order_reference: form.manufacturing_order_reference || null,
      })
      toast.success(`${modal.dataset.dataset_name} → RELEASE_CANDIDATE`)
      const updated = { ...modal.dataset, lifecycle_state: 'RELEASE_CANDIDATE' }
      setModal({ step: 2, dataset: updated })
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Transition failed')
    } finally {
      setBusy(false)
    }
  }

  // Step 2: assign to vehicle → RELEASED
  const handleStep2 = async () => {
    const ds = modal.dataset
    const swReleaseId = ds.software_release_id
    if (!swReleaseId) {
      toast.error('Dataset has no SW Release linked')
      return
    }
    setBusy(true)
    try {
      const res = await api.post(`/v1/sw-releases/${swReleaseId}/assign-dataset`, {
        dataset_id: ds.id,
        vin: form.vin || null,
        variant_id: form.variant_id || null,
        manufacturing_order_reference: form.manufacturing_order_reference || null,
        service_case_reference: form.service_case_reference || null,
      })
      toast.success(`Dataset released: ${ds.dataset_name} → RELEASED`)
      closeModal()
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Release failed')
    } finally {
      setBusy(false)
    }
  }

  const ContextBadge = ({ ctx }) => {
    const s = CONTEXT_COLORS[ctx] || CONTEXT_COLORS.DEVELOPMENT
    return (
      <span style={{ ...s, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
        {ctx?.replace('_', ' ') || '—'}
      </span>
    )
  }

  if (loading) return <div className="herko-loading">Loading…</div>

  return (
    <div className="herko-page">
      {/* Header */}
      <div className="herko-page-header" style={{ marginBottom: '1rem' }}>
        <div>
          <p style={{ fontSize: '0.75rem', color: 'var(--herko-muted, #666)', margin: '0 0 0.2rem' }}>Workflow 3</p>
          <h1 className="herko-page-title" style={{ margin: 0 }}>Release Center</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--herko-muted, #666)', marginTop: '0.25rem' }}>
            Promote approved datasets to Release Candidate and assign to vehicles.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #E5E5E5', marginBottom: '1.25rem' }}>
        {[
          { key: 'candidates', label: `Candidates (${candidates.length})` },
          { key: 'released', label: `Released (${released.length})` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '0.6rem 1.25rem', fontSize: '0.875rem', fontWeight: 600,
              color: activeTab === t.key ? '#2D5016' : '#666',
              borderBottom: activeTab === t.key ? '2px solid #2D5016' : '2px solid transparent',
              marginBottom: -2,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: Candidates ── */}
      {activeTab === 'candidates' && (
        <>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <input className="herko-input" style={{ flex: '1 1 200px' }}
              placeholder="Search dataset name…" value={cSearch}
              onChange={e => setCSearch(e.target.value)} />
            <select className="herko-select" value={cSWR} onChange={e => setCSWR(e.target.value)}>
              <option value="all">All SW Releases</option>
              {swReleases.map(sr => <option key={sr.id} value={sr.id}>{sr.software_release_identifier}</option>)}
            </select>
            <select className="herko-select" value={cContext} onChange={e => setCContext(e.target.value)}>
              <option value="all">All Contexts</option>
              {['PRODUCTION', 'DEVELOPMENT', 'VARIANT_SPECIFIC', 'POST_SALES', 'VIN_SPECIFIC'].map(c =>
                <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
            </select>
          </div>

          <div className="herko-card" style={{ padding: 0, overflow: 'hidden' }}>
            {candidates.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--herko-muted, #666)', fontSize: 13 }}>
                No APPROVED datasets ready for release.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E5E5E5', background: '#FAFAFA' }}>
                    {['Dataset', 'SW Release', 'Context', 'Status', ''].map(h => (
                      <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, fontSize: '0.78rem', color: '#666', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((ds, i) => (
                    <tr key={ds.id}
                      style={{ borderBottom: i < candidates.length - 1 ? '1px solid #E5E5E5' : 'none' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                    >
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>{ds.dataset_name}</td>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>{getSWLabel(ds.software_release_id)}</td>
                      <td style={{ padding: '0.75rem 1rem' }}><ContextBadge ctx={ds.deployment_context} /></td>
                      <td style={{ padding: '0.75rem 1rem' }}><StateBadge state={ds.lifecycle_state} /></td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <Button variant="primary" size="sm" onClick={() => openModal(ds)}>
                          Release →
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── TAB 2: Released ── */}
      {activeTab === 'released' && (
        <>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <input className="herko-input" style={{ flex: '1 1 200px' }}
              placeholder="Search dataset name…" value={rSearch}
              onChange={e => setRSearch(e.target.value)} />
            <select className="herko-select" value={rStatus} onChange={e => setRStatus(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="RELEASE_CANDIDATE">Release Candidate</option>
              <option value="RELEASED">Released</option>
            </select>
            <select className="herko-select" value={rSWR} onChange={e => setRSWR(e.target.value)}>
              <option value="all">All SW Releases</option>
              {swReleases.map(sr => <option key={sr.id} value={sr.id}>{sr.software_release_identifier}</option>)}
            </select>
          </div>

          <div className="herko-card" style={{ padding: 0, overflow: 'hidden' }}>
            {released.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--herko-muted, #666)', fontSize: 13 }}>
                No released datasets yet.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E5E5E5', background: '#FAFAFA' }}>
                    {['Dataset', 'SW Release', 'Context', 'Status', 'Vehicle SW ID', ''].map(h => (
                      <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, fontSize: '0.78rem', color: '#666', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {released.map((ds, i) => (
                    <tr key={ds.id}
                      style={{ borderBottom: i < released.length - 1 ? '1px solid #E5E5E5' : 'none' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                    >
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>{ds.dataset_name}</td>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>{getSWLabel(ds.software_release_id)}</td>
                      <td style={{ padding: '0.75rem 1rem' }}><ContextBadge ctx={ds.deployment_context} /></td>
                      <td style={{ padding: '0.75rem 1rem' }}><StateBadge state={ds.lifecycle_state} /></td>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {ds.vehicle_sw_id
                          ? <span style={{ color: '#0078D4', cursor: 'pointer' }} title={ds.vehicle_sw_id}>
                              🆔 {ds.vehicle_sw_id.slice(0, 8)}…
                            </span>
                          : <span style={{ color: '#CCC' }}>—</span>
                        }
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <button
                          onClick={() => navigate(`/herko/datasets/${ds.id}`)}
                          style={{ background: 'none', border: '1px solid #E5E5E5', borderRadius: 6, padding: '0.3rem 0.7rem', cursor: 'pointer', fontSize: '0.8rem' }}
                        >
                          View Details →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── Modal ── */}
      {modal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget && !busy) closeModal() }}
        >
          <div style={{ background: '#fff', borderRadius: 12, padding: '2rem', width: '100%', maxWidth: 500, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

            {/* Step indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.25rem' }}>
              {[1, 2].map(n => (
                <React.Fragment key={n}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 13,
                    background: modal.step >= n ? '#2D5016' : '#E5E5E5',
                    color: modal.step >= n ? '#fff' : '#666',
                  }}>{n}</div>
                  {n < 2 && <div style={{ flex: 1, height: 2, background: modal.step > 1 ? '#2D5016' : '#E5E5E5' }} />}
                </React.Fragment>
              ))}
              <span style={{ marginLeft: 8, fontSize: 13, color: '#666' }}>
                {modal.step === 1 ? 'Confirm Release Candidate' : 'Assign to Vehicle'}
              </span>
            </div>

            {/* Dataset info card */}
            <div style={{ background: '#F9FAFB', border: '1px solid #E5E5E5', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1.25rem' }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{modal.dataset.dataset_name}</div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                {getSWLabel(modal.dataset.software_release_id)} · {modal.dataset.deployment_context}
              </div>
              <div style={{ marginTop: 6 }}><StateBadge state={modal.dataset.lifecycle_state} /></div>
            </div>

            {/* Form fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', marginBottom: 3, color: '#666' }}>VIN (optional)</label>
                  <input className="herko-input" style={{ width: '100%', boxSizing: 'border-box' }}
                    placeholder="WBA12345678901234"
                    value={form.vin}
                    onChange={e => setForm(f => ({ ...f, vin: e.target.value }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', marginBottom: 3, color: '#666' }}>Variant ID (optional)</label>
                  <input className="herko-input" style={{ width: '100%', boxSizing: 'border-box' }}
                    placeholder="VAR-001"
                    value={form.variant_id}
                    onChange={e => setForm(f => ({ ...f, variant_id: e.target.value }))} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', marginBottom: 3, color: '#666' }}>Manufacturing Order Ref (optional)</label>
                <input className="herko-input" style={{ width: '100%', boxSizing: 'border-box' }}
                  placeholder="MO-2025-0042"
                  value={form.manufacturing_order_reference}
                  onChange={e => setForm(f => ({ ...f, manufacturing_order_reference: e.target.value }))} />
              </div>
              {modal.step === 2 && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', marginBottom: 3, color: '#666' }}>Service Case Ref (optional)</label>
                  <input className="herko-input" style={{ width: '100%', boxSizing: 'border-box' }}
                    placeholder="SC-2025-1234"
                    value={form.service_case_reference}
                    onChange={e => setForm(f => ({ ...f, service_case_reference: e.target.value }))} />
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={closeModal} disabled={busy}>Cancel</Button>
              {modal.step === 1 ? (
                <Button variant="primary" onClick={handleStep1} disabled={busy}>
                  {busy ? 'Processing…' : 'Continue →'}
                </Button>
              ) : (
                <Button variant="primary" onClick={handleStep2} disabled={busy}>
                  {busy ? 'Releasing…' : 'Assign & Release ✓'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
