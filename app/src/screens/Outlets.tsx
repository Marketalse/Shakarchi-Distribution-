import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../lib/db'
import type { Outlet } from '../lib/types'
import { en as t } from '../i18n/en'

export function Outlets({ version }: { version: number }) {
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [queued, setQueued] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')

  useEffect(() => {
    void db.outlets.orderBy('retail_name').toArray().then(setOutlets)
    void db.outbox.where('table').equals('outlets').toArray().then((items) => setQueued(new Set(items.map((i) => i.row_id))))
  }, [version])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return outlets
    return outlets.filter((o) => o.retail_name.toLowerCase().includes(q) || o.area.toLowerCase().includes(q) || (o.owner_phone ?? '').includes(q))
  }, [outlets, query])

  return (
    <main>
      <div className="row">
        <h1>Retails</h1>
        <Link className="button primary" to="/outlets/new">+ New retail</Link>
      </div>
      <input type="search" placeholder={t.search} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t.search} />
      {outlets.length === 0 ? (
        <div className="empty"><img src="/wireframe/retails.svg" alt="" /><h2>Your retail list starts here</h2><p>Add your first client to take orders and collect market data.</p></div>
      ) : shown.length === 0 ? (
        <p className="muted">{t.noMatch}</p>
      ) : (
        <ul className="list">
          {shown.map((o) => (
            <li key={o.id}>
              <Link to={`/retails/${o.id}`}>
                <span>
                  <strong>{o.retail_name}</strong>
                  <br />
                  <span className="muted">{o.area} · {o.outlet_type}</span>
                </span>
                <span className="tags">
                  <span className={o.relationship === 'customer' ? 'tag ok' : 'tag'}>
                    {o.relationship === 'customer' ? t.customer : t.prospect}
                  </span>
                  {queued.has(o.id) && <span className="tag warn">{t.waitingUpload}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
