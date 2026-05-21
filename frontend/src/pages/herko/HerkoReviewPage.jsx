import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { toast } from 'sonner'
import Tabs from '../../components/herko/Tabs'
import StateBadge from '../../components/herko/StateBadge'
import Button from '../../components/herko/Button'

const TABS = [
  { key: 'reviews', label: 'Reviews' },
  { key: 'summary', label: 'Summary' },
  { key: 'artifacts', label: 'Artifacts' },
  { key: 'changelog', label: 'Change Log' },
]

const REVIEW_DOMAINS = [
  { key: 'technical', label: 'Technical Review', number: 2, owner: 'PD-Integration & Calibration Engineer' },
  { key: 'project_configuration', label: 'Project Configuration Review', number: 3, owner: 'Configuration Manager' },
  { key: 'regulatory', label: 'Regulatory Review', number: 4, owner: 'PI-Regulatory Compliance Specialist' },
  { key: 'vnv', label: 'V&V Review', number: 'V', owner: 'PD-V&V Engineer' },
]

export default function HerkoReviewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [dataset, setDataset] = useState(null)
  const [activeTab, setActiveTab] = useState('reviews')
  const [approving, setApproving] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/datasets/${id}`)
      setDataset(res.data)
    } catch { toast.error('Failed to load') }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="herko-loading">Loading…</div>
  if (!dataset) return <div className="herko-empty">Not found</div>

  const review = dataset.review || {}
  const allAccepted = REVIEW_DOMAINS.every(d => review[d.key] === 'ACCEPTED')

  const handleUpdateReview = async (domain, status) => {
    try {
      await api.post(`/datasets/${id}/review`, { domain, status })
      toast.success('Review updated')
      load()
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed') }
  }

  const handleApprove = async () => {
    setApproving(true)
    try {
      await api.post(`/datasets/${id}/approve`)
      toast.success('Dataset approved')
      navigate(`/herko/datasets/${id}`)
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed') }
    finally { setApproving(false) }
  }

  const STATUS_COLORS = { ACCEPTED: '#7CBA00', PENDING: '#FF8C00', REWORK_REQUIRED: '#D13438' }

  return (
    <div className="herko-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 13 }}>
        <button onClick={() => navigate(`/herko/datasets/${id}`)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2D5016', fontWeight: 600 }}>
          {dataset.dataset_name}
        </button>
        <span style={{ color: '#CCCCCC' }}>›</span>
        <span style={{ fontWeight: 600 }}>Review</span>
        <StateBadge state={dataset.lifecycle_state} />
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <Tabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

          {activeTab === 'reviews' && (
            <div>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
                SW Release: <strong>{dataset.software_release_id?.slice(0,20)}</strong>
                &nbsp;·&nbsp; Context: <strong>{dataset.deployment_context}</strong>
              </div>

              {REVIEW_DOMAINS.map(domain => {
                const status = review[domain.key] || 'PENDING'
                return (
                  <div key={domain.key} className="herko-review-item">
                    <div className="herko-review-header">
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div className="herko-review-number">{domain.number}</div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14, color: '#3C3C3C' }}>{domain.label}</div>
                          <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>Owner: {domain.owner}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <select className="herko-select" style={{ width: 180 }}
                          value={status}
                          onChange={e => handleUpdateReview(domain.key, e.target.value)}>
                          <option value="PENDING">Pending</option>
                          <option value="ACCEPTED">Accepted ✓</option>
                          <option value="REWORK_REQUIRED">Rework Required ⚠</option>
                        </select>
                        <span style={{ fontWeight: 700, color: STATUS_COLORS[status], fontSize: 12 }}>
                          {status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                    {review[`${domain.key}_comments`] && (
                      <div style={{ marginTop: 8, fontSize: 12, color: '#666', paddingLeft: 36 }}>
                        {review[`${domain.key}_comments`]}
                      </div>
                    )}
                  </div>
                )
              })}

              {!allAccepted && (
                <div style={{ padding: '10px 14px', background: '#FFF8F0', border: '1px solid #FF8C00', borderRadius: 4, fontSize: 12, color: '#666', marginTop: 12 }}>
                  ⚠ Gate: "Approve Dataset" enabled only when all reviews = Accepted
                </div>
              )}
            </div>
          )}

          {activeTab === 'summary' && (
            <div className="herko-card">
              <p style={{ fontSize: 13, color: '#666' }}>Dataset: <strong>{dataset.dataset_name}</strong></p>
              <p style={{ fontSize: 13, color: '#666' }}>State: <StateBadge state={dataset.lifecycle_state} /></p>
            </div>
          )}

          {activeTab === 'artifacts' && (
            <div className="herko-card">
              <p style={{ color: '#999', fontSize: 13 }}>No artifacts uploaded yet.</p>
            </div>
          )}

          {activeTab === 'changelog' && (
            <div className="herko-card">
              <p style={{ color: '#666', fontSize: 13 }}>{dataset.changelog_summary || 'No changelog available.'}</p>
            </div>
          )}
        </div>

        {/* Approval panel */}
        <div className="herko-approval-panel" style={{ width: 280, flexShrink: 0 }}>
          <div className="herko-approval-title">Approval Decision</div>
          <div className="herko-approval-subtitle">PI-Engineering Manager</div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#666', marginBottom: 6 }}>REVIEW STATUS</div>
            {REVIEW_DOMAINS.map(d => (
              <div key={d.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: '#3C3C3C' }}>{d.label.replace(' Review', '')}</span>
                <span style={{
                  fontWeight: 700, fontSize: 11,
                  color: review[d.key] === 'ACCEPTED' ? '#7CBA00' : review[d.key] === 'REWORK_REQUIRED' ? '#D13438' : '#FF8C00'
                }}>{review[d.key] || 'PENDING'}</span>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="herko-label">Justification</label>
            <textarea className="herko-input" rows={3} placeholder="Optional justification…"
              style={{ resize: 'vertical' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={() => navigate(`/herko/datasets/${id}`)}>Return to Edit</Button>
            <Button variant="primary" disabled={!allAccepted || approving} onClick={handleApprove}>
              {approving ? 'Approving…' : 'Approve Dataset ✓'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
