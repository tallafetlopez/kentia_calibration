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

export default function HerkoDatasetDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [dataset, setDataset] = useState(null)
  const [labels, setLabels] = useState([])
  const [swRelease, setSwRelease] = useState(null)
  const [activeTab, setActiveTab] = useState('labels')
  const [selectedLabel, setSelectedLabel] = useState(null)
  const [loading, setLoading] = useState(true)

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

  if (loading) return <div className="herko-loading">Loading…</div>
  if (!dataset) return <div className="herko-empty">Dataset not found</div>

  const isReadOnly = ['RELEASE_CANDIDATE', 'RELEASED', 'DEPRECATED'].includes(dataset.lifecycle_state)

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
      render: v => v === 'YES' ? <span style={{ color: '#D13438', fontWeight: 600, fontSize: 12 }}>YES</span> : <span style={{ color: '#999' }}>NO</span>
    },
    {
      key: 'parametrizable_in_customer', label: 'Param.Cus.', width: '90px',
      render: v => v === 'YES' ? <span style={{ color: '#0078D4', fontWeight: 600, fontSize: 12 }}>YES</span> : <span style={{ color: '#999' }}>NO</span>
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
      </div>

      <div style={{ display: 'flex', gap: 0, alignItems: 'flex-start' }}>
        {/* Main */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Tabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

          {activeTab === 'labels' && (
            <div className="herko-card" style={{ padding: 0 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #E5E5E5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#666666' }}>{labels.length} labels total</span>
                {!isReadOnly && (
                  <Button variant="secondary" size="sm" onClick={async () => {
                    try { await api.post(`/datasets/${id}/submit-approval`); toast.success('Submitted for approval'); load() }
                    catch (e) { toast.error(e.response?.data?.detail || 'Failed') }
                  }}>Submit for Approval →</Button>
                )}
              </div>
              <DataTable columns={labelColumns} data={labels} selectable
                onRowClick={row => setSelectedLabel(prev => prev?.id === row.id ? null : row)} />
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
            <div className="herko-card">
              <p style={{ color: '#666', fontSize: 13 }}>{dataset.changelog_summary || 'No changelog available.'}</p>
            </div>
          )}
        </div>

        {/* Sidebar - label detail */}
        {selectedLabel && (
          <div className="herko-sidebar" style={{ marginLeft: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 14 }}>{selectedLabel.label_name}</h3>
              <button onClick={() => setSelectedLabel(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: 16 }}>✕</button>
            </div>
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
          </div>
        )}
      </div>
    </div>
  )
}
