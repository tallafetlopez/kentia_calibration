import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { toast } from 'sonner'
import { ChevronRight, CheckCircle, AlertTriangle, XCircle, Clock } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'

const REVIEW_DOMAINS = [
  { key: 'technical', label: 'Technical Review', owner: 'Calibration Engineer' },
  { key: 'project_configuration', label: 'Project Configuration', owner: 'Configuration Manager' },
  { key: 'regulatory', label: 'Regulatory Review', owner: 'Regulatory Compliance Specialist' },
  { key: 'vnv', label: 'V&V Review', owner: 'V&V Engineer' },
]

const STATUS_ICON = {
  ACCEPTED: <CheckCircle size={13} style={{ color: '#1E6B1E' }} />,
  REWORK_REQUIRED: <AlertTriangle size={13} style={{ color: '#B42318' }} />,
  PENDING: <Clock size={13} style={{ color: '#8A8886' }} />,
}

const STATUS_COLOR = {
  ACCEPTED: '#1E6B1E',
  REWORK_REQUIRED: '#B42318',
  PENDING: '#8A8886',
}

export default function HerkoReviewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [dataset, setDataset] = useState(null)
  const [loading, setLoading] = useState(true)
  const [comments, setComments] = useState({})
  const [saving, setSaving] = useState(null)
  const [decision, setDecision] = useState('')
  const [justification, setJustification] = useState('')
  const [approving, setApproving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/datasets/${id}`)
      setDataset(res.data)
    } catch {
      toast.error('Failed to load dataset')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div style={{ padding: 24, color: '#8A8886', fontSize: 13 }}>Loading…</div>
  )
  if (!dataset) return (
    <div style={{ padding: 24, color: '#8A8886', fontSize: 13 }}>Dataset not found.</div>
  )

  const review = dataset.review || {}
  const isUnderApproval = dataset.lifecycle_state === 'UNDER_APPROVAL'
  const allAccepted = REVIEW_DOMAINS.every(d => review[d.key] === 'ACCEPTED')
  const canApprove = allAccepted && decision && justification.trim()

  const handleUpdateReview = async (domain, status) => {
    setSaving(domain)
    try {
      await api.post(`/v1/datasets/${id}/review`, {
        domain,
        status,
        comments: comments[domain] || '',
      })
      toast.success('Review updated')
      await load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to update review')
    } finally {
      setSaving(null)
    }
  }

  const handleApprove = async () => {
    if (!decision) { toast.error('Select a decision'); return }
    if (!justification.trim()) { toast.error('Justification is required'); return }
    setApproving(true)
    try {
      await api.post(`/v1/datasets/${id}/approve`, { decision, justification })
      toast.success(decision === 'APPROVED' ? 'Dataset approved' : 'Dataset rejected — returned to Edit')
      navigate(`/herko/datasets/${id}`)
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Approval failed')
    } finally {
      setApproving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #C8C8C8', paddingBottom: 10 }}>
        <div className="tiny-label" style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
          <span
            style={{ cursor: 'pointer', color: '#646E5A' }}
            onClick={() => navigate(`/herko/datasets/${id}`)}
          >
            {dataset.dataset_name}
          </span>
          <ChevronRight size={11} style={{ color: '#8A8886' }} />
          Review
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#212121' }}>Review & Approval</h1>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '2px 6px',
            background: isUnderApproval ? '#FFF4CE' : '#DFF6DD',
            color: isUnderApproval ? '#7A5C00' : '#1E6B1E',
            border: `1px solid ${isUnderApproval ? '#F0D060' : '#82C882'}`,
          }}>
            {dataset.lifecycle_state}
          </span>
        </div>
        <p style={{ fontSize: 12, color: '#605E5C', margin: '4px 0 0' }}>
          {dataset.dataset_name} · {dataset.deployment_context || dataset.context}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        {/* Domain reviews */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {REVIEW_DOMAINS.map(domain => {
            const status = review[domain.key] || 'PENDING'
            const domComments = review[`${domain.key}_comments`] || ''
            return (
              <div key={domain.key} className="panel" style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#212121', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {STATUS_ICON[status]}
                      {domain.label}
                    </div>
                    <div style={{ fontSize: 11, color: '#8A8886', marginTop: 2 }}>{domain.owner}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: STATUS_COLOR[status] }}>
                      {status.replace('_', ' ')}
                    </span>
                    {isUnderApproval && (
                      <Select
                        value={status}
                        onValueChange={v => handleUpdateReview(domain.key, v)}
                        disabled={saving === domain.key}
                      >
                        <SelectTrigger style={{ height: 24, fontSize: 11, width: 160 }}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PENDING">Pending</SelectItem>
                          <SelectItem value="ACCEPTED">Accepted ✓</SelectItem>
                          <SelectItem value="REWORK_REQUIRED">Rework Required ⚠</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                {isUnderApproval && (
                  <div>
                    <div className="tiny-label" style={{ marginBottom: 3 }}>Comments</div>
                    <textarea
                      className="ms-input"
                      rows={2}
                      style={{ height: 44, resize: 'vertical', width: '100%' }}
                      placeholder="Review comments…"
                      value={comments[domain.key] ?? domComments}
                      onChange={e => setComments(p => ({ ...p, [domain.key]: e.target.value }))}
                    />
                  </div>
                )}

                {!isUnderApproval && domComments && (
                  <div style={{ fontSize: 11, color: '#605E5C', marginTop: 4, paddingLeft: 19 }}>
                    {domComments}
                  </div>
                )}
              </div>
            )
          })}

          {!allAccepted && isUnderApproval && (
            <div style={{ padding: '8px 12px', background: '#FFF8F0', border: '1px solid #FFB900', fontSize: 12, color: '#7A5C00' }}>
              All domain reviews must be Accepted before approving.
            </div>
          )}
        </div>

        {/* Approval panel */}
        <div className="panel" style={{ width: 260, flexShrink: 0, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div className="tiny-label" style={{ marginBottom: 6 }}>Review Summary</div>
            {REVIEW_DOMAINS.map(d => (
              <div key={d.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginBottom: 5 }}>
                <span style={{ color: '#3C3C3C' }}>{d.label.replace(' Review', '')}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, color: STATUS_COLOR[review[d.key] || 'PENDING'] }}>
                  {STATUS_ICON[review[d.key] || 'PENDING']}
                  {review[d.key] || 'PENDING'}
                </span>
              </div>
            ))}
          </div>

          {isUnderApproval && (
            <>
              <div>
                <div className="tiny-label" style={{ marginBottom: 3 }}>Decision *</div>
                <Select value={decision} onValueChange={setDecision}>
                  <SelectTrigger style={{ height: 24, fontSize: 11 }}>
                    <SelectValue placeholder="Select decision…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="APPROVED">Approved ✓</SelectItem>
                    <SelectItem value="REJECTED">Rejected ✗</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="tiny-label" style={{ marginBottom: 3 }}>Justification *</div>
                <textarea
                  className="ms-input"
                  rows={3}
                  style={{ height: 60, resize: 'vertical', width: '100%' }}
                  placeholder="Required justification…"
                  value={justification}
                  onChange={e => setJustification(e.target.value)}
                />
              </div>
            </>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            <button className="ms-btn" onClick={() => navigate(`/datasets/${id}`)}>
              ← Back to Dataset
            </button>
            {isUnderApproval && (
              <button
                className="ms-btn primary"
                disabled={!canApprove || approving}
                onClick={handleApprove}
                style={decision === 'REJECTED' ? { background: '#B42318', borderColor: '#B42318' } : {}}
              >
                {approving ? 'Saving…' : decision === 'REJECTED' ? 'Reject & Return to Edit' : 'Approve Dataset ✓'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
