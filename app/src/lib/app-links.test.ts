import { describe, it, expect } from 'vitest'
import { websiteLink } from './app-links'

describe('separate website navigation', () => {
  it('preserves the requested admin route while discarding fragments', () => {
    expect(websiteLink('https://admin.example.com', '/admin/collections?invoice=123&access_token=secret&code=secret#refresh_token=secret')).toBe('https://admin.example.com/admin/collections?invoice=123')
  })
  it('rejects missing or unsafe origins and protocol-relative paths', () => {
    for (const value of [undefined, '', 'javascript:alert(1)', 'https://owner:secret@example.com', 'http://example.com']) expect(websiteLink(value,'/admin')).toBeUndefined()
    expect(websiteLink('https://admin.example.com','//other.example.com')).toBeUndefined()
    expect(websiteLink('http://localhost:5173','/admin')).toBe('http://localhost:5173/admin')
  })
})
