import { describe, expect, it } from 'vitest'
import { clock, phaseLabel, phaseOf, whyEnded } from './callstate'

describe('call helpers', () => {
  it('formats the elapsed time', () => { expect(clock(0)).toBe('0:00'); expect(clock(65)).toBe('1:05'); expect(clock(3725)).toBe('1:02:05'); expect(clock(-3)).toBe('0:00') })
  it('maps SDK states to a phase, depending on who called', () => {
    expect(phaseOf('ringing', true)).toBe('ringing')
    expect(phaseOf('invite_sent', false)).toBe('calling')
    expect(phaseOf('wait_local_media', true)).toBe('connecting')
    expect(phaseOf('connected', false)).toBe('connected')
    expect(phaseOf('ended', true)).toBe('ended')
    expect(phaseOf('fledgling', false)).toBe('calling')
  })
  it('labels the phases', () => {
    expect(phaseLabel('ringing', true, 'Ann')).toBe('Ann is calling you (video)')
    expect(phaseLabel('calling', false, 'Ann')).toBe('Calling Ann…')
    expect(phaseLabel('connected', false, 'Ann')).toBe('On a call with Ann')
  })
  it('explains failures and stays quiet for a normal hang-up', () => {
    expect(whyEnded('user_hangup')).toBe('')
    expect(whyEnded('user_media_failed')).toMatch(/microphone/)
    expect(whyEnded('ice_failed')).toMatch(/TURN/)
    expect(whyEnded('invite_timeout')).toBe('No answer')
    expect(whyEnded(undefined)).toBe('')
  })
})
