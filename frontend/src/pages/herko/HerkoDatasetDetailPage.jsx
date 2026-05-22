import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { toast } from 'sonner'
import Tabs from '../../components/herko/Tabs'
import StateBadge from '../../components/herko/StateBadge'
import Button from '../../components/herko/Button'
import DataTable from '../../components/herko/DataTable'

const TABS = [
  { key: 'labels', label: 'Labels' },
  { key: 'overview', label: 'Overview' },
  { key: 'artifacts', label: 'Artifacts' },
  { key: 'changelog', label: 'Change Log' },
]

const LEVEL_OPTIONS = ['CONFIGURATION', 'CARRY_OVER', 'VARIANT_SPECIFIC', 'VEHICLE_SPECIFIC']
const CONFIDENCE_OPTIONS = ['EMPTY', 'CALIBRATED', 'VALIDATED', 'DOCUMENTED']
const YES_NO_OPTIONS = ['YES', 'NO']

export default function HerkoDatasetDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [dataset, setDataset] = useState(null)
  const [labels, setLabels] = useState([])
  const [swRelease, setSwRelease] = useState(null)
  const [activeTab, setActiveTab] = useState('labels')
  const [selectedLabel, setSelectedLabel] = useState(null)
  const [labelDraft, setLabelDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ search: '', modifiedOnly: false, regulatoryOnly: false, paramCustOnly: false })
  const [changelog, setChangelog] = useState([])
  const [loadingLog, setLoadingLog] = useState(false)

  const load = useCallback(async () => {
    try {
      const [dsRes, lblRes] = await Promise.all([
        api.get(`/datasets/${id}`),
        api.get(`/datasets/${id}/labels`),
      ])
      setDataset(dsRes.data)
      setLabels(lblRes.data)
      if (dsRes.data.software_release_id) {
        api.get(`/software-releases/${dsRes.data.software_release_id}`).then(r => setSwRelease(r.data)).catch(() => {})
      }
    } catch { toast.error('Failed to load dataset') }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (activeTab !== 'changelog') return
    setLoadingLog(true)
    api.get(`/datasets/${id}/changelog`)
      .then(r => setChangelog(r.data))
      .catch(() => toast.error('Failed to load changelog'))
      .finally(() => setLoadingLog(false))
  }, [activeTab, id])

  // Sync selectedLabel after labels refresh
  useEffect(() => {
    if (selectedLabel && !saving) {
      const fresh = labels.find(l => l.id === selectedLabel.id)
      if (fresh) {
        setSelectedLabel(fresh)
        setLabelDraft({ ...fresh })
      }
    }
  }, [labels]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="herko-loading">Loading…</div>
  if (!dataset) return <div className="herko-empty">Dataset not found</div>

  const isReadOnly = ['RELEASE_CANDIDATE', 'RELEASED', 'DEPRECATED'].includes(dataset.lifecycle_state)
  const hasModified = labels.some(l => l.modified)

  const filteredLabels = labels.filter(l => {
    if (filters.modifiedOnly && !l.modified) return false
    if (filters.regulatoryOnly && l.regulatory_relevance !== 'YES') return false
    if (filters.paramCustOnly && l.parametrizable_in_customer !== 'YES') return false
    if (filters.search && !l.label_name?.toLowerCase().includes(filters.search.toLowerCase())) return false
    return true
  })

  const handleRowClick = (row) => {
    if (selectedLabel?.id === row.id) {
      setSelectedLabel(null)
      setLabelDraft(null)
    } else {
      setSelectedLabel(row)
      setLabelDraft({ ...row })
    }
  }

  const handleSave = async () => {
    if (!labelDraft) return
    const valueChanged = labelDraft.current_value !== selectedLabel.current_value
    if (valueChanged && !labelDraft.change_justification?.trim()) {
      toast.error('Change justification is required when modifying the value')
      return
    }
    setSaving(true)
    try {
      const body = {
        current_value: labelDraft.current_value,
        level: labelDraft.level,
        confidence_status: labelDraft.confidence_status,
        regulatory_relevance: labelDraft.regulatory_relevance,
        parametrizable_in_customer: labelDraft.parametrizable_in_customer,
        change_justification: labelDraft.change_justification || null,
        comments: labelDraft.comments || null,
      }
      const res = await api.patch(`/v1/datasets/${id}/labels/${selectedLabel.id}`, body)
      toast.success('Label saved')
      const updated = res.data || { ...selectedLabel, ...body }
      setSelectedLabel(updated)
      setLabelDraft({ ...updated })
      await load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setLabelDraft({ ...selectedLabel })
  }

  const handleSubmitApproval = async () => {
    try {
      await api.post(`/datasets/${id}/submit-approval`)
      toast.success('Submitted for approval')
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed')
    }
  }

  const labelColumns = [
    { key: 'label_name', label: 'Label', width: '200px' },
    { key: 'current_value', label: 'Value', width: '90px' },
    { key: 'unit', label: 'Unit', width: '70px' },
    { key: 'level', label: 'Level', width: '130px' },
    {
      key: 'confidence_status', label: 'Confidence', width: '110px',
      render: v => {
        const colors = { VALIDATED: '#7CBA00', DOCUMENTED: '#0078D4', CALIBRATED: '#FF8C00', EMPTY: '#997755' }
        return <span style={{ color: colors[v] || '#666', fontWeight: 600, fontSize: 12 }}>{v}</span>
      }
    },
    {
      key: 'regulatory_relevance', label: 'Regulatory', width: '90px',
      render: v => v === 'YES'
        ? <span style={{ color: '#D13438', fontWeight: 600, fontSize: 12 }}>YES</span>
        : <span style={{ color: '#999' }}>NO</span>
    },
    {
      key: 'parametrizable_in_customer', label: 'Param.Cus.', width: '90px',
      render: v => v === 'YES'
        ? <span style={{ color: '#0078D4', fontWeight: 600, fontSize: 12 }}>YES</span>
        : <span style={{ color: '#999' }}>NO</span>
    },
    {
      key: 'maturity', label: 'Maturity', width: '80px',
      render: v => {
        const colors = { '100': '#7CBA00', '75': '#0078D4', '25': '#FF8C00', '0': '#997755', 'Deprecated': '#D13438' }
        return <span style={{ color: colors[v] || '#666', fontWeight: 600, fontSize: 12 }}>{v === 'Deprecated' ? 'DEP' : v !== undefined ? `${v}%` : '—'}</span>
      }
    },
  ]

  return (
    <div className="herko-page">
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 13 }}>
        <button onClick={() => navigate('/herko/datasets')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2D5016', fontWeight: 600 }}>
          Datasets
        </button>
        <span style={{ color: '#CCCCCC' }}>›</span>
        <span style={{ color: '#3C3C3C', fontWeight: 600 }}>{dataset.dataset_name}</span>
        <StateBadge state={dataset.lifecycle_state} />
        {dataset.lifecycle_state === 'UNDER_APPROVAL' && (
          <button
            onClick={() => navigate(`/herko/datasets/${id}/review`)}
            style={{ marginLeft: 'auto', background: '#FFF4CE', border: '1px solid #F0D060', color: '#7A5C00', fontSize: 11, fontWeight: 600, padding: '3px 10px', cursor: 'pointer', borderRadius: 2 }}
          >
            Open Review →
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 0, alignItems: 'flex-start' }}>
        {/* Main */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Tabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

          {activeTab === 'labels' && (
            <div className="herko-card" style={{ padding: 0 }}>
              {/* Table header */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #E5E5E5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#666666' }}>{labels.length} labels total</span>
                {!isReadOnly && hasModified && (
                  <Button variant="secondary" size="sm" onClick={handleSubmitApproval}>
                    Submit for Approval →
                  </Button>
                )}
              </div>

              {/* Filters */}
              <div style={{ padding: '8px 16px', borderBottom: '1px solid #E5E5E5', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', background: '#FAFAFA' }}>
                <div style={{ position: 'relative' }}>
                  <svg style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#AAAAAA', pointerEvents: 'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                  <input
                    type="text"
                    className="herko-input"
                    style={{ width: 220, paddingLeft: 28 }}
                    placeholder="Search label…"
                    value={filters.search}
                    onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                  />
                </div>
                {[
                  ['modifiedOnly', 'Modified only'],
                  ['regulatoryOnly', 'Regulatory'],
                  ['paramCustOnly', 'Param. Cust.'],
                ].map(([key, label]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#555', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={filters[key]}
                      onChange={e => setFilters(f => ({ ...f, [key]: e.target.checked }))}
                      style={{ accentColor: '#2D5016', width: 13, height: 13, cursor: 'pointer' }}
                    />
                    {label}
                  </label>
                ))}
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#AAAAAA' }}>{filteredLabels.length} shown</span>
              </div>

              <DataTable
                columns={labelColumns}
                data={filteredLabels}
                selectable
                onRowClick={handleRowClick}
              />
            </div>
          )}

          {activeTab === 'overview' && (
            <div className="herko-card">
              <div className="herko-form-row" style={{ gap: 24 }}>
                {[
                  ['Dataset Name', dataset.dataset_name],
                  ['Lifecycle State', <StateBadge state={dataset.lifecycle_state} />],
                  ['SW Release', swRelease?.software_release_identifier || dataset.software_release_id],
                  ['Deployment Context', dataset.deployment_context],
                  ['Creation Mode', dataset.creation_mode],
                  ['Author', dataset.author],
                  ['Created', dataset.creation_date ? new Date(dataset.creation_date).toLocaleDateString() : '—'],
                  ['Last Modified', dataset.last_modified_date ? new Date(dataset.last_modified_date).toLocaleDateString() : '—'],
                  ['Locked', dataset.locked ? 'Yes' : 'No'],
                  ['Deployed', dataset.deployed ? 'Yes' : 'No'],
                ].map(([k, v]) => (
                  <div key={k} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: '#666', fontWeight: 600, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{k}</div>
                    <div style={{ fontSize: 14, color: '#3C3C3C' }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'artifacts' && (
            <div className="herko-card">
              <p style={{ color: '#999', fontSize: 13 }}>No artifacts uploaded yet.</p>
            </div>
          )}

          {activeTab === 'changelog' && (
            <div className="herko-card" style={{ padding: 0 }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #E5E5E5', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  className="herko-btn herko-btn-secondary"
                  style={{ fontSize: 12 }}
                  disabled={changelog.length === 0}
                  onClick={() => {
                    const rows = [
                      ['Date', 'Action', 'Entity', 'Author', 'Previous Value', 'New Value', 'Justification'],
                      ...changelog.map(e => [
                        e.date || '',
                        e.action || '',
                        e.entity_id || '',
                        e.author || '',
                        e.previous_value || '',
                        e.new_value || '',
                        (e.justification || '').replace(/"/g, '""'),
                      ]),
                    ]
                    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
                    const blob = new Blob([csv], { type: 'text/csv' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `changelog_${dataset.dataset_name}_${new Date().toISOString().slice(0, 10)}.csv`
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                >
                  Export CSV ↓
                </button>
              </div>

              {loadingLog ? (
                <p style={{ padding: '20px 16px', color: '#AAAAAA', fontSize: 13 }}>Loading changelog…</p>
              ) : changelog.length === 0 ? (
                <p style={{ padding: '20px 16px', color: '#AAAAAA', fontSize: 13 }}>No changes recorded yet.</p>
              ) : (
                <div>
                  {changelog.map((entry, i) => {
                    const ACTION_COLORS = {
                      LABEL_UPDATED: '#0078D4',
                      CREATED: '#7CBA00',
                      SUBMITTED_FOR_APPROVAL: '#FF8C00',
                      'UNDER_APPROVAL→APPROVED': '#2D5016',
                      APPROVED: '#2D5016',
                      REJECTED: '#D13438',
                      DEPRECATED: '#D13438',
                    }
                    const badgeColor = ACTION_COLORS[entry.action] || '#999999'
                    const dateStr = entry.date
                      ? new Date(entry.date).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : '—'
                    return (
                      <div key={entry.id || i} style={{ padding: '10px 16px', borderBottom: '1px solid #F0F0F0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', background: badgeColor + '18', color: badgeColor, border: `1px solid ${badgeColor}44` }}>
                            {entry.action}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#3C3C3C' }}>{entry.entity_id || '—'}</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#888888' }}>
                          By: <strong style={{ color: '#555' }}>{entry.author || '—'}</strong> · {dateStr}
                        </div>
                        {(entry.previous_value || entry.new_value) && (
                          <div style={{ fontSize: 11, color: '#555', fontFamily: 'monospace' }}>
                            {entry.previous_value ?? '—'} → {entry.new_value ?? '—'}
                          </div>
                        )}
                        {entry.justification && (
                          <div style={{ fontSize: 11, color: '#666666', fontStyle: 'italic' }}>
                            "{entry.justification}"
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        {selectedLabel && (
          <div className="herko-sidebar" style={{ marginLeft: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 14, color: '#2D5016', wordBreak: 'break-all', lineHeight: 1.3 }}>{selectedLabel.label_name}</h3>
              <button
                onClick={() => { setSelectedLabel(null); setLabelDraft(null) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: 16, lineHeight: 1, flexShrink: 0, marginLeft: 8 }}
              >✕</button>
            </div>

            {isReadOnly ? (
              <>
                {[
                  ['Data Type', selectedLabel.data_type],
                  ['Current Value', selectedLabel.current_value || '—'],
                  ['Unit', selectedLabel.unit || '—'],
                  ['Level', selectedLabel.level],
                  ['Confidence', selectedLabel.confidence_status],
                  ['Owner', selectedLabel.owner],
                  ['Maturity', selectedLabel.maturity !== undefined ? `${selectedLabel.maturity}%` : '—'],
                  ['Regulatory', selectedLabel.regulatory_relevance],
                  ['Modified', selectedLabel.modified ? 'Yes' : 'No'],
                ].map(([k, v]) => (
                  <div key={k} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: '#666', fontWeight: 600, marginBottom: 2 }}>{k}</div>
                    <div style={{ fontSize: 13, color: '#3C3C3C' }}>{v}</div>
                  </div>
                ))}
              </>
            ) : (
              labelDraft && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', paddingBottom: 8, borderBottom: '1px solid #EEEEEE' }}>
                    Owner: <strong style={{ color: '#3C3C3C' }}>{selectedLabel.owner}</strong>
                    {selectedLabel.unit && <> · Unit: <strong style={{ color: '#3C3C3C' }}>{selectedLabel.unit}</strong></>}
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: '#555', fontWeight: 600, display: 'block', marginBottom: 4 }}>Current Value</label>
                    <input
                      type="text"
                      className="herko-input"
                      style={{ width: '100%' }}
                      value={labelDraft.current_value ?? ''}
                      onChange={e => setLabelDraft(d => ({ ...d, current_value: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: '#555', fontWeight: 600, display: 'block', marginBottom: 4 }}>Level</label>
                    <select
                      className="herko-select"
                      style={{ width: '100%' }}
                      value={labelDraft.level ?? ''}
                      onChange={e => setLabelDraft(d => ({ ...d, level: e.target.value }))}
                    >
                      {LEVEL_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: '#555', fontWeight: 600, display: 'block', marginBottom: 4 }}>Confidence</label>
                    <select
                      className="herko-select"
                      style={{ width: '100%' }}
                      value={labelDraft.confidence_status ?? ''}
                      onChange={e => setLabelDraft(d => ({ ...d, confidence_status: e.target.value }))}
                    >
                      {CONFIDENCE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: '#555', fontWeight: 600, display: 'block', marginBottom: 4 }}>Regulatory Relevance</label>
                    <select
                      className="herko-select"
                      style={{ width: '100%' }}
                      value={labelDraft.regulatory_relevance ?? ''}
                      onChange={e => setLabelDraft(d => ({ ...d, regulatory_relevance: e.target.value }))}
                    >
                      {YES_NO_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: '#555', fontWeight: 600, display: 'block', marginBottom: 4 }}>Param. in Customer</label>
                    <select
                      className="herko-select"
                      style={{ width: '100%' }}
                      value={labelDraft.parametrizable_in_customer ?? ''}
                      onChange={e => setLabelDraft(d => ({ ...d, parametrizable_in_customer: e.target.value }))}
                    >
                      {YES_NO_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: '#555', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      Change Justification
                      {labelDraft.current_value !== selectedLabel.current_value && (
                        <span style={{ color: '#D13438', marginLeft: 3 }}>*</span>
                      )}
                    </label>
                    <textarea
                      className="herko-input"
                      rows={3}
                      style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 12 }}
                      placeholder={labelDraft.current_value !== selectedLabel.current_value ? 'Required — value changed' : 'Optional…'}
                      value={labelDraft.change_justification ?? ''}
                      onChange={e => setLabelDraft(d => ({ ...d, change_justification: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: '#555', fontWeight: 600, display: 'block', marginBottom: 4 }}>Comments</label>
                    <textarea
                      className="herko-input"
                      rows={2}
                      style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 12 }}
                      placeholder="Optional…"
                      value={labelDraft.comments ?? ''}
                      onChange={e => setLabelDraft(d => ({ ...d, comments: e.target.value }))}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
                    <Button variant="primary" size="sm" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
                      {saving ? 'Saving…' : 'Save'}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={handleCancel} disabled={saving}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}
