/** Returns a problem with the chosen password, or null when it is acceptable. */
export function passwordProblem(password: string, repeat: string): 'tooShort' | 'mismatch' | null {
  if (password.length < 8) return 'tooShort'
  if (password !== repeat) return 'mismatch'
  return null
}

/** True when the page was opened from a password-reset email link. */
export function isRecoveryUrl(url: string): boolean {
  const { hash, search } = new URL(url)
  return new URLSearchParams(hash.replace(/^#/, '')).get('type') === 'recovery'
    || new URLSearchParams(search).get('type') === 'recovery'
}
