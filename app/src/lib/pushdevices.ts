// The browsers that have turned on background notifications for this account, from the homeserver's list of pushers. SDK-free.
export interface Pusher {
  app_id: string
  pushkey: string
  kind?: string | null
  device_display_name?: string
  app_display_name?: string
  lang?: string
  data?: { url?: string; endpoint?: string }
}

export interface PushDevice {
  /** The pusher's key: unique per browser. */
  id: string
  name: string
  /** Who delivers to it: Google, Mozilla, Apple or Microsoft, from the host of its endpoint. */
  service: string
  mine: boolean
  /** It is set up for a different gateway than this site's, so it will not get what this gateway sends. */
  otherGateway: boolean
}

/** Only the host of an endpoint is ever shown: the whole address is a private capability. */
export function serviceName(endpoint: string | undefined): string {
  let host = ''
  try { host = new URL(endpoint ?? '').hostname.toLowerCase() } catch { return 'Unknown service' }
  if (host === 'fcm.googleapis.com' || host.endsWith('.googleapis.com')) return 'Google (Chrome, Edge, Android)'
  if (host.endsWith('.push.services.mozilla.com') || host === 'push.services.mozilla.com') return 'Mozilla (Firefox)'
  if (host.endsWith('.push.apple.com')) return 'Apple (Safari)'
  if (host.endsWith('.notify.windows.com')) return 'Microsoft (Edge, Windows)'
  return host || 'Unknown service'
}

/** Tessera's own pushers, this browser's first, then by name. */
export function pushDevices(pushers: readonly Pusher[], appId: string, mineKey: string | null, gateway: string | null): PushDevice[] {
  return pushers
    .filter((p) => p.app_id === appId && p.kind !== 'email' && typeof p.pushkey === 'string' && p.pushkey)
    .map((p): PushDevice => ({
      id: p.pushkey,
      name: (p.device_display_name || p.app_display_name || 'Tessera').slice(0, 80),
      service: serviceName(p.data?.endpoint),
      mine: !!mineKey && p.pushkey === mineKey,
      otherGateway: !!gateway && !!p.data?.url && p.data.url !== gateway,
    }))
    .sort((a, b) => Number(b.mine) - Number(a.mine) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}
