import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { toast } from 'sonner'
import Button from '../../components/herko/Button'

// ── Constants ────────────────────────────────────────────────────────────────

const CONFIDENCE_COLORS = {
  VALIDATED:  { background: '#DCFCE7', color: '#14532D' },
  DOCUMENTED: { background: '#DBEAFE', color: '#1E3A5F' },
  CALIBRATED: { background: '#FEF3C7', color: '#78350F' },
  EMPTY:      { background: '#F3F4F6', color: '#6B7280' },
}

const LEVEL_COLORS = {
  CONFIGURATION:   { background: '#F3E8FF', color: '#4C1D95' },
  CARRY_OVER:      { background: '#E0F2FE', color: '#0C4A6E' },
  VARIANT_SPECIFIC:{ background: '#FEF3C7', color: '#78350F' },
  VEHICLE_SPECIFIC:{ background: '#FEE2E2', color: '#7F1D1D' },
}

const LEVELS       = ['CONFIGURATION', 'CARRY_OVER', 'VARIANT_SPECIFIC', 'VEHICLE_SPECIFIC']
const CONFIDENCES  = ['EMPTY', 'CALIBRATED', 'VALIDATED', 'DOCUMENTED']
const DATA_TYPES   = ['FLOAT', 'UBYTE', 'SBYTE', 'UWORD', 'SWORD', 'ULONG', 'SLONG', 'FLOAT32_IEEE', 'FLOAT64_IEEE', 'VALUE', 'STRING']

const EMPTY_LABEL_FORM = {
  label_name: '', data_type: 'FLOAT', current_value: '', level: 'CONFIGURATION',
  confidence_status: 'EMPTY', regulatory_relevance: 'NO', parametrizable_in_customer: 'NO',
  change_justification: '', comments: '', maturity: '',
}

// ── A2L Parser ───────────────────────────────────────────────────────────────

function parseA2L(content) {
  const results = []
  const seen = new Set()
  const re = /\/begin\s+(CHARACTERISTIC|MEASUREMENT)\s+(\w+)\s+"([^"]*)"/gi
  let m
  while ((m = re.exec(content)) !== null) {
    const [, btype, name, desc] = m
    if (seen.has(name)) continue
    seen.add(name)
    const snippet = content.slice(m.index + m[0].length, m.index + m[0].length + 300)
    const dtMatch = snippet.match(/\b(FLOAT32_IEEE|FLOAT64_IEEE|UBYTE|SBYTE|UWORD|SWORD|ULONG|SLONG)\b/i)
    results.push({
      label_name: name,
      description: desc,
      data_type: dtMatch ? dtMatch[0].toUpperCase() : (btype.toUpperCase() === 'CHARACTERISTIC' ? 'FLOAT' : 'VALUE'),
      block_type: btype.toUpperCase(),
    })
  }
  return results
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Chip({ label, style }) {
  return <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', ...style }}>{label}</span>
}

function ConfidenceBadge({ v }) {
  const s = CONFIDENCE_COLORS[v] || CONFIDENCE_COLORS.EMPTY
  return <Chip label={v || 'EMPTY'} style={s} />
}

function LevelBadge({ v }) {
  const s = LEVEL_COLORS[v] || {}
  return <Chip label={v || '—'} style={{ background: '#F3F4F6', color: '#374151', ...s }} />
}

