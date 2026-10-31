// Which files the service worker keeps so the installed app starts with no network. Pure, so a test can hold it to account.
export interface Precache {
  /** Needed to start the app at all: kept when the worker installs. */
  core: string[]
  /** Big but needed once signed in (the encryption module): kept in the background after install. */
  large: string[]
  /** Changes whenever any file does, so a new build replaces the old cache. */
  version: string
}

const SHELL = ['/', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png']

/** From the files a build emitted (paths relative to the site root, no leading slash). */
export function planPrecache(emitted: readonly string[]): Precache {
  const files = emitted.filter((f) => f.startsWith('assets/') && !f.endsWith('.map')).sort()
  const large = files.filter((f) => f.endsWith('.wasm')).map((f) => '/' + f)
  const core = [...SHELL, ...files.filter((f) => !f.endsWith('.wasm')).map((f) => '/' + f)]
  // an FNV-1a hash of the sorted file names: they carry content hashes, so any change in any file changes this
  let h = 0x811c9dc5
  for (const c of files.join('|')) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0 }
  return { core, large, version: h.toString(36) }
}

/** The line in sw.js that carries the plan; replaced at build time. */
export const MARKER = /^const PRECACHE = .*; \/\/ @precache$/m
export const inject = (sw: string, plan: Precache): string => {
  if (!MARKER.test(sw)) throw new Error('sw.js has no "// @precache" line to fill in')
  return sw.replace(MARKER, `const PRECACHE = ${JSON.stringify(plan)}; // @precache`)
}
