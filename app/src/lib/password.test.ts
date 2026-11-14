import { describe, expect, it } from 'vitest'
import { isRecoveryUrl, passwordProblem } from './password'

describe('choosing a new password', () => {
  it('rejects short passwords', () => expect(passwordProblem('abc1234', 'abc1234')).toBe('tooShort'))
  it('rejects two different entries', () => expect(passwordProblem('abcd1234', 'abcd1235')).toBe('mismatch'))
  it('accepts a matching password of 8 or more characters', () => expect(passwordProblem('abcd1234', 'abcd1234')).toBeNull())
})

describe('recognising a reset link', () => {
  it('spots the link from the email', () =>
    expect(isRecoveryUrl('https://app.example/#access_token=x&type=recovery')).toBe(true))
  it('ignores a normal visit', () => expect(isRecoveryUrl('https://app.example/visit/abc')).toBe(false))
  it('ignores other kinds of sign-in link', () =>
    expect(isRecoveryUrl('https://app.example/#access_token=x&type=magiclink')).toBe(false))
})
