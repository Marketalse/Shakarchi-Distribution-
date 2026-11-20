import { useEffect, useState, type FormEvent } from 'react'
import type { Outlet } from '../lib/types'
import { db } from '../lib/db'
import { supabase } from '../lib/supabase'
import { soloApi } from '../lib/solo-api'
import { captureOperation, surveyAnswers } from '../lib/capture'

export function ClientEdit({ retail, onSaved }: { retail: Outlet; onSaved: () => void }) {
  const [optionalContact, setOptionalContact] = useState(Boolean(retail.staff_name || retail.staff_phone))
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || busy) return
    const values = new FormData(event.currentTarget)
    const fields = Object.fromEntries([...values.entries()].map(([key, value]) => [key, String(value).trim() || null]))
    setBusy(true); setError(''); setNotice('')
    try {
      if (await db.outbox.where('table').equals('outlets').filter(row => row.row_id === retail.id).count()) throw Error('Sync this new client before editing it.')
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw Error('Sign in before editing.')
      const command = await captureOperation(db, session.user.id, 'update_solo_client', { outlet_id: retail.id, expected_updated_at: retail.updated_at, fields })
      await soloApi(supabase).updateClient(command)
      const { data, error } = await supabase.from('outlets').select('*').eq('id', retail.id).single()
      if (error) throw error
      await db.outlets.put(data as Outlet)
      setNotice('Client updated.'); onSaved()
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setBusy(false) }
  }
  return <form className="form" onSubmit={event => void save(event)} key={retail.updated_at}>
    <h2>Client profile</h2>
    {(['retail_name', 'owner_name', 'owner_phone', 'shop_phone', 'province', 'area', 'outlet_type', 'address'] as const).map(key =>
      <label key={key}>{key.replaceAll('_', ' ')}<input name={key} defaultValue={retail[key] ?? ''} required={['retail_name', 'province', 'area', 'outlet_type'].includes(key)} /></label>)}
    <button type="button" className="link optional-contact" aria-expanded={optionalContact} aria-controls="edit-staff-contact" onClick={() => setOptionalContact(value => !value)}>{optionalContact ? 'Hide optional contact' : '+ Optional contact'}</button>
    <div id="edit-staff-contact" className="form" hidden={!optionalContact}>
      <label>Staff name<input name="staff_name" defaultValue={retail.staff_name ?? ''} /></label>
      <label>Staff phone<input name="staff_phone" type="tel" defaultValue={retail.staff_phone ?? ''} /></label>
    </div>
    <label>Relationship<select name="relationship" defaultValue={retail.relationship}><option value="prospect">Prospect</option><option value="customer">Customer</option></select></label>
    <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save client'}</button>
    {error && <p className="error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </form>
}

type Question = { id: string; label: string; type: string; required: boolean; options?: string[] }
type Version = { id: string; title: string; questions: Question[] }
export function DynamicSurvey({ outletId, visitId }: { outletId: string; visitId: string }) {
  const [versions, setVersions] = useState<Version[]>([]), [brands, setBrands] = useState<{id: string; name: string}[]>([])
  const [versionId, setVersionId] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    if (!supabase) { setError('Database connection unavailable.'); return }
    void Promise.all([
      supabase.from('survey_versions').select('id,title,questions').order('created_at', { ascending: false }),
      supabase.from('survey_brands').select('id,name').eq('is_own', false).eq('active', true).order('name'),
    ]).then(([v,b]) => {
      if (!active) return
      if (v.error || b.error) setError((v.error || b.error)!.message)
      else { setVersions(v.data as Version[]); setBrands(b.data!) }
    }).catch(failure => { if (active) setError(String(failure.message)) })
    return () => { active = false }
  }, [])
  const version = versions.find(row => row.id === versionId)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !version || busy) return
    const values = new FormData(event.currentTarget), form = event.currentTarget
    setBusy(true); setError(''); setNotice('')
    try {
      const answers = surveyAnswers(version.questions, values)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw Error('Sign in before submitting.')
      const command = await captureOperation(db, session.user.id, 'submit_solo_survey', { version_id: version.id, outlet_id: outletId, visit_id: visitId, brand_id: String(values.get('brand_id')), answers })
      await soloApi(supabase).submitSurvey(command)
      form.reset(); setNotice('Survey submitted for this client and visit.')
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setBusy(false) }
  }
  return <section>
    <h2>Survey forms</h2>
    <label>Survey type<select value={versionId} onChange={event => setVersionId(event.target.value)}><option value="">Choose published form</option>{versions.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</select></label>
    {!versions.length && <p>Publish a survey in owner tools first.</p>}
    {version && <form className="form" onSubmit={event => void submit(event)} key={version.id}>
      <label>Competitor brand<select name="brand_id" required><option value="">Choose competitor</option>{brands.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      {version.questions.map(q => <label key={q.id}>{q.label}{q.type === 'choice' || q.type === 'boolean'
        ? <select name={'answer:' + q.id} required={q.required}><option value="">Choose</option>{(q.type === 'boolean' ? ['true', 'false'] : q.options ?? []).map(v => <option key={v}>{v}</option>)}</select>
        : <input name={'answer:' + q.id} required={q.required} type={q.type === 'number' ? 'number' : 'text'} step="any" />}</label>)}
      <button disabled={busy}>{busy ? 'Submitting…' : 'Submit survey'}</button>
    </form>}
    {error && <p className="error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </section>
}
