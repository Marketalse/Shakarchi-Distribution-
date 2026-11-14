import { Link, Route, Routes, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { db } from './lib/db'
import type { Outlet } from './lib/types'
import { useSync } from './lib/useSync'
import { en as t } from './i18n/en'

function StatusBar() {
  const { online, pending, busy, syncNow, connected } = useSync()
  return (
    <header className="bar">
      <strong>{t.appName}</strong>
      <span className={online ? 'pill ok' : 'pill warn'}>{online ? t.online : t.offline}</span>
      <span className="grow">{connected ? t.pending(pending) : t.notConnected}</span>
      <button onClick={() => void syncNow()} disabled={!online || !connected || busy || pending === 0}>
        {t.syncNow}
      </button>
    </header>
  )
}

function Outlets() {
  const [outlets, setOutlets] = useState<Outlet[]>([])
  useEffect(() => { void db.outlets.orderBy('retail_name').toArray().then(setOutlets) }, [])
  return (
    <main>
      <h1>{t.outlets}</h1>
      {outlets.length === 0 ? (
        <p className="muted">{t.noOutlets}</p>
      ) : (
        <ul className="list">
          {outlets.map((o) => (
            <li key={o.id}>
              <Link to={`/visit/${o.id}`}>
                <span>{o.retail_name}</span>
                <span className="muted">{o.area}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

function VisitFlow() {
  const { outletId } = useParams()
  const steps = [t.steps.checkIn, t.steps.survey, t.steps.order, t.steps.collect]
  const [step, setStep] = useState(0)
  return (
    <main>
      <nav className="steps" aria-label="Visit steps">
        {steps.map((label, i) => (
          <button key={label} className={i === step ? 'on' : ''} onClick={() => setStep(i)}>
            {i + 1}. {label}
          </button>
        ))}
      </nav>
      <h1>{steps[step]}</h1>
      <p className="muted">{t.comingSoon}</p>
      <p className="muted">{outletId}</p>
    </main>
  )
}

export default function App() {
  return (
    <>
      <StatusBar />
      <Routes>
        <Route path="/" element={<Outlets />} />
        <Route path="/visit/:outletId" element={<VisitFlow />} />
      </Routes>
    </>
  )
}
