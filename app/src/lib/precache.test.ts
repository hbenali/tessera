import { describe, expect, it } from 'vitest'
import { inject, planPrecache } from './precache'

const emitted = ['index.html', 'assets/index-AAA.js', 'assets/index-BBB.css', 'assets/matrix.svelte-CCC.js', 'assets/matrix.svelte-CCC.js.map', 'assets/crypto-DDD.wasm', 'icon.svg']

describe('planPrecache', () => {
  it('keeps the app\'s code and styles at install, and the big wasm for later', () => {
    const p = planPrecache(emitted)
    expect(p.core).toEqual(expect.arrayContaining(['/', '/assets/index-AAA.js', '/assets/index-BBB.css', '/assets/matrix.svelte-CCC.js', '/manifest.webmanifest']))
    expect(p.core.some((f) => f.endsWith('.wasm'))).toBe(false)
    expect(p.large).toEqual(['/assets/crypto-DDD.wasm'])
  })
  it('never keeps source maps', () => expect(JSON.stringify(planPrecache(emitted))).not.toContain('.map'))
  it('the version changes with the files and not with their order', () => {
    const a = planPrecache(emitted).version
    expect(planPrecache([...emitted].reverse()).version).toBe(a)
    expect(planPrecache([...emitted, 'assets/new-EEE.js']).version).not.toBe(a)
  })
})

describe('inject', () => {
  const sw = "const A = 1\nconst PRECACHE = { core: [], large: [], version: 'dev' }; // @precache\nconst B = 2"
  it('fills in the plan and leaves the rest alone', () => {
    const out = inject(sw, planPrecache(emitted))
    expect(out).toContain('"/assets/index-AAA.js"')
    expect(out.startsWith('const A = 1\n')).toBe(true)
    expect(out.endsWith('const B = 2')).toBe(true)
  })
  it('refuses a worker that has no place for it, instead of shipping one that caches nothing', () => {
    expect(() => inject('const x = 1', planPrecache(emitted))).toThrow(/@precache/)
  })
})
