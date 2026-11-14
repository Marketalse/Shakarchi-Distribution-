import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/db'
import { createOutlet } from '../lib/outlet'
import { getPosition, nearbyOutlets, type Nearby, type Position } from '../lib/geo'
import { DUPLICATE_RADIUS_M, OUTLET_TYPES, PROVINCES } from '../lib/config'
import type { Relationship } from '../lib/types'
import { en as t } from '../i18n/en'

export function NewOutlet({ repId, onSaved }: { repId: string; onSaved: () => void }) {
  const navigate = useNavigate()
  const [f, setF] = useState({
    retail_name: '', owner_name: '', owner_phone: '', shop_phone: '',
    province: PROVINCES[0], area: '', address: '', outlet_type: OUTLET_TYPES[0],
    relationship: 'prospect' as Relationship,
  })
  const [pos, setPos] = useState<Position | null>(null)
  const [gpsBusy, setGpsBusy] = useState(false)
  const [error, setError] = useState('')
  const [dupes, setDupes] = useState<Nearby[] | null>(null)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  async function locate() {
    setGpsBusy(true)
    setError('')
    try { setPos(await getPosition()) } catch (e) { setError((e as Error).message) }
    setGpsBusy(false)
  }

  async function save(ignoreDuplicates: boolean) {
    if (!pos) return setError(t.form.gpsNeeded)
    if (!ignoreDuplicates) {
      const near = nearbyOutlets(await db.outlets.toArray(), pos.lat, pos.lng, DUPLICATE_RADIUS_M)
      if (near.length > 0) return setDupes(near)
    }
    try {
      const outlet = await createOutlet(db, {
        ...f,
        owner_name: f.owner_name || undefined, owner_phone: f.owner_phone || undefined,
        shop_phone: f.shop_phone || undefined, address: f.address || undefined,
        lat: pos.lat, lng: pos.lng, assigned_rep: repId,
      })
      onSaved()
      navigate(`/visit/${outlet.id}`, { replace: true })
    } catch (e) { setError((e as Error).message) }
  }

  function submit(e: FormEvent) { e.preventDefault(); void save(false) }

  if (dupes) {
    return (
      <main>
        <h1>{t.form.duplicateTitle}</h1>
        <ul className="list">
          {dupes.map((d) => (
            <li key={d.id}>
              <button className="wide" onClick={() => navigate(`/visit/${d.id}`, { replace: true })}>
                <strong>{d.retail_name}</strong> · {t.form.metres(d.distance_m)} — {t.form.duplicateUse}
              </button>
            </li>
          ))}
        </ul>
        <button className="wide" onClick={() => { setDupes(null); void save(true) }}>{t.form.duplicateIgnore}</button>
      </main>
    )
  }

  return (
    <main>
      <h1>{t.newOutlet}</h1>
      <form onSubmit={submit} className="form">
        <label>{t.form.name}<input required value={f.retail_name} onChange={set('retail_name')} /></label>
        <label>{t.form.type}
          <select value={f.outlet_type} onChange={set('outlet_type')}>{OUTLET_TYPES.map((x) => <option key={x}>{x}</option>)}</select>
        </label>
        <label>{t.form.relationship}
          <select value={f.relationship} onChange={set('relationship')}>
            <option value="prospect">{t.prospect}</option>
            <option value="customer">{t.customer}</option>
          </select>
        </label>
        <label>{t.form.province}
          <select value={f.province} onChange={set('province')}>{PROVINCES.map((x) => <option key={x}>{x}</option>)}</select>
        </label>
        <label>{t.form.area}<input required value={f.area} onChange={set('area')} /></label>
        <label>{t.form.owner}<input value={f.owner_name} onChange={set('owner_name')} /></label>
        <label>{t.form.ownerPhone}<input type="tel" inputMode="tel" value={f.owner_phone} onChange={set('owner_phone')} /></label>
        <label>{t.form.shopPhone}<input type="tel" inputMode="tel" value={f.shop_phone} onChange={set('shop_phone')} /></label>
        <label>{t.form.address}<input value={f.address} onChange={set('address')} /></label>
        <div>
          <span className="label">{t.form.gps}</span>
          <button type="button" className="wide" onClick={() => void locate()} disabled={gpsBusy}>
            {gpsBusy ? t.form.gettingGps : pos ? t.form.gpsOk(pos.accuracy_m) : t.form.getGps}
          </button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row">
          <button type="button" onClick={() => navigate(-1)}>{t.form.cancel}</button>
          <button className="primary">{t.form.save}</button>
        </div>
      </form>
    </main>
  )
}
