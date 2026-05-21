import React, { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'
import { toast } from 'sonner'
import DataTable from '../../components/herko/DataTable'
import StateBadge from '../../components/herko/StateBadge'

export default function HerkoLabelsPage() {
  const [labels, setLabels] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterOwner, setFilterOwner] = useState('all')
  const [filterMaturity, setFilterMaturity] = useState('all')

  const load = useCallback(async () => {
    try {
      const dsRes = await api.get('/datasets')
      // collect labels from first few datasets
      const allLabels = []
      for (const ds of dsRes.data.slice(0, 5)) {
        try {
          const r = await api.get(`/datasets/${ds.id}/labels`)
          allLabels.push(...r.data.map(l => ({ ...l, _dataset_name: ds.dataset_name, _lifecycle: ds.lifecycle_state })))
        } catch {}
      }
      setLabels(allLabels)
    } catch { toast.error('Failed to load') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = labels.filter(l => {
    if (search && !l.label_name?.toLowerCase().includes(search.toLowerCase())) return false
    if (filterOwner !== 'all' && l.owner !== filterOwner) return false
    if (filterMaturity !== 'all' && l.maturity !== filterMaturity) return false
    return true
  })

  const columns = [
    { key: 'label_name', label: 'Label', width: '200px' },
    { key: 'current_value', label: 'Value', width: '90px' },
    { key: 'unit', label: 'Unit', width: '70px' },
    { key: 'level', label: 'Level', width: '130px' },
    {
      key: 'confidence_status', label: 'Confidence', width: '110px',
      render: v => <span style={{ fontSize: 12, fontWeight: 600 }}>{v}</span>
    },
    {
      key: 'owner', label: 'Owner', width: '90px',
      render: v => {
        const c = { BeGas: '#2D5016', HERKO: '#0078D4', Shared: '#FF8C00' }
        return <span style={{ color: c[v] || '#666', fontWeight: 600, fontSize: 12 }}>{v}</span>
      }
    },
    {
      key: 'maturity', label: 'Maturity', width: '80px',
      render: v => <span style={{ fontSize: 12, fontWeight: 600, color: v === '100' ? '#7CBA00' : '#FF8C00' }}>{v === 'Deprecated' ? 'DEP' : v !== undefined ? `${v}%` : '—'}</span>
    },
    {
      key: '_dataset_name', label: 'Dataset', width: '180px',
      render: (v, row) => <span style={{ fontSize: 12 }}><StateBadge state={row._lifecycle} />&nbsp;{v}</span>
    },
  ]

  return (
    <div className="herko-page">
      <h2>Labels</h2>
      <p style={{ color: '#666', fontSize: 13, marginTop: -8, marginBottom: 20 }}>All calibration labels across datasets</p>

      <div className="herko-filters">
        <div className="herko-search-wrap">
          <svg className="herko-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input className="herko-input" style={{ width: 260, paddingLeft: 32 }}
            placeholder="Search labels…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="herko-select" style={{ width: 140 }}
          value={filterOwner} onChange={e => setFilterOwner(e.target.value)}>
          <option value="all">All owners</option>
          <option value="BeGas">BeGas</option>
          <option value="HERKO">HERKO</option>
          <option value="Shared">Shared</option>
        </select>
        <select className="herko-select" style={{ width: 140 }}
          value={filterMaturity} onChange={e => setFilterMaturity(e.target.value)}>
          <option value="all">All maturity</option>
          <option value="0">0%</option>
          <option value="25">25%</option>
          <option value="75">75%</option>
          <option value="100">100%</option>
          <option value="Deprecated">Deprecated</option>
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#666' }}>{filtered.length} labels</span>
      </div>

      <div className="herko-card" style={{ padding: 0 }}>
        {loading ? <div className="herko-loading">Loading labels…</div>
          : <DataTable columns={columns} data={filtered} selectable />}
      </div>
    </div>
  )
}
