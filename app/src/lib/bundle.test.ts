import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Static imports reachable from a file (relative ones are followed). */
function reach(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file)) return seen
  seen.add(file)
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(/^\s*import\s+(?!type\b)[^'"\n]*?from\s+['"]([^'"]+)['"]/gm)) {
    const spec = m[1]
    if (!spec.startsWith('.')) { seen.add(spec); continue }
    const base = resolve(dirname(file), spec)
    for (const ext of ['', '.ts', '.svelte', '.svelte.ts']) {
      try { if (readFileSync(base + ext, 'utf8')) { reach(base + ext, seen); break } } catch { /* try next */ }
    }
  }
  return seen
}

describe('login bundle', () => {
  it('does not statically import the Matrix SDK', () => {
    const login = [...reach(resolve(__dirname, '../main.ts'))]
    expect(login.filter((f) => /matrix-js-sdk|matrix\.svelte|security\.svelte|Shell\.svelte/.test(f))).toEqual([])
  })
})
