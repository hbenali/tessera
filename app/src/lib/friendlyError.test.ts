import { describe, expect, it } from 'vitest'
import { friendlyError } from './matrix.svelte'

describe('friendlyError', () => {
  it('keeps only the server message', () => {
    expect(friendlyError(new Error('MatrixError: [403] Invalid username or password (http://localhost:8008/_matrix/client/v3/login)'))).toBe('Invalid username or password')
  })
  it('handles plain strings and empty messages', () => {
    expect(friendlyError('boom')).toBe('boom')
    expect(friendlyError(new Error(''))).toBe('Something went wrong')
  })
})
