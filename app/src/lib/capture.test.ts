import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { LocalDb } from './db'
import { captureOperation, surveyAnswers } from './capture'

const questions = [
  { id: 'zero', label: 'Count', type: 'number', required: true },
  { id: 'no', label: 'Available', type: 'boolean', required: true },
  { id: 'choice', label: 'Shelf', type: 'choice', required: false, options: ['Small'] },
]
describe('client-linked capture', () => {
  it('preserves zero and false answers and rejects missing/invalid values', () => {
    const form = new FormData(); form.set('answer:zero', '0'); form.set('answer:no', 'false')
    expect(surveyAnswers(questions, form)).toEqual({ zero: 0, no: false })
    form.set('answer:choice', 'Unexpected'); expect(() => surveyAnswers(questions, form)).toThrow('available answer')
    form.delete('answer:choice'); form.set('answer:zero', 'Infinity'); expect(() => surveyAnswers(questions, form)).toThrow('valid number')
    form.delete('answer:zero'); expect(() => surveyAnswers(questions, form)).toThrow('Answer required')
  })
  it('reuses a lost capture response after reopening and blocks changed details without touching other owners', async () => {
    const db = new LocalDb('capture-' + crypto.randomUUID())
    try {
      const request = { outlet_id: 'store', answers: { count: 0 } }
      await db.commands.put({ id: 'retained', owner_id: 'owner', rpc: 'submit_solo_survey', request, queued_at: 'now', attempts: 1 })
      db.close(); await db.open()
      expect((await captureOperation(db, 'owner', 'submit_solo_survey', request)).id).toBe('retained')
      await expect(captureOperation(db, 'owner', 'submit_solo_survey', { ...request, answers: { count: 1 } })).rejects.toThrow('waiting to sync')
      expect((await captureOperation(db, 'other', 'submit_solo_survey', request)).id).not.toBe('retained')
    } finally { await db.delete() }
  })
})
