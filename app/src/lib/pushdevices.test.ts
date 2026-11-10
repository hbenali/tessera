import { describe, expect, it } from 'vitest'
import { pushDevices, serviceName, type Pusher } from './pushdevices'

const APP = 'ovh.hbenali.tessera.web'
const GW = 'https://push.example.org/_matrix/push/v1/notify'
const p = (key: string, x: Partial<Pusher> & { endpoint?: string; url?: string } = {}): Pusher => ({
  app_id: APP, kind: 'http', pushkey: key, device_display_name: x.device_display_name ?? 'Tessera in a browser',
  data: { url: x.url ?? GW, endpoint: x.endpoint ?? 'https://fcm.googleapis.com/fcm/send/abc' }, ...(x.app_id ? { app_id: x.app_id } : {}),
})

describe('serviceName', () => {
  it('names the push services by host', () => {
    expect(serviceName('https://fcm.googleapis.com/fcm/send/xyz')).toBe('Google (Chrome, Edge, Android)')
    expect(serviceName('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe('Mozilla (Firefox)')
    expect(serviceName('https://web.push.apple.com/QAx')).toBe('Apple (Safari)')
    expect(serviceName('https://db5p.notify.windows.com/?token=1')).toBe('Microsoft (Edge, Windows)')
  })
  it('shows the host of an unknown service, never its path or query', () => {
    expect(serviceName('https://push.example.net/secret/path?token=hunter2')).toBe('push.example.net')
    expect(serviceName('https://push.example.net/secret/path?token=hunter2')).not.toContain('hunter2')
  })
  it('copes with nothing or garbage', () => { for (const v of [undefined, '', 'not a url']) expect(serviceName(v)).toBe('Unknown service') })
})

describe('pushDevices', () => {
  const all = [p('b-key', { device_display_name: 'Tessera (Safari on iPhone)', endpoint: 'https://web.push.apple.com/x' }), p('a-key', { device_display_name: 'Tessera (Chrome on Linux)' }), p('c-key', { app_id: 'im.vector.app' } as never), { ...p('d-key'), kind: 'email' }]
  it('keeps only Tessera\'s own http pushers', () => expect(pushDevices(all, APP, null, GW).map((d) => d.id).sort()).toEqual(['a-key', 'b-key']))
  it('puts this browser first and marks it', () => {
    const d = pushDevices(all, APP, 'b-key', GW)
    expect(d.map((x) => [x.id, x.mine])).toEqual([['b-key', true], ['a-key', false]])
  })
  it('marks none as this browser when this browser has no subscription', () => expect(pushDevices(all, APP, null, GW).some((d) => d.mine)).toBe(false))
  it('says which service each uses', () => expect(pushDevices(all, APP, null, GW).map((d) => d.service)).toEqual(['Google (Chrome, Edge, Android)', 'Apple (Safari)']))
  it('flags a pusher set up for a different gateway', () => {
    const d = pushDevices([p('old', { url: 'https://old.example.org/_matrix/push/v1/notify' }), p('new')], APP, null, GW)
    expect(d.find((x) => x.id === 'old')?.otherGateway).toBe(true)
    expect(d.find((x) => x.id === 'new')?.otherGateway).toBe(false)
  })
  it('does not flag anything when no gateway is configured', () => expect(pushDevices([p('x')], APP, null, null)[0].otherGateway).toBe(false))
  it('copes with an empty list and with missing fields', () => {
    expect(pushDevices([], APP, null, GW)).toEqual([])
    expect(pushDevices([{ app_id: APP, pushkey: 'k' } as Pusher], APP, null, GW)[0]).toMatchObject({ id: 'k', name: 'Tessera', service: 'Unknown service' })
  })
})
