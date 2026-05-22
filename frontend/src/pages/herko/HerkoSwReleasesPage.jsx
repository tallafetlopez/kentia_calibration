import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { toast } from 'sonner'
import Button from '../../components/herko/Button'

const STATUS_STYLE = {
  DRAFT:                 { background: '#F3F4F6', color: '#374151' },
  VALID_FOR_CALIBRATION: { background: '#DCFCE7', color: '#14532D' },
  ARCHIVED:              { background: '#FEF3C7', color: '#78350F' },
}

const STATUS_LABEL = {
  DRAFT:                 'Draft',
  VALID_FOR_CALIBRATION: 'Valid',
  ARCHIVED:              'Archived',
}

const EMPTY_FORM = {
  identifier: '',
  version: '',
  supplier: '',
  description: '',
  release_date: '',
}

export default function HerkoSwReleasesPage() {
  const navigate = useNavigate()
  const [releases, setReleases] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [uploadingId, setUploadingId] = useState(null)
  const fileInputRefs = useRef({})

  const load = useCallback(async () => {
    try {
      const res = await api.get('/software-releases')
      setReleases(res.data || [])
    } catch {
      toast.error('Failed to load SW releases')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = releases.filter(r => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      r.software_release_identifier?.toLowerCase().includes(q) ||
      r.identifier?.toLowerCase().includes(q) ||
      r.supplier?.toLowerCase().includes(q)
    const matchStatus = !statusFilter || r.status === statusFilter
    const matchSupplier = !supplierFilter ||
      r.supplier?.toLowerCase().includes(supplierFilter.toLowerCase())
    return matchSearch && matchStatus && matchSupplier
  })

  const handleCreate = async e => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await api.post('/software-releases', form)
      toast.success('Release created')
      setShowModal(false)
      setForm(EMPTY_FORM)
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create release')
    } finally {
      setSubmitting(false)
    }
  }

  const handleA2LUpload = async (releaseId, file) => {
    setUploadingId(releaseId)
    try {
      const fd = new FormData()
      fd.append('file', file)
      await api.post(`/software-releases/${releaseId}/a2l/upload`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success('A2L uploaded')
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Upload failed')
    } finally {
      setUploadingId(null)
    }
  }

  const formatDate = raw => {
    if (!raw) return '—'
    return new Date(raw).toLocaleDateString('es-ES', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  }

  const getIdentifier = r => r.software_release_identifier || r.identifier || '—'
  const getA2L = r => r.a2l_file_reference || r.a2l_filename || null

  return (
    <div className="herko-page">
      {/* Header */}
      <div className="herko-page-header" style={{ marginBottom: '0.25rem' }}>
        <div>
          <p style={{ fontSize: '0.75rem', color: 'var(--herko-muted, #666)', margin: '0 0 0.25rem' }}>
            Workflow 1
          </p>
          <h1 className="herko-page-title" style={{ margin: 0 }}>Software Releases</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--herko-muted, #666)', marginTop: '0.25rem' }}>
            Register ECU software releases and link A2L / DBC / DTC artefacts.
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowModal(true)}>
          + New Release
        </Button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', margin: '1.25rem 0', flexWrap: 'wrap' }}>
        <input
          className="herko-input"
          style={{ flex: '1 1 200px', minWidth: 0 }}
          placeholder="Search identifier or supplier…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="herko-select"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="VALID_FOR_CALIBRATION">Valid</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <input
          className="herko-input"
          style={{ flex: '0 1 160px' }}
          placeholder="Filter supplier…"
          value={supplierFilter}
          onChange={e => setSupplierFilter(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="herko-card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="herko-loading" style={{ padding: '2rem', textAlign: 'center' }}>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--herko-muted, #666)', fontSize: 13 }}>
            No releases found.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--herko-border, #E5E5E5)', background: 'var(--herko-surface, #FAFAFA)' }}>
                {['Identifier', 'Version', 'Supplier', 'A2L', 'Released', 'Status', ''].map(h => (
                  <th key={h} style={{
                    padding: '0.75rem 1rem',
                    textAlign: 'left',
                    fontWeight: 600,
                    fontSize: '0.78rem',
                    color: 'var(--herko-muted, #666)',
                    whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const statusStyle = STATUS_STYLE[r.status] || STATUS_STYLE.DRAFT
                const isUploading = uploadingId === r.id
                const a2l = getA2L(r)

                return (
                  <tr
                    key={r.id}
                    style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--herko-border, #E5E5E5)' : 'none' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 500 }}>
                      {getIdentifier(r)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>{r.version || '—'}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{r.supplier || '—'}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {a2l ? (
                        <span style={{ color: '#2D5016', fontWeight: 500 }}>📎 {a2l}</span>
                      ) : (
                        <span>
                          <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>missing</span>
                          {' '}
                          <button
                            onClick={() => fileInputRefs.current[r.id]?.click()}
                            disabled={isUploading}
                            style={{
                              background: 'none', border: 'none', color: '#0078D4',
                              cursor: 'pointer', fontSize: '0.8rem', padding: 0,
                              textDecoration: 'underline',
                            }}
                          >
                            {isUploading ? 'Uploading…' : 'Upload'}
                          </button>
                          <input
                            ref={el => fileInputRefs.current[r.id] = el}
                            type="file"
                            accept=".a2l"
                            style={{ display: 'none' }}
                            onChange={e => {
                              const file = e.target.files?.[0]
                              if (file) handleA2LUpload(r.id, file)
                              e.target.value = ''
                            }}
                          />
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                      {formatDate(r.release_date)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{
                        ...statusStyle,
                        padding: '0.2rem 0.6rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}>
                        {STATUS_LABEL[r.status] || r.status || 'Draft'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <button
                        onClick={() => navigate(`/software-releases/${r.id}`)}
                        style={{
                          background: 'none',
                          border: '1px solid var(--herko-border, #E5E5E5)',
                          borderRadius: '6px',
                          padding: '0.3rem 0.7rem',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Open →
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); setForm(EMPTY_FORM) } }}
        >
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            padding: '2rem',
            width: '100%',
            maxWidth: '480px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.1rem', fontWeight: 700 }}>
              New Software Release
            </h2>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem', color: '#666' }}>
                  Identifier <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  className="herko-input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  placeholder="ECM-SW-2025.1"
                  required
                  value={form.identifier}
                  onChange={e => setForm(f => ({ ...f, identifier: e.target.value }))}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem', color: '#666' }}>
                    Version <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    className="herko-input"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    placeholder="1.0.0"
                    required
                    value={form.version}
                    onChange={e => setForm(f => ({ ...f, version: e.target.value }))}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem', color: '#666' }}>
                    Supplier <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    className="herko-input"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    placeholder="Bosch"
                    required
                    value={form.supplier}
                    onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem', color: '#666' }}>
                  Description
                </label>
                <textarea
                  className="herko-input"
                  style={{ width: '100%', boxSizing: 'border-box', minHeight: '70px', resize: 'vertical' }}
                  placeholder="Optional…"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem', color: '#666' }}>
                  Release Date
                </label>
                <input
                  className="herko-input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  type="date"
                  value={form.release_date}
                  onChange={e => setForm(f => ({ ...f, release_date: e.target.value }))}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => { setShowModal(false); setForm(EMPTY_FORM) }}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={submitting}>
                  {submitting ? 'Creating…' : 'Create Release'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
