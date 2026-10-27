/** Homeserver discovery and login options, without the (large) Matrix SDK. */
export interface LoginOptions {
  baseUrl: string
  password: boolean
  sso: { id: string; name: string }[]
}

const withTimeout = (ms: number) => AbortSignal.timeout(ms)

/** A full URL is used as typed; a bare domain goes through .well-known. */
export async function discover(server: string): Promise<string> {
  const s = server.trim().replace(/\/+$/, '')
  if (/^https?:\/\//.test(s)) return s
  try {
    const r = await fetch(`https://${s}/.well-known/matrix/client`, { signal: withTimeout(5000) })
    const url = (await r.json())?.['m.homeserver']?.base_url
    if (typeof url === 'string' && /^https?:\/\//.test(url)) return url.replace(/\/+$/, '')
  } catch {
    /* fall through to the domain itself */
  }
  return `https://${s}`
}

export async function loginOptions(server: string): Promise<LoginOptions> {
  const baseUrl = await discover(server)
  const res = await fetch(`${baseUrl}/_matrix/client/v3/login`, { signal: withTimeout(8000) })
  const flows: { type: string; identity_providers?: { id: string; name: string }[] }[] = (await res.json()).flows ?? []
  const sso = flows.find((f) => f.type === 'm.login.sso')
  return {
    baseUrl,
    password: flows.some((f) => f.type === 'm.login.password'),
    sso: sso ? (sso.identity_providers?.length ? sso.identity_providers : [{ id: '', name: 'Single sign-on' }]) : [],
  }
}

/** Redirect to the identity provider; it sends us back with ?loginToken=. */
export function startSso(baseUrl: string, idpId: string) {
  sessionStorage.setItem('tessera.sso.baseUrl', baseUrl)
  const back = location.origin + location.pathname
  const idp = idpId ? `/${encodeURIComponent(idpId)}` : ''
  location.href = `${baseUrl}/_matrix/client/v3/login/sso/redirect${idp}?redirectUrl=${encodeURIComponent(back)}`
}
