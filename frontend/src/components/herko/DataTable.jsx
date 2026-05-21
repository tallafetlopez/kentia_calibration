import React, { useState } from 'react'

export default function DataTable({ columns, data, onRowClick, selectable, pageSize = 10 }) {
  const [selected, setSelected] = useState(new Set())
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [page, setPage] = useState(1)

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sorted = sortKey
    ? [...data].sort((a, b) => {
        const av = a[sortKey] ?? ''; const bv = b[sortKey] ?? ''
        return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
      })
    : data

  const totalPages = Math.ceil(sorted.length / pageSize)
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize)

  const toggleAll = () => {
    if (selected.size === paged.length) setSelected(new Set())
    else setSelected(new Set(paged.map(r => r.id)))
  }
  const toggleRow = (id) => {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table className="herko-table">
          <thead>
            <tr>
              {selectable && (
                <th style={{ width: 40 }}>
                  <input type="checkbox" className="herko-checkbox"
                    checked={paged.length > 0 && selected.size === paged.length}
                    onChange={toggleAll} />
                </th>
              )}
              {columns.map(col => (
                <th key={col.key} style={{ width: col.width }} onClick={() => col.sortable !== false && handleSort(col.key)}>
                  {col.label}
                  {sortKey === col.key && <span style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  {sortKey !== col.key && col.sortable !== false && <span style={{ marginLeft: 4, opacity: 0.3 }}>↕</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={columns.length + (selectable ? 1 : 0)} className="herko-empty">No records found</td></tr>
            ) : paged.map(row => (
              <tr
                key={row.id}
                className={selected.has(row.id) ? 'selected' : ''}
                onClick={() => onRowClick && onRowClick(row)}
                style={{ cursor: onRowClick ? 'pointer' : 'default' }}
              >
                {selectable && (
                  <td onClick={e => e.stopPropagation()}>
                    <input type="checkbox" className="herko-checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleRow(row.id)} />
                  </td>
                )}
                {columns.map(col => (
                  <td key={col.key}>
                    {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > pageSize && (
        <div className="herko-pagination">
          <span>Showing {(page-1)*pageSize+1}–{Math.min(page*pageSize, sorted.length)} of {sorted.length}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="herko-page-btn" disabled={page===1} onClick={()=>setPage(p=>p-1)}>‹</button>
            {Array.from({length: Math.min(totalPages,5)}, (_,i) => {
              const p = page <= 3 ? i+1 : page + i - 2
              return p > 0 && p <= totalPages ? (
                <button key={p} className={`herko-page-btn${p===page?' active':''}`} onClick={()=>setPage(p)}>{p}</button>
              ) : null
            })}
            <button className="herko-page-btn" disabled={page===totalPages} onClick={()=>setPage(p=>p+1)}>›</button>
          </div>
        </div>
      )}
    </div>
  )
}
