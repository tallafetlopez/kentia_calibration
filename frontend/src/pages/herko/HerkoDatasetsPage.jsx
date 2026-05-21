import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { toast } from 'sonner'
import Button from '../../components/herko/Button'
import DataTable from '../../components/herko/DataTable'
import StateBadge from '../../components/herko/StateBadge'

export default function HerkoDatasetsPage() {
  const navigate = useNavigate()
  const [datasets, setDatasets] = useState([])
  const [swReleases, setSwReleases] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ search: '', swRelease: 'all', context: 'all', lifecycleState: 'all' })

  const load = useCallback(async () => {
    try {
      const [dsRes, srRes] = await Promise.all([
        api.get('/datasets'),
        api.get('/software-releases'),
      ])
      setDatasets(dsRes.data)
      setSwReleases(srRes.data)
    } catch (e) {
      toast.error('Failed to load datasets')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = datasets.filter(ds => {
    if (filters.search) {
      const q = filters.search.toLowerCase()
      if (!ds.dataset_name?.toLowerCase().includes(q) && !ds.id?.includes(q)) return false
    }
    if (filters.swRelease !== 'all' && ds.software_release_id !== filters.swRelease) return false
    if (filters.context !== 'all' && ds.deployment_context !== filters.context) return false
    if (filters.lifecycleState !== 'all' && ds.lifecycle_state !== filters.lifecycleState) return false
    return true
  })

  const getSwReleaseLabel = (id) => swReleases.find(sr => sr.id === id)?.software_release_identifier || id

  const columns = [
    {
      key: 'lifecycle_state', label: 'Lifecycle State', width: '130px',
      render: (v) => <StateBadge state={v} />
    },
    { key: 'dataset_name', label: 'Dataset ID', width: '200px' },
    {
      key: 'software_release_id', label: 'SW Release', width: '180px',
      render: (v) => <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{getSwReleaseLabel(v)}</span>
    },
    { key: 'deployment_context', label: 'Context', width: '140px' },
    { key: 'variant_id', label: 'Variant ID', width: '110px' },
    {
      key: 'last_modified_date', label: 'Modified', width: '110px',
      render: (v) => v ? new Date(v).toLocaleDateString('es-ES') : '—'
    },
    {
      key: 'creation_date', label: 'Created', width: '110px',
      render: (v) => v ? new Date(v).toLocaleDateString('es-ES') : '—'
    },
  ]

  const CONTEXTS = ['DEVELOPMENT', 'PRODUCTION', 'VARIANT_SPECIFIC', 'POST_SALES', 'VIN_SPECIFIC']
  const STATES = ['EDIT', 'UNDER_APPROVAL', 'APPROVED', 'RELEASE_CANDIDATE', 'RELEASED', 'DEPRECATED']

  return (
    <div className="herko-page">
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h2>Calibration Datasets</h2>
        <p style={{ color: '#666666', fontSize: 13, marginTop: -8, marginBottom: 20 }}>
          Manage calibration datasets across the HERKO ECU lifecycle
        </p>

        {/* Filters */}
        <div className="herko-filters">
          <div className="herko-search-wrap">
            <svg className="herko-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              className="herko-input"
              style={{ width: 280, paddingLeft: 32 }}
              placeholder="Search… DS ID / Variant / VIN"
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            />
          </div>
          <select className="herko-select" style={{ width: 180 }}
            value={filters.swRelease} onChange={e => setFilters(f => ({ ...f, swRelease: e.target.value }))}>
            <option value="all">All SW Releases</option>
            {swReleases.map(sr => <option key={sr.id} value={sr.id}>{sr.software_release_identifier}</option>)}
          </select>
          <select className="herko-select" style={{ width: 160 }}
            value={filters.context} onChange={e => setFilters(f => ({ ...f, context: e.target.value }))}>
            <option value="all">All Contexts</option>
            {CONTEXTS.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
          </select>
          <select className="herko-select" style={{ width: 160 }}
            value={filters.lifecycleState} onChange={e => setFilters(f => ({ ...f, lifecycleState: e.target.value }))}>
            <option value="all">All States</option>
            {STATES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
          <Button variant="primary" onClick={() => navigate('/herko/datasets/create')} style={{ marginLeft: 'auto' }}>
            + New Dataset
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="herko-card" style={{ padding: 0 }}>
        {loading ? (
          <div className="herko-loading">Loading datasets…</div>
        ) : (
          <div style={{ padding: '0 0 16px' }}>
            <DataTable
              columns={columns}
              data={filtered}
              selectable
              onRowClick={row => navigate(`/herko/datasets/${row.id}`)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
