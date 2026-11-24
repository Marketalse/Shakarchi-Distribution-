import {RetailTag} from './RetailTag'
import {retailReference} from '../lib/retail-reference'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { db } from '../lib/db'
import { ClientLocation } from './ClientLocation'
import { newId, saveVisit } from '../lib/visit'
import type { Outlet, Visit as VisitRow, VisitOutcome } from '../lib/types'
import { en as t } from '../i18n/en'

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const day = (iso: string) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' })

export function Visit({ repId, onSaved }: { repId: string; onSaved: () => void }) {
  const { outletId = '' } = useParams()
  const [outlet, setOutlet] = useState<Outlet | null>(null)
  const [history, setHistory] = useState<VisitRow[]>([])
  const [step, setStep] = useState(0)
  const [checkedInAt, setCheckedInAt] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<VisitOutcome>('survey_only')
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void db.outlets.get(outletId).then((o) => setOutlet(o ?? null))
    void db.visits.where('outlet_id').equals(outletId).reverse().sortBy('checked_in_at').then((v) => setHistory(v.slice(0, 5)))
  }, [outletId, saved])

  function checkIn() { setCheckedInAt(new Date().toISOString()) }

  async function finish() {
    if (!checkedInAt) return
    setError('')
    try {
      await saveVisit(db, {
        visit: {
          id: newId(), outlet_id: outletId, rep_id: repId, checked_in_at: checkedInAt,
          checked_out_at: new Date().toISOString(),
          outcome, note: note.trim() || undefined,
        },
      })
      setSaved(true)
      onSaved()
    } catch (e) { setError((e as Error).message) }
  }

  if (!outlet) return <main><p className="muted">…</p></main>
  const steps = [t.steps.checkIn, t.steps.survey, t.steps.order, t.steps.collect]

  if (saved) {
    return (
      <main>
        <h1>{t.visit.saved}</h1>
        <p className="muted">{outlet.retail_name}</p>
        <Link className="button primary" to="/">{t.visit.back}</Link>
      </main>
    )
  }

  return (
    <main>
      <h1>{outlet.retail_name}</h1>
      <RetailTag {...retailReference(outlet.id,[outlet])}/><p className="muted">{outlet.area} · {outlet.outlet_type}</p>
      <ClientLocation retail={outlet} />
      <nav className="steps" aria-label="Visit steps">
        {steps.map((label, i) => (
          <button key={label} className={i === step ? 'on' : ''} onClick={() => setStep(i)} disabled={i > 0 && !checkedInAt}>
            {i + 1}. {label}
          </button>
        ))}
      </nav>

      {step === 0 && !checkedInAt && (
        <section>
          <p className="muted">{t.visit.notCheckedIn}</p>
          <button className="primary wide" onClick={checkIn}>
            {t.visit.checkIn}
          </button>
        </section>
      )}

      {step === 0 && checkedInAt && (
        <section className="form">
          <p className="ok-text">{t.visit.checkedIn(time(checkedInAt))}</p>
          <label>{t.visit.outcome}
            <select value={outcome} onChange={(e) => setOutcome(e.target.value as VisitOutcome)}>
              {(Object.keys(t.visit.outcomes) as VisitOutcome[]).map((k) => <option key={k} value={k}>{t.visit.outcomes[k]}</option>)}
            </select>
          </label>
          <label>{t.visit.note}<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary wide" onClick={() => void finish()}>{t.visit.finish}</button>
        </section>
      )}

      {step > 0 && <p className="muted">{t.visit.comingSoon}</p>}

      {history.length > 0 && (
        <section>
          <h2>{t.visit.lastVisits}</h2>
          <ul className="plain">
            {history.map((v) => <li key={v.id}><RetailTag {...retailReference(outlet.id,[outlet])}/> · {day(v.checked_in_at)} · {t.visit.outcomes[v.outcome]}</li>)}
          </ul>
        </section>
      )}
    </main>
  )
}
