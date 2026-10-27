import { describe, expect, it } from 'vitest'

const sources = import.meta.glob<string>('/src/**/*.{ts,svelte}', { query: '?raw', import: 'default', eager: true })

const dir = (p: string) => p.slice(0, p.lastIndexOf('/'))
function resolvePath(from: string, spec: string): string | undefined {
  const parts = dir(from).split('/')
  for (const seg of spec.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.') parts.push(seg)
  }
  const base = parts.join('/')
  return ['', '.ts', '.svelte', '.svelte.ts'].map((e) => base + e).find((p) => p in sources)
}

/** Everything statically imported from a file, following relative imports. */
function reach(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file)) return seen
  seen.add(file)
  for (const m of sources[file].matchAll(/^\s*import\s+(?!type\b)[^'"\n]*?from\s+['"]([^'"]+)['"]/gm)) {
    const spec = m[1]
    const next = spec.startsWith('.') ? resolvePath(file, spec) : undefined
    if (next) reach(next, seen)
    else seen.add(spec)
  }
  return seen
}

describe('login bundle', () => {
  it('does not statically import the Matrix SDK', () => {
    const files = [...reach('/src/main.ts')]
    expect(files.some((f) => f.endsWith('App.svelte'))).toBe(true) // the walk really reached the app
    expect(files.filter((f) => /matrix-js-sdk|matrix\.svelte|security\.svelte|Shell\.svelte/.test(f))).toEqual([])
  })
})
