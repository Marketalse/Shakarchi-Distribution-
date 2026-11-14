import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { passwordProblem } from '../lib/password'
import { en as t } from '../i18n/en'

export function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    const problem = passwordProblem(password, repeat)
    if (problem) return setError(t.login[problem])
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setError(t.login.saveFailed)
    onDone()
  }

  return (
    <main>
      <h1>{t.login.newTitle}</h1>
      <form onSubmit={submit} className="form">
        <label>{t.login.newPassword}
          <input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label>{t.login.repeatPassword}
          <input type="password" autoComplete="new-password" required value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{t.login.saveNew}</button>
      </form>
    </main>
  )
}
