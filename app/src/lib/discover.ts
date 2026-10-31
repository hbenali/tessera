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

export interface RegisterPlan {
  /** Stages to complete, in order, among the ones Tessera can do. */
  stages: string[]
  needsToken: boolean
}
const TOKEN = ['m.login.registration_token', 'org.matrix.msc3231.login.registration_token']
const DOABLE = ['m.login.dummy', ...TOKEN]

/** Pick a sign-up flow made only of steps Tessera can do (nothing, or a registration token). Undefined when there is none. */
export function planRegistration(flows: { stages: string[] }[]): RegisterPlan | undefined {
  const flow = flows.find((f) => f.stages.every((s) => DOABLE.includes(s)))
  return flow ? { stages: flow.stages, needsToken: flow.stages.some((s) => TOKEN.includes(s)) } : undefined
}

export type RegisterProbe = { plan: RegisterPlan; session: string } | { closed: string }

/** Ask how to sign up. Returns a plan, or why it cannot be done here (closed, or needs email or captcha). */
export async function probeRegistration(baseUrl: string): Promise<RegisterProbe> {
  const res = await fetch(`${baseUrl}/_matrix/client/v3/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: withTimeout(8000) })
  const j = await res.json().catch(() => ({}))
  if (res.status === 403) return { closed: 'This homeserver does not allow signing up' }
  if (res.status !== 401 || !j.flows) return { closed: 'This homeserver does not offer sign-up here' }
  const plan = planRegistration(j.flows)
  return plan ? { plan, session: j.session } : { closed: 'This homeserver asks for an email address, a captcha or terms that Tessera cannot do yet. Create the account on the homeserver\'s own site, then sign in here.' }
}

export interface NewSession { baseUrl: string; accessToken: string; userId: string; deviceId: string }

export async function registerAccount(baseUrl: string, user: string, password: string, plan: RegisterPlan, session: string, token: string): Promise<NewSession> {
  let sess = session
  for (const stage of plan.stages) {
    const auth = TOKEN.includes(stage) ? { type: stage, token: token.trim(), session: sess } : { type: stage, session: sess }
    const res = await fetch(`${baseUrl}/_matrix/client/v3/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: withTimeout(15000),
      body: JSON.stringify({ username: user, password, auth, initial_device_display_name: 'Tessera' }),
    })
    const j = await res.json().catch(() => ({}))
    if (res.ok && j.access_token) return { baseUrl, accessToken: j.access_token, userId: j.user_id, deviceId: j.device_id }
    if (res.status === 401 && j.session) { sess = j.session; continue }
    throw new Error(j.errcode === 'M_USER_IN_USE' ? 'That user name is taken' : j.errcode === 'M_INVALID_USERNAME' ? 'That user name is not allowed (use lowercase letters, digits and . _ = - /)' : j.errcode === 'M_WEAK_PASSWORD' ? (j.error ?? 'That password is too weak') : j.errcode === 'M_UNAUTHORIZED' ? 'That registration token is not valid' : (j.error ?? `Sign-up failed (${res.status})`))
  }
  throw new Error('Sign-up needs more steps than Tessera can do here')
}
