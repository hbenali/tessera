import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readShortcut } from './shortcuts'

const root = new URL('../../public', import.meta.url).pathname
const m = JSON.parse(readFileSync(`${root}/manifest.webmanifest`, 'utf8'))

describe('web app manifest', () => {
  it('is installable', () => {
    expect(m.name && m.short_name && m.start_url && m.display).toBeTruthy()
    expect(m.icons.some((i: { purpose?: string; sizes: string }) => i.sizes === '512x512')).toBe(true)
    expect(m.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true)
  })
  it('every icon and screenshot is a real file with the size it claims', () => {
    for (const f of [...m.icons, ...m.screenshots, ...m.shortcuts.flatMap((s: { icons: unknown[] }) => s.icons)] as { src: string; sizes: string }[]) {
      expect(existsSync(`${root}${f.src}`), f.src).toBe(true)
    }
    for (const s of m.screenshots as { src: string; sizes: string }[]) {
      const png = readFileSync(`${root}${s.src}`)
      expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, s.src).toBe(s.sizes)
    }
  })
  it('has wide and narrow screenshots, as browsers need for the richer install prompt', () => {
    expect(m.screenshots.map((s: { form_factor: string }) => s.form_factor).sort()).toEqual(['narrow', 'wide'])
  })
  it('every shortcut opens a screen the app understands, inside its own scope', () => {
    expect(m.shortcuts.length).toBeGreaterThanOrEqual(3)
    for (const s of m.shortcuts as { url: string; name: string }[]) {
      expect(s.url.startsWith('/')).toBe(true)
      const sc = readShortcut(new URL(s.url, 'https://x.example').search)
      expect(sc.action || sc.view, s.name).toBeTruthy()
    }
  })
  it('reuses an open window and keeps the share target', () => {
    expect(m.launch_handler.client_mode[0]).toBe('focus-existing')
    expect(m.share_target.params.text).toBe('text')
  })
})
