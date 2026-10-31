// Content shared into Tessera from another app (Web Share Target). SDK-free.
export const SHARE_KEY = 'tessera.share'

/** Text to share from the page's query string (title, text and url, as a share sheet sends them), or undefined. */
export function readShare(search: string): string | undefined {
  const q = new URLSearchParams(search)
  if (!q.has('share')) return undefined
  const parts = [q.get('title'), q.get('text'), q.get('url')].map((p) => (p ?? '').trim()).filter(Boolean)
  // many apps put the link in both text and url
  const unique = parts.filter((p, i) => !parts.slice(0, i).some((o) => o === p || o.includes(p)))
  const text = unique.join('\n').slice(0, 4000)
  return text || undefined
}

/** The address without the share parameters, so a reload does not share again. */
export function withoutShare(href: string): string {
  const u = new URL(href)
  for (const k of ['share', 'title', 'text', 'url']) u.searchParams.delete(k)
  return u.pathname + (u.search || '') + u.hash
}
