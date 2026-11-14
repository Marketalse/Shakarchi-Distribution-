import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { en as t } from '../i18n/en'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setError(t.login.failed)
    setBusy(false)
  }

  return (
    <main>
      <h1>{t.login.title}</h1>
      {!supabase && <p className="error">{t.notConnected}</p>}
      <form onSubmit={submit} className="form">
        <label>{t.login.email}
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>{t.login.password}
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy || !supabase}>{t.login.submit}</button>
      </form>
    </main>
  )
}
