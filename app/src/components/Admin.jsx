import React, { useMemo, useState } from 'react'

const SERVER_URL = import.meta.env.VITE_SERVER_URL
const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN

export function Admin() {
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [users, setUsers] = useState([])

  const canSearch = useMemo(() => q.trim().length > 1, [q])

  async function onSearch(e) {
    e.preventDefault()
    if (!canSearch) return
    setLoading(true)
    setError('')
    try {
      const url = `${SERVER_URL}/api/admin/search?q=${encodeURIComponent(q.trim())}`
      const res = await fetch(url, {
        headers: { 'x-admin-token': ADMIN_TOKEN }
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setUsers(data.users || [])
    } catch (err) {
      setError(err.message || 'Search failed')
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  function onClear() {
    setQ('')
    setUsers([])
    setError('')
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {}
  }

  return (
    <div id="admin">
      <h2 className="h2">Admin</h2>
      <div style={{ color: '#555', marginBottom: 8 }}>
        Search by email, Twitter handle, or wallet address. Examples:
        <span style={{ marginLeft: 8 }}>
          <button type="button" onClick={() => setQ('user@example.com')}>user@example.com</button>
          <button type="button" onClick={() => setQ('@jack')} style={{ marginLeft: 8 }}>@jack</button>
          <button type="button" onClick={() => setQ('0x0000000000000000000000000000000000000000')} style={{ marginLeft: 8 }}>0x…0000</button>
        </span>
      </div>
      <form onSubmit={onSearch} style={{ display: 'flex', gap: 8 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="email, @twitter, or 0xwallet"
          className="input"
          style={{ flex: 1 }}
        />
        <button type="submit" className="btn btn-primary" disabled={!canSearch || loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
        <button type="button" className="btn btn-muted" onClick={onClear} disabled={loading}>Clear</button>
      </form>
      {error && <div style={{ color: 'crimson', marginTop: 8 }}>{error}</div>}
      <div style={{ marginTop: 16 }}>
        {!!users.length && (
          <div style={{ marginBottom: 8, color: '#333' }}>
            {users.length} result{users.length === 1 ? '' : 's'}
          </div>
        )}
        <table className="table">
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', paddingBottom: 6 }}>User ID</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', paddingBottom: 6 }}>Email</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', paddingBottom: 6 }}>Twitter</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', paddingBottom: 6 }}>Wallets</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td style={{ padding: '8px 0' }}>{u.id}</td>
                <td>{u.email || '—'}</td>
                <td>{u.twitter ? `@${u.twitter}` : '—'}</td>
                <td>
                  {(u.wallets || []).length ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {(u.wallets || []).map((w) => (
                        <span key={w} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f6f6f6', padding: '2px 6px', borderRadius: 6 }}>
                          {w}
                          <button type="button" onClick={() => copy(w)} title="Copy" style={{ fontSize: 12 }}>Copy</button>
                        </span>
                      ))}
                    </div>
                  ) : '—'}
                </td>
              </tr>
            ))}
            {!users.length && (
              <tr>
                <td colSpan={4} style={{ paddingTop: 12, color: '#666' }}>No results</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}


