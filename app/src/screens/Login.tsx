import { useState, type FormEvent } from 'react'
import { MobileIcon } from './MobileIcon'
import { supabase } from '../lib/supabase'
import { en as t } from '../i18n/en'

export function Login() {
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function signIn(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setError(t.login.failed)
    setBusy(false)
  }

  async function sendLink(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    setNotice('')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/`,
    })
    // The same message is shown whether or not the email exists, so the form
    // cannot be used to find out who has an account.
    if (error && error.status === 429) setError(t.login.sendFailed)
    else setNotice(t.login.linkSent)
    setBusy(false)
  }

  function switchTo(next: 'signin' | 'forgot') {
    setMode(next)
    setError('')
    setNotice('')
  }

  if (mode === 'forgot') {
    return (
      <main className="auth-sheet recovery-sheet">
        <img className="recovery-art" src="/mobile-assets/lock3d.webp" alt="" width="140" height="140" />
        <h1>{t.login.forgotTitle}</h1>
        <p className="muted">{t.login.forgotHelp}</p>
        <form onSubmit={sendLink} className="form">
          <label>{t.login.email}
            <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          {notice && <p className="ok-text" role="status">{notice}</p>}
          <button className="primary" disabled={busy || !supabase}>{t.login.sendLink}</button>
          <button type="button" className="link" onClick={() => switchTo('signin')}>{t.login.backToSignIn}</button>
        </form>
      </main>
    )
  }

  return (
    <main className="login-layout">
      <section className="login-hero"><span className="login-brand">Shakarchi</span><h1>Your business,<br />in good hands.</h1><p>A little clarity. A lot of possibility.</p><img src="/mobile-assets/file.webp" alt="" width="112" height="112" /></section>
      <section className="auth-sheet"><h2>Welcome back</h2><p className="muted">Sign in to your owner account.</p>
      {!supabase && <p className="error">{t.notConnected}</p>}
      <form onSubmit={signIn} className="form">
        <label>{t.login.email}
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>{t.login.password}
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy || !supabase}>{t.login.submit}</button>
        <button type="button" className="link" onClick={() => switchTo('forgot')}>{t.login.forgot}</button>
      </form>
      <p className="account-trust"><MobileIcon name="lock" size={16} />Your account, securely connected.</p></section>
    </main>
  )
}
