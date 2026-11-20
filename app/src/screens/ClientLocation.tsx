import { useRef, useState } from 'react'
import type { Outlet } from '../lib/types'
import { googleMapsNavigation, wazeNavigation } from '../lib/navigation'
import { getPosition, type Position } from '../lib/geo'
import { operation, soloApi, type Operation } from '../lib/solo-api'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'

export function ClientLocation({ retail, allowCorrection = false, onUpdated }: { retail: Outlet; allowCorrection?: boolean; onUpdated?: () => void }) {
  const url = googleMapsNavigation(retail.lat, retail.lng)
  const wazeUrl = wazeNavigation(retail.lat, retail.lng)
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
      setEditing(false); setPosition(undefined); setNotice('Store location updated.'); onUpdated?.()
    } catch (failure) {
      if (/^(P000[12]|22|23|42501)/.test((failure as {code?:string}).code ?? '')) { pending.current = undefined; setHasPending(false) }
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally { setSaving(false) }
  }
  return <section className="card" aria-label="Saved store location">
    <h2>Store location</h2>
    {url && wazeUrl ? <details className="navigation-picker">
      <summary className="button primary">Navigate</summary>
      <div className="navigation-options" role="group" aria-label="Choose navigation app">
        <a className="button" href={url} target="_blank" rel="noopener noreferrer">Google Maps</a>
        <a className="button" href={wazeUrl} target="_blank" rel="noopener noreferrer">Waze</a>
      </div>
    </details> : <p>Add a store location to navigate.</p>}
    {allowCorrection && !editing && <button type="button" onClick={() => { setEditing(true); setError('') }}>Correct store location</button>}
    {editing && <div className="form">
      <p>Stand at the store to correct its location.</p>
      <button type="button" disabled={capturing || saving || hasPending} onClick={() => void capture()}>{capturing ? 'Capturing…' : 'Capture corrected location'}</button>
      {position && <>
        <p role="status">New location captured</p>
        {position.accuracy_m > 50 && <p className="warn-text">Location is approximate. Move outside and try again.</p>}
        <label><input type="checkbox" checked={confirmed} disabled={hasPending} onChange={e => setConfirmed(e.target.checked)} />I'm at the store</label>
        <label>Correction reason<input value={reason} disabled={hasPending} onChange={e => setReason(e.target.value)} /></label>
        <button type="button" disabled={saving || !confirmed || !reason.trim()} onClick={() => void correct()}>{saving ? 'Saving…' : hasPending ? 'Retry saved correction' : 'Save corrected store location'}</button>
      </>}
      <button type="button" disabled={saving || hasPending} onClick={() => { setEditing(false); setPosition(undefined) }}>Cancel correction</button>
    </div>}
    {error && <p className="error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </section>
}
