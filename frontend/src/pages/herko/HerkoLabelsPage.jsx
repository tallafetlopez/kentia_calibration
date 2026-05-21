import React, { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'
import { toast } from 'sonner'
import { LifecycleBadge } from '../../lib/constants'
import { Search } from 'lucide-react'

const ownerStyle = {
  BeGas: { background: "#DDEEFF", color: "#004578", border: "1px solid #7EB3E0" },
  HERKO: { background: "#DFF6DD", color: "#1E6B1E", border: "1px solid #82C882" },
  Shared: { background: "#FFF4CE", color: "#7A5C00", border: "1px solid #F0D060" },
}

export default function HerkoLabelsPage() {
  const [labels, setLabels] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterOwner, setFilterOwner] = useState('all')
  const [filterMaturity, setFilterMaturity] = useState('all')

  const load = useCallback(async () => {
    try {
      const dsRes = await api.get('/datasets')
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="page-labels">
      <div style={{ borderBottom: "1px solid #C8C8C8", paddingBottom: 10 }}>
        <div className="tiny-label">Labels</div>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: "4px 0 2px", color: "#212121" }}>Labels</h1>
        <p style={{ fontSize: 12, color: "#605E5C", margin: 0 }}>All calibration labels across datasets.</p>
      </div>

      <div className="panel" style={{ padding: "10px 12px", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
        <div>
          <div className="tiny-label" style={{ marginBottom: 3 }}>Search</div>
          <div style={{ position: "relative" }}>
            <Search size={12} style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", color: "#8A8886" }} />
            <input className="ms-input" style={{ paddingLeft: 22, width: 240 }}
              placeholder="Search labels…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div>
          <div className="tiny-label" style={{ marginBottom: 3 }}>Owner</div>
          <select className="ms-input" style={{ width: 130 }}
            value={filterOwner} onChange={e => setFilterOwner(e.target.value)}>
            <option value="all">All owners</option>
            <option value="BeGas">BeGas</option>
            <option value="HERKO">HERKO</option>
            <option value="Shared">Shared</option>
          </select>
        </div>
        <div>
          <div className="tiny-label" style={{ marginBottom: 3 }}>Maturity</div>
          <select className="ms-input" style={{ width: 130 }}
            value={filterMaturity} onChange={e => setFilterMaturity(e.target.value)}>
            <option value="all">All maturity</option>
            <option value="0">0%</option>
            <option value="25">25%</option>
            <option value="75">75%</option>
            <option value="100">100%</option>
            <option value="Deprecated">Deprecated</option>
          </select>
        </div>
        <span style={{ fontSize: 11, color: "#8A8886", marginLeft: "auto" }}>{filtered.length} labels</span>
      </div>

      <div className="panel" style={{ overflow: "hidden" }}>
        <table className="xl-table">
          <thead>
            <tr>
              <th>Label</th>
              <th style={{ width: 90 }}>Value</th>
              <th style={{ width: 70 }}>Unit</th>
              <th style={{ width: 120 }}>Level</th>
              <th style={{ width: 110 }}>Confidence</th>
              <th style={{ width: 90 }}>Owner</th>
              <th style={{ width: 80 }}>Maturity</th>
              <th>Dataset</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: "center", color: "#8A8886", padding: "20px 0" }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: "center", color: "#8A8886", padding: "20px 0" }}>No labels found.</td></tr>
            ) : filtered.map((l) => (
              <tr key={l.id || l.label_name}>
                <td style={{ fontFamily: "monospace", fontWeight: 600 }}>{l.label_name}</td>
                <td style={{ fontFamily: "monospace", fontSize: 11 }}>{l.current_value}</td>
                <td style={{ fontFamily: "monospace", fontSize: 11, color: "#605E5C" }}>{l.unit || "—"}</td>
                <td style={{ fontSize: 11 }}>{l.level}</td>
                <td style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600 }}>{l.confidence_status}</td>
                <td>
                  {l.owner ? (
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", ...ownerStyle[l.owner] }}>
                      {l.owner}
                    </span>
                  ) : "—"}
                </td>
                <td style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600, color: l.maturity === '100' ? "#1E6B1E" : l.maturity === 'Deprecated' ? "#8B0000" : "#7A5C00" }}>
                  {l.maturity === 'Deprecated' ? 'DEP' : l.maturity !== undefined ? `${l.maturity}%` : "—"}
                </td>
                <td>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <LifecycleBadge state={l._lifecycle} />
                    <span style={{ fontSize: 11 }}>{l._dataset_name}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
