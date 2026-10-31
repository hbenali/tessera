import { describe, expect, it } from 'vitest'
import { bridgeLabel, readBridge } from './bridge'

describe('bridge', () => {
  it('names the network and channel', () => {
    const b = readBridge([{}, { protocol: { id: 'slack', displayname: 'Slack' }, channel: { displayname: '#general' }, bridgebot: '@bot:x' }])
    expect(b).toEqual({ network: 'Slack', channel: '#general', bot: '@bot:x' })
    expect(bridgeLabel(b!)).toBe('Bridged to Slack · #general')
  })
  it('falls back to the protocol id and tolerates a missing channel', () => {
    expect(bridgeLabel(readBridge([{ protocol: { id: 'irc' } }])!)).toBe('Bridged to irc')
  })
  it('is undefined for a normal room', () => expect(readBridge([])).toBeUndefined())
})
