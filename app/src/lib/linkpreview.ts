// Finding the link a message is about. SDK-free.
const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi

/** The first web link in a message, without the punctuation that ended the sentence. Ignores links to private addresses. */
export function firstUrl(body: string): string | undefined {
  for (const raw of body.match(URL_RE) ?? []) {
    let u = raw
    while (/[.,;:!?)\]}]$/.test(u) && !(u.endsWith(')') && u.includes('('))) u = u.slice(0, -1)
    try {
      const p = new URL(u)
      if (!/^https?:$/.test(p.protocol) || p.username || p.password) continue
      if (isPrivateHost(p.hostname)) continue
      return p.href
    } catch { /* not a link */ }
  }
}

export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  return h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.') && !h.includes(':') ||
    /^(10|127)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h === '::1' || /^f[cd]/.test(h)
}

export interface Preview { url: string; title?: string; description?: string; site?: string; image?: string }

/** Turn the homeserver's Open Graph answer into what the card shows; undefined when there is nothing worth a card. */
export function toPreview(url: string, r: Record<string, unknown>): Preview | undefined {
  const s = (k: string) => (typeof r[k] === 'string' && (r[k] as string).trim() ? (r[k] as string).trim() : undefined)
  const title = s('og:title')
  const description = s('og:description')
  if (!title && !description) return undefined
  const image = s('og:image')
  return { url, title: title?.slice(0, 140), description: description?.slice(0, 280), site: s('og:site_name') ?? new URL(url).hostname, image: image?.startsWith('mxc://') ? image : undefined }
}
