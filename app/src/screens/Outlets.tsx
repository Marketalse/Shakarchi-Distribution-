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
    return outlets.filter((o) => o.retail_name.toLowerCase().includes(q) || o.area.toLowerCase().includes(q))
  }, [outlets, query])

  return (
    <main>
      <div className="row">
        <h1>{t.outlets}</h1>
        <Link className="button primary" to="/outlets/new">{t.newOutlet}</Link>
      </div>
      <input type="search" placeholder={t.search} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t.search} />
      {outlets.length === 0 ? (
        <p className="muted">{t.noOutlets}</p>
      ) : shown.length === 0 ? (
        <p className="muted">{t.noMatch}</p>
      ) : (
        <ul className="list">
          {shown.map((o) => (
            <li key={o.id}>
              <Link to={`/visit/${o.id}`}>
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
