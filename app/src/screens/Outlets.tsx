import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { db } from '../lib/db'
import type { Outlet } from '../lib/types'
import { MobileIcon } from './MobileIcon'
import { StoreNavigation } from './StoreNavigation'
import { en as t } from '../i18n/en'

export function Outlets({ version }: { version: number }) {
  const [params]=useSearchParams()
  const creatingOrder=params.get('action')==='order'
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
        <h1>{creatingOrder?'Choose customer':'Your clients'}</h1>
        <Link className="button primary" to="/outlets/new"><MobileIcon name="plus" size={20} />New client</Link>
      </div>
      <label className="mobile-search"><MobileIcon name="search" size={21} /><input type="search" placeholder={t.search} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t.search} /></label>
      <p className="client-count">{shown.length} {shown.length === 1 ? 'client' : 'clients'}</p>
      {outlets.length === 0 ? (
        <div className="empty"><img src="/mobile-assets/shop.svg" alt="" /><h2>Your client list starts here</h2><p>Add your first client to take orders and collect market data.</p></div>
      ) : shown.length === 0 ? (
        <p className="muted">{t.noMatch}</p>
      ) : (
        <ul className="list">
          {shown.map((o) => (
            <li key={o.id} className="retail-row">
              <Link to={`/retails/${o.id}${creatingOrder?'?action=order':''}`} className="client-identity">
                <span className="client-avatar" aria-hidden="true">{o.retail_name.split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('')}</span>
                <span>
                  <strong>{o.retail_name}</strong>
                  <br />
                  <span className="muted">{o.area}</span>
                </span>
                <span className="tags">
                  {queued.has(o.id) && <span className="tag warn">{t.waitingUpload}</span>}
                </span>
              </Link>
              <StoreNavigation retail={o} compact disclosure/>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