function MaturityBar({ v }) {
  const pct = v === 'Deprecated' ? 0 : Number(v) || 0
  const color = pct === 100 ? '#22C55E' : pct >= 75 ? '#3B82F6' : pct >= 25 ? '#F59E0B' : '#E5E7EB'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 48, height: 6, background: '#E5E7EB', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 10, color: '#666' }}>{v === 'Deprecated' ? 'DEP' : v != null ? `${v}%` : '—'}</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HerkoLabelsPage() {
  const navigate = useNavigate()
  const [datasets, setDatasets] = useState([])
  const [labels, setLabels] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')

  // Filters
  const [search, setSearch] = useState('')
  const [filterConf, setFilterConf] = useState('all')
  const [filterReg, setFilterReg] = useState('all')
  const [filterModified, setFilterModified] = useState(false)

  // Selection (for bulk)
  const [selected, setSelected] = useState(new Set())

  // Bulk action state
  const [bulkConf, setBulkConf] = useState('')
  const [bulkLevel, setBulkLevel] = useState('')
  const [bulkReg, setBulkReg] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)

  // Modals
  const [editLabel, setEditLabel] = useState(null)    // label object
  const [editForm, setEditForm] = useState({})
  const [editBusy, setEditBusy] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ ...EMPTY_LABEL_FORM, dataset_id: '' })
  const [createBusy, setCreateBusy] = useState(false)

  const [importStep, setImportStep] = useState(0)    // 0=closed, 1=file, 2=select DS
  const [a2lContent, setA2LContent] = useState('')
  const [a2lPreview, setA2LPreview] = useState('')
  const [a2lParsed, setA2LParsed] = useState([])
  const [importDatasetId, setImportDatasetId] = useState('')
  const [importBusy, setImportBusy] = useState(false)

  // Accordions (By Dataset tab)
  const [openAccordions, setOpenAccordions] = useState(new Set())

  const fileRef = useRef(null)

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const dsRes = await api.get('/datasets')
      const dsList = dsRes.data || []
      setDatasets(dsList)
      const all = []
      await Promise.allSettled(dsList.map(async ds => {
        try {
          const r = await api.get(`/datasets/${ds.id}/labels`)
          ;(r.data || []).forEach(l => all.push({ ...l, _dataset_name: ds.dataset_name, _lifecycle: ds.lifecycle_state, _ds_id: ds.id }))
        } catch {}
      }))
      setLabels(all)
    } catch { toast.error('Failed to load labels') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Derived ───────────────────────────────────────────────────────────────

  const allFiltered = labels.filter(l => {
    if (search && !l.label_name?.toLowerCase().includes(search.toLowerCase()) &&
        !l.data_type?.toLowerCase().includes(search.toLowerCase())) return false
    if (filterConf !== 'all' && l.confidence_status !== filterConf) return false
    if (filterReg !== 'all' && l.regulatory_relevance !== filterReg) return false
    if (filterModified && !l.modified) return false
    return true
  })

  const dsMap = Object.fromEntries(datasets.map(d => [d.id, d]))

  const byDataset = datasets.map(ds => ({
    ds,
    lbls: labels.filter(l => l._ds_id === ds.id || l.dataset_id === ds.id),
  })).filter(g => g.lbls.length > 0)

  const orphans = labels.filter(l => !l.dataset_id || !dsMap[l.dataset_id])

  // ── Selection ─────────────────────────────────────────────────────────────

  const toggleAll = () => {
    if (selected.size === allFiltered.length) setSelected(new Set())
    else setSelected(new Set(allFiltered.map(l => l.id)))
  }
  const toggleRow = id => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  // ── Bulk actions ──────────────────────────────────────────────────────────

  const applyBulk = async (field, value) => {
    if (!value) return
    const targets = allFiltered.filter(l => selected.has(l.id))
    if (!targets.length) return
    setBulkBusy(true)
    const results = await Promise.allSettled(targets.map(l =>
      l.dataset_id
        ? api.patch(`/v1/datasets/${l.dataset_id}/labels/${l.id}`, { [field]: value })
        : Promise.reject(new Error('orphan'))
    ))
    const failed = results.filter(r => r.status === 'rejected').length
    if (failed) toast.error(`${failed} labels failed to update`)
    else toast.success(`${targets.length} labels updated`)
    setBulkBusy(false)
    setSelected(new Set())
    setBulkConf(''); setBulkLevel(''); setBulkReg('')
    load()
  }

  // ── Export CSV ────────────────────────────────────────────────────────────

  const exportCSV = () => {
    const hdrs = ['Label Name', 'Dataset', 'Data Type', 'Current Value', 'Level', 'Confidence', 'Regulatory', 'Maturity']
    const rows = allFiltered.map(l => [
      l.label_name, l._dataset_name || l.dataset_id || '', l.data_type || '',
      l.current_value || '', l.level || '', l.confidence_status || '',
      l.regulatory_relevance || '', l.maturity ?? '',
    ])
    const csv = [hdrs, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `labels_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // ── Edit label ────────────────────────────────────────────────────────────

  const openEdit = (lbl) => {
    setEditLabel(lbl)
    setEditForm({ ...EMPTY_LABEL_FORM, ...lbl })
  }

  const saveEdit = async () => {
    if (!editLabel) return
    const valueChanged = editForm.current_value !== editLabel.current_value
    if (valueChanged && !editForm.change_justification?.trim()) {
      toast.error('Change justification required when modifying value')
      return
    }
    setEditBusy(true)
    try {
      await api.patch(`/v1/datasets/${editLabel.dataset_id}/labels/${editLabel.id}`, {
        current_value: editForm.current_value || null,
        level: editForm.level || null,
        confidence_status: editForm.confidence_status || null,
        regulatory_relevance: editForm.regulatory_relevance || null,
        parametrizable_in_customer: editForm.parametrizable_in_customer || null,
        change_justification: editForm.change_justification || null,
        comments: editForm.comments || null,
      })
      toast.success('Label saved')
      setEditLabel(null)
      load()
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed') }
    finally { setEditBusy(false) }
  }

  // ── Create label ──────────────────────────────────────────────────────────

  const saveCreate = async () => {
    if (!createForm.label_name.trim()) { toast.error('Label name required'); return }
    setCreateBusy(true)
    try {
      // Use old route to create label directly
      await api.post(`/datasets/${createForm.dataset_id || 'orphan'}/labels`, createForm)
      toast.success('Label created')
      setCreateOpen(false)
      setCreateForm({ ...EMPTY_LABEL_FORM, dataset_id: '' })
      load()
    } catch (e) { toast.error(e.response?.data?.detail || 'Create failed') }
    finally { setCreateBusy(false) }
  }

  // ── Import A2L ────────────────────────────────────────────────────────────

  const handleA2LFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const content = ev.target.result
      setA2LContent(content)
      setA2LPreview(content.split('\n').slice(0, 6).join('\n'))
    }
    reader.readAsText(file)
  }

  const parseAndContinue = () => {
    const parsed = parseA2L(a2lContent)
    if (!parsed.length) { toast.error('No labels found in A2L file'); return }
    setA2LParsed(parsed)
    setImportStep(2)
  }

  const importA2L = async () => {
    if (!importDatasetId) { toast.error('Select a dataset'); return }
    setImportBusy(true)
    try {
      const res = await api.post(`/v1/datasets/${importDatasetId}/labels/import-a2l`, { a2l_content: a2lContent })
      toast.success(`${res.data.imported} labels imported`)
      setImportStep(0); setA2LContent(''); setA2LParsed([]); setImportDatasetId('')
      load()
    } catch (e) { toast.error(e.response?.data?.detail || 'Import failed') }
    finally { setImportBusy(false) }
  }

  // ── Table row ─────────────────────────────────────────────────────────────

  const TR = ({ lbl, showDataset = true }) => (
    <tr
      style={{ borderBottom: '1px solid #F0F0F0', background: selected.has(lbl.id) ? '#F0FDF4' : '' }}
      onMouseEnter={e => { if (!selected.has(lbl.id)) e.currentTarget.style.background = '#FAFAFA' }}
      onMouseLeave={e => { if (!selected.has(lbl.id)) e.currentTarget.style.background = '' }}
    >
      <td style={{ padding: '0.5rem 0.75rem', width: 36 }} onClick={e => e.stopPropagation()}>
        <input type="checkbox" checked={selected.has(lbl.id)} onChange={() => toggleRow(lbl.id)}
          style={{ cursor: 'pointer' }} />
      </td>
      <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
        {lbl.label_name}
      </td>
      {showDataset && (
        <td style={{ padding: '0.5rem 0.75rem', fontSize: 12 }}>
          {lbl.dataset_id
            ? <span style={{ color: '#0078D4', cursor: 'pointer' }} onClick={() => navigate(`/herko/datasets/${lbl._ds_id || lbl.dataset_id}`)}>
                {lbl._dataset_name || lbl.dataset_id?.slice(0,8) + '…'}
              </span>
            : <span style={{ color: '#EF4444', fontSize: 11 }}>orphan</span>
          }
        </td>
      )}
      <td style={{ padding: '0.5rem 0.75rem', fontSize: 11, color: '#666' }}>{lbl.data_type || '—'}</td>
      <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: 11 }}>{lbl.current_value ?? '—'}</td>
      <td style={{ padding: '0.5rem 0.75rem' }}><LevelBadge v={lbl.level} /></td>
      <td style={{ padding: '0.5rem 0.75rem' }}><ConfidenceBadge v={lbl.confidence_status} /></td>
      <td style={{ padding: '0.5rem 0.75rem' }}>
        {lbl.regulatory_relevance === 'YES'
          ? <Chip label="YES" style={{ background: '#FEE2E2', color: '#7F1D1D' }} />
          : <span style={{ color: '#CCC', fontSize: 11 }}>NO</span>}
      </td>
      <td style={{ padding: '0.5rem 0.75rem' }}><MaturityBar v={lbl.maturity} /></td>
      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>
        <button onClick={() => openEdit(lbl)}
          style={{ background: 'none', border: '1px solid #E5E5E5', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}>
          Edit
        </button>
      </td>
    </tr>
  )

  const THead = ({ showDataset = true }) => (
    <thead>
      <tr style={{ borderBottom: '2px solid #E5E5E5', background: '#FAFAFA' }}>
        <th style={{ padding: '0.6rem 0.75rem', width: 36 }}>
          <input type="checkbox"
            checked={allFiltered.length > 0 && selected.size === allFiltered.length}
            onChange={toggleAll} style={{ cursor: 'pointer' }} />
        </th>
        {['Label Name', showDataset && 'Dataset', 'Type', 'Value', 'Level', 'Confidence', 'Regulatory', 'Maturity', ''].filter(Boolean).map(h => (
          <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#666', whiteSpace: 'nowrap' }}>{h}</th>
        ))}
      </tr>
    </thead>
  )

  // ── Label form fields (reused in Edit + Create) ───────────────────────────

  const LabelFormFields = ({ form, setForm, showName = true, showDataset = false }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {showName && (
        <div>
          <label style={{ display: 'block', fontSize: '0.78rem', marginBottom: 3, color: '#666' }}>Label Name *</label>
          <input className="herko-input" style={{ width: '100%', boxSizing: 'border-box' }}
            value={form.label_name || ''} readOnly={!showDataset}
            onChange={e => setForm(f => ({ ...f, label_name: e.target.value }))} />
        </div>
      )}
      {showDataset && (
        <div>
          <label style={{ display: 'block', fontSize: '0.78rem', marginBottom: 3, color: '#666' }}>Dataset</label>
          <select className="herko-select" style={{ width: '100%' }}
            value={form.dataset_id || ''} onChange={e => setForm(f => ({ ...f, dataset_id: e.target.value }))}>
            <option value="">None (orphan)</option>
            {datasets.filter(d => d.lifecycle_state === 'EDIT').map(d =>
              <option key={d.id} value={d.id}>{d.dataset_name}</option>)}
          </select>
        </div>
      )}
      {showDataset && (
        <div>
          <label style={{ display: 'block', fontSize: '0.78rem', marginBottom: 3, color: '#666' }}>Data Type *</label>
          <select className="herko-select" style={{ width: '100%' }}
            value={form.data_type || 'FLOAT'} onChange={e => setForm(f => ({ ...f, data_type: e.target.value }))}>
            {DATA_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '0.78rem', marginBottom: 3, color: '#666' }}>Current Value</label>
          <input className="herko-input" style={{ width: '100%', boxSizing: 'border-box' }}
            value={form.current_value || ''} onChange={e => setForm(f => ({ ...f, current_value: e.target.value }))} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '0.78rem', marginBottom: 3, color: '#666' }}>Maturity %</label>
          <input className="herko-input" style={{ width: '100%', boxSizing: 'border-box' }} type="number" min="0" max="100"
            value={form.maturity || ''} onChange={e => setForm(f => ({ ...f, maturity: e.target.value }))} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '0.78rem', marginBottom: 3, color: '#666' }}>Level</label>
          <select className="herko-select" style={{ width: '100%' }}
            value={form.level || 'CONFIGURATION'} onChange={e => setForm(f => ({ ...f, level: e.target.value }))}>
            {LEVELS.map(l => <option key={l}>{l}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '0.78rem', marginBottom: 3, color: '#666' }}>Confidence</label>
          <select className="herko-select" style={{ width: '100%' }}
            value={form.confidence_status || 'EMPTY'} onChange={e => setForm(f => ({ ...f, confidence_status: e.target.value }))}>
            {CONFIDENCES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '0.78rem', marginBottom: 3, color: '#666' }}>Regulatory</label>
          <select className="herko-select" style={{ width: '100%' }}
            value={form.regulatory_relevance || 'NO'} onChange={e => setForm(f => ({ ...f, regulatory_relevance: e.target.value }))}>
            <option>NO</option><option>YES</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '0.78rem', marginBottom: 3, color: '#666' }}>Param. Customer</label>
          <select className="herko-select" style={{ width: '100%' }}
            value={form.parametrizable_in_customer || 'NO'} onChange={e => setForm(f => ({ ...f, parametrizable_in_customer: e.target.value }))}>
            <option>NO</option><option>YES</option>
          </select>
        </div>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.78rem', marginBottom: 3, color: '#666' }}>
          Change Justification {showName && !showDataset && <span style={{ color: '#EF4444' }}>*</span>}
        </label>
        <textarea className="herko-input" style={{ width: '100%', boxSizing: 'border-box', minHeight: 56, resize: 'vertical' }}
          placeholder="Required if value changed…"
          value={form.change_justification || ''} onChange={e => setForm(f => ({ ...f, change_justification: e.target.value }))} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.78rem', marginBottom: 3, color: '#666' }}>Comments</label>
        <textarea className="herko-input" style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, resize: 'vertical' }}
          value={form.comments || ''} onChange={e => setForm(f => ({ ...f, comments: e.target.value }))} />
      </div>
    </div>
  )

  // ── Modal shell ───────────────────────────────────────────────────────────

  const Modal = ({ title, onClose, children, width = 520 }) => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, overflowY: 'auto', padding: '1rem' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: '1.75rem', width: '100%', maxWidth: width, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 700 }}>{title}</h3>
        {children}
      </div>
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="herko-page">
      {/* Header */}
      <div className="herko-page-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h1 className="herko-page-title" style={{ margin: 0 }}>Labels Manager</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--herko-muted, #666)', marginTop: '0.2rem' }}>
            Manage calibration parameters across all datasets.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button variant="secondary" size="sm" onClick={() => { setImportStep(1) }}>Import A2L ↓</Button>
          <Button variant="secondary" size="sm" onClick={() => setCreateOpen(true)}>+ Add Label</Button>
          <Button variant="secondary" size="sm" onClick={exportCSV}>Export CSV ↓</Button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid #E5E5E5', marginBottom: '1.25rem' }}>
        {[
          { key: 'all', label: `All Labels (${labels.length})` },
          { key: 'by-dataset', label: `By Dataset (${byDataset.length})` },
          { key: 'orphan', label: `Orphan (${orphans.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.6rem 1.25rem', fontSize: '0.875rem', fontWeight: 600,
              color: activeTab === t.key ? '#2D5016' : '#666',
              borderBottom: activeTab === t.key ? '2px solid #2D5016' : '2px solid transparent', marginBottom: -2 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: All Labels ── */}
      {activeTab === 'all' && (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input className="herko-input" style={{ flex: '1 1 180px' }} placeholder="Search label name, type…"
              value={search} onChange={e => setSearch(e.target.value)} />
            <select className="herko-select" value={filterConf} onChange={e => setFilterConf(e.target.value)}>
              <option value="all">All Confidence</option>
              {CONFIDENCES.map(c => <option key={c}>{c}</option>)}
            </select>
            <select className="herko-select" value={filterReg} onChange={e => setFilterReg(e.target.value)}>
              <option value="all">All Regulatory</option>
              <option value="YES">YES</option>
              <option value="NO">NO</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={filterModified} onChange={e => setFilterModified(e.target.checked)} />
              Modified only
            </label>
            <span style={{ fontSize: 12, color: '#999', marginLeft: 'auto' }}>{allFiltered.length} labels</span>
          </div>

          <div className="herko-card" style={{ padding: 0, overflow: 'hidden' }}>
            {loading ? (
              <div className="herko-loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <THead showDataset />
                  <tbody>
                    {allFiltered.length === 0
                      ? <tr><td colSpan={10} style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>No labels found.</td></tr>
                      : allFiltered.map(l => <TR key={l.id || l.label_name} lbl={l} showDataset />)
                    }
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── TAB: By Dataset ── */}
      {activeTab === 'by-dataset' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {loading
            ? <div className="herko-loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div>
            : byDataset.length === 0
              ? <div style={{ padding: '2rem', textAlign: 'center', color: '#999', fontSize: 13 }}>No datasets with labels.</div>
              : byDataset.map(({ ds, lbls }) => {
                  const open = openAccordions.has(ds.id)
                  return (
                    <div key={ds.id} className="herko-card" style={{ padding: 0, overflow: 'hidden' }}>
                      <button
                        onClick={() => setOpenAccordions(prev => { const n = new Set(prev); n.has(ds.id) ? n.delete(ds.id) : n.add(ds.id); return n })}
                        style={{ width: '100%', background: '#FAFAFA', border: 'none', borderBottom: open ? '1px solid #E5E5E5' : 'none', padding: '0.75rem 1rem', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 600, fontSize: '0.875rem' }}>
                        <span style={{ fontSize: 12 }}>{open ? '▼' : '▶'}</span>
                        {ds.dataset_name}
                        <span style={{ fontSize: 12, color: '#999', fontWeight: 400 }}>({lbls.length} labels)</span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#666' }}>{ds.lifecycle_state}</span>
                      </button>
                      {open && (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid #E5E5E5', background: '#FEFEFE' }}>
                                {['Label Name', 'Type', 'Value', 'Level', 'Confidence', 'Regulatory', 'Maturity', ''].map(h =>
                                  <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.72rem', fontWeight: 600, color: '#666' }}>{h}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {lbls.map(l => (
                                <tr key={l.id || l.label_name} style={{ borderBottom: '1px solid #F5F5F5' }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#FAFAFA'}
                                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                                  <td style={{ padding: '0.4rem 0.75rem', fontFamily: 'monospace', fontSize: 11, fontWeight: 600 }}>{l.label_name}</td>
                                  <td style={{ padding: '0.4rem 0.75rem', fontSize: 11, color: '#666' }}>{l.data_type || '—'}</td>
                                  <td style={{ padding: '0.4rem 0.75rem', fontFamily: 'monospace', fontSize: 11 }}>{l.current_value ?? '—'}</td>
                                  <td style={{ padding: '0.4rem 0.75rem' }}><LevelBadge v={l.level} /></td>
                                  <td style={{ padding: '0.4rem 0.75rem' }}><ConfidenceBadge v={l.confidence_status} /></td>
                                  <td style={{ padding: '0.4rem 0.75rem' }}>
                                    {l.regulatory_relevance === 'YES'
                                      ? <Chip label="YES" style={{ background: '#FEE2E2', color: '#7F1D1D' }} />
                                      : <span style={{ color: '#CCC', fontSize: 10 }}>NO</span>}
                                  </td>
                                  <td style={{ padding: '0.4rem 0.75rem' }}><MaturityBar v={l.maturity} /></td>
                                  <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right' }}>
                                    <button onClick={() => openEdit(l)}
                                      style={{ background: 'none', border: '1px solid #E5E5E5', borderRadius: 3, padding: '1px 7px', cursor: 'pointer', fontSize: 11 }}>Edit</button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })
          }
        </div>
      )}

      {/* ── TAB: Orphan Labels ── */}
      {activeTab === 'orphan' && (
        <div className="herko-card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div className="herko-loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div>
          ) : orphans.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#999', fontSize: 13 }}>No orphan labels.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #E5E5E5', background: '#FAFAFA' }}>
                    {['Label Name', 'Type', 'Value', 'Level', 'Confidence', ''].map(h =>
                      <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#666' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {orphans.map(l => (
                    <tr key={l.id || l.label_name} style={{ borderBottom: '1px solid #F0F0F0' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#FAFAFA'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>{l.label_name}</td>
                      <td style={{ padding: '0.5rem 0.75rem', fontSize: 11, color: '#666' }}>{l.data_type || '—'}</td>
                      <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: 11 }}>{l.current_value ?? '—'}</td>
                      <td style={{ padding: '0.5rem 0.75rem' }}><LevelBadge v={l.level} /></td>
                      <td style={{ padding: '0.5rem 0.75rem' }}><ConfidenceBadge v={l.confidence_status} /></td>
                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>
                        <button onClick={() => openEdit(l)}
                          style={{ background: 'none', border: '1px solid #E5E5E5', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}>Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Bulk action bar ── */}
      {selected.size > 0 && (
        <div style={{ position: 'fixed', bottom: '1.25rem', left: '50%', transform: 'translateX(-50%)', background: '#1F2937', color: '#fff', borderRadius: 10, padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', boxShadow: '0 8px 30px rgba(0,0,0,0.3)', zIndex: 500, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>{selected.size} selected</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, opacity: 0.7 }}>Confidence:</span>
            <select style={{ fontSize: 11, padding: '3px 6px', borderRadius: 4, border: 'none' }}
              value={bulkConf} onChange={e => setBulkConf(e.target.value)}>
              <option value="">—</option>
              {CONFIDENCES.map(c => <option key={c}>{c}</option>)}
            </select>
            <button onClick={() => applyBulk('confidence_status', bulkConf)} disabled={!bulkConf || bulkBusy}
              style={{ background: '#3B82F6', border: 'none', color: '#fff', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}>Apply</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, opacity: 0.7 }}>Level:</span>
            <select style={{ fontSize: 11, padding: '3px 6px', borderRadius: 4, border: 'none' }}
              value={bulkLevel} onChange={e => setBulkLevel(e.target.value)}>
              <option value="">—</option>
              {LEVELS.map(l => <option key={l}>{l}</option>)}
            </select>
            <button onClick={() => applyBulk('level', bulkLevel)} disabled={!bulkLevel || bulkBusy}
              style={{ background: '#3B82F6', border: 'none', color: '#fff', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}>Apply</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, opacity: 0.7 }}>Regulatory:</span>
            <select style={{ fontSize: 11, padding: '3px 6px', borderRadius: 4, border: 'none' }}
              value={bulkReg} onChange={e => setBulkReg(e.target.value)}>
              <option value="">—</option>
              <option>YES</option><option>NO</option>
            </select>
            <button onClick={() => applyBulk('regulatory_relevance', bulkReg)} disabled={!bulkReg || bulkBusy}
              style={{ background: '#3B82F6', border: 'none', color: '#fff', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}>Apply</button>
          </div>
          <button onClick={() => setSelected(new Set())}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 11, marginLeft: 4 }}>
            Clear
          </button>
        </div>
      )}

      {/* ── Modal: Edit Label ── */}
      {editLabel && (
        <Modal title={`Edit — ${editLabel.label_name}`} onClose={() => setEditLabel(null)}>
          <LabelFormFields form={editForm} setForm={setEditForm} showName={false} />
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
            <Button variant="ghost" onClick={() => setEditLabel(null)}>Cancel</Button>
            <Button variant="primary" onClick={saveEdit} disabled={editBusy}>{editBusy ? 'Saving…' : 'Save'}</Button>
          </div>
        </Modal>
      )}

      {/* ── Modal: Create Label ── */}
      {createOpen && (
        <Modal title="New Label" onClose={() => setCreateOpen(false)}>
          <LabelFormFields form={createForm} setForm={setCreateForm} showName showDataset />
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveCreate} disabled={createBusy}>{createBusy ? 'Creating…' : 'Create'}</Button>
          </div>
        </Modal>
      )}

      {/* ── Modal: Import A2L ── */}
      {importStep > 0 && (
        <Modal title="Import Labels from A2L" onClose={() => { setImportStep(0); setA2LContent(''); setA2LParsed([]) }} width={560}>
          {/* Step indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.25rem' }}>
            {[1, 2].map(n => (
              <React.Fragment key={n}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, background: importStep >= n ? '#2D5016' : '#E5E5E5', color: importStep >= n ? '#fff' : '#666' }}>{n}</div>
                {n < 2 && <div style={{ flex: 1, height: 2, background: importStep > 1 ? '#2D5016' : '#E5E5E5' }} />}
              </React.Fragment>
            ))}
            <span style={{ marginLeft: 8, fontSize: 12, color: '#666' }}>{importStep === 1 ? 'Select A2L File' : 'Confirm & Import'}</span>
          </div>

          {importStep === 1 && (
            <>
              <div style={{ border: '2px dashed #D1D5DB', borderRadius: 8, padding: '1.5rem', textAlign: 'center', marginBottom: '1rem' }}>
                <div style={{ fontSize: 13, color: '#666', marginBottom: '0.75rem' }}>Drop A2L file or click to select</div>
                <input ref={fileRef} type="file" accept=".a2l" style={{ display: 'none' }} onChange={handleA2LFile} />
                <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>Select .a2l file</Button>
              </div>
              {a2lPreview && (
                <div>
                  <div style={{ fontSize: '0.78rem', color: '#666', marginBottom: 4 }}>Preview (first 6 lines):</div>
                  <pre style={{ background: '#F9FAFB', border: '1px solid #E5E5E5', borderRadius: 6, padding: '0.75rem', fontSize: 11, overflowX: 'auto', maxHeight: 120, margin: 0 }}>
                    {a2lPreview}
                  </pre>
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                <Button variant="ghost" onClick={() => { setImportStep(0); setA2LContent('') }}>Cancel</Button>
                <Button variant="primary" disabled={!a2lContent} onClick={parseAndContinue}>Parse & Continue →</Button>
              </div>
            </>
          )}

          {importStep === 2 && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', marginBottom: 4, color: '#666' }}>Target Dataset (EDIT state only)</label>
                <select className="herko-select" style={{ width: '100%' }} value={importDatasetId} onChange={e => setImportDatasetId(e.target.value)}>
                  <option value="">Select dataset…</option>
                  {datasets.filter(d => d.lifecycle_state === 'EDIT').map(d =>
                    <option key={d.id} value={d.id}>{d.dataset_name}</option>)}
                </select>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#666', marginBottom: 6 }}>
                Found <strong>{a2lParsed.length}</strong> labels to import:
              </div>
              <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #E5E5E5', borderRadius: 6 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: '#FAFAFA', borderBottom: '1px solid #E5E5E5' }}>
                      <th style={{ padding: '0.4rem 0.75rem', textAlign: 'left' }}>Label Name</th>
                      <th style={{ padding: '0.4rem 0.75rem', textAlign: 'left' }}>Type</th>
                      <th style={{ padding: '0.4rem 0.75rem', textAlign: 'left' }}>Block</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a2lParsed.slice(0, 50).map((l, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #F5F5F5' }}>
                        <td style={{ padding: '0.35rem 0.75rem', fontFamily: 'monospace', fontWeight: 600 }}>{l.label_name}</td>
                        <td style={{ padding: '0.35rem 0.75rem', color: '#666' }}>{l.data_type}</td>
                        <td style={{ padding: '0.35rem 0.75rem', color: '#999' }}>{l.block_type}</td>
                      </tr>
                    ))}
                    {a2lParsed.length > 50 && (
                      <tr><td colSpan={3} style={{ padding: '0.35rem 0.75rem', color: '#999', textAlign: 'center' }}>…and {a2lParsed.length - 50} more</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                <Button variant="ghost" onClick={() => setImportStep(1)}>← Back</Button>
                <Button variant="primary" disabled={!importDatasetId || importBusy} onClick={importA2L}>
                  {importBusy ? 'Importing…' : `Import ${a2lParsed.length} Labels`}
                </Button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  )
}
