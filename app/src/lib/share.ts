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

/** How many files were shared (they wait in IndexedDB, put there by the service worker), or 0. */
export function readShareFiles(search: string): number {
  const q = new URLSearchParams(search)
  const n = Number(q.get('files'))
  return q.has('share') && Number.isInteger(n) && n >= 1 && n <= MAX_FILES ? n : 0
}

export const MAX_FILES = 10
export const MAX_FILE_BYTES = 100 * 1024 * 1024

/** The share sheet's own rules for what to accept, so Tessera is offered only for things it can send. */
export const SHARE_ACCEPT = ['image/*', 'video/*', 'audio/*', 'application/pdf', 'text/*', 'application/zip', 'application/json', 'application/vnd.openxmlformats-officedocument.*', 'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint']

/** The address without the share parameters, so a reload does not share again. */
export function withoutShare(href: string): string {
  const u = new URL(href)
  for (const k of ['share', 'title', 'text', 'url', 'files']) u.searchParams.delete(k)
  return u.pathname + (u.search || '') + u.hash
}
