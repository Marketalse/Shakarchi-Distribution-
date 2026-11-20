import { useRef, useState } from 'react'
import type { Outlet } from '../lib/types'
import { googleMapsNavigation } from '../lib/navigation'
import { getPosition, type Position } from '../lib/geo'
import { operation, soloApi, type Operation } from '../lib/solo-api'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'

export function ClientLocation({ retail, allowCorrection = false, onUpdated }: { retail: Outlet; allowCorrection?: boolean; onUpdated?: () => void }) {
  const url = googleMapsNavigation(retail.lat, retail.lng)
  const [editing, setEditing] = useState(false), [capturing, setCapturing] = useState(false), [saving, setSaving] = useState(false)
  const [position, setPosition] = useState<Position>(), [confirmed, setConfirmed] = useState(false), [reason, setReason] = useState('')
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [hasPending, setHasPending] = useState(false)
  const pending = useRef<Operation<Record<string, unknown>> | undefined>(undefined)
  async function capture() {
    setCapturing(true); setError(''); setPosition(undefined); setConfirmed(false)
    try { setPosition(await getPosition()) }
    catch (failure) { setError((failure as Error).message) }
    finally { setCapturing(false) }
  }
  async function correct() {
    if (!supabase || saving || (!pending.current && (!position || !confirmed || !reason.trim()))) return
    setSaving(true); setError(''); setNotice('')
    try {
      if (await db.outbox.where('table').equals('outlets').filter(row => row.row_id === retail.id).count()) {
        throw Error('Sync this new client before correcting its location.')
      }
      pending.current ??= operation({ outlet_id: retail.id, expected_updated_at: retail.updated_at,
        lat: position!.lat, lng: position!.lng, location_accuracy: position!.accuracy_m,
        location_captured_at: position!.captured_at, reason: reason.trim() })
      setHasPending(true)
      await soloApi(supabase).correctLocation(pending.current)
      pending.current = undefined; setHasPending(false)
      const { data, error } = await supabase.from('outlets').select('*').eq('id',retail.id).single()
      if (error) throw error
      await db.outlets.put(data as Outlet)
      setEditing(false); setPosition(undefined); setNotice('Store location corrected. Future visits will use the saved destination.'); onUpdated?.()
    } catch (failure) {
      if (/^(P000[12]|22|23|42501)/.test((failure as {code?:string}).code ?? '')) { pending.current = undefined; setHasPending(false) }
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally { setSaving(false) }
  }
  return <section className="card" aria-label="Saved store location">
    <h2>Store location</h2>
    {url ? <>
      <p>{retail.lat.toFixed(6)}, {retail.lng.toFixed(6)} · {retail.location_accuracy == null ? 'Accuracy unknown' : 'Reported accuracy ±' + Math.round(retail.location_accuracy) + ' m'}</p>
      <a className="button primary" href={url} target="_blank" rel="noopener noreferrer">Navigate</a>
      <p className="muted">Opens Google Maps using this saved destination.</p>
    </> : <p>Store location is unavailable. Correct it before navigating.</p>}
    {allowCorrection && !editing && <button type="button" onClick={() => { setEditing(true); setError('') }}>Correct store location</button>}
    {editing && <div className="form">
      <p>Use this only to fix an incorrect destination or a relocated store. Stand at the store before capturing.</p>
      <button type="button" disabled={capturing || saving || hasPending} onClick={() => void capture()}>{capturing ? 'Capturing…' : 'Capture corrected location'}</button>
      {position && <>
        <p>New destination: {position.lat.toFixed(6)}, {position.lng.toFixed(6)} · ±{Math.round(position.accuracy_m)} m</p>
        {position.accuracy_m > 50 && <p className="warn-text">The estimate is broad. Move outside and recapture if needed.</p>}
        <label><input type="checkbox" checked={confirmed} disabled={hasPending} onChange={e => setConfirmed(e.target.checked)} />Confirm this is the store location</label>
        <label>Correction reason<input value={reason} disabled={hasPending} onChange={e => setReason(e.target.value)} /></label>
        <button type="button" disabled={saving || !confirmed || !reason.trim()} onClick={() => void correct()}>{saving ? 'Saving…' : hasPending ? 'Retry saved correction' : 'Save corrected store location'}</button>
      </>}
      <button type="button" disabled={saving || hasPending} onClick={() => { setEditing(false); setPosition(undefined) }}>Cancel correction</button>
    </div>}
    {error && <p className="error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </section>
}
