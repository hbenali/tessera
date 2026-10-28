import { describe, expect, it } from 'vitest'
import { exactSize, extensionOf, formatSize, kindOf, safeFileName, typeLabel } from './files'

describe('formatSize', () => {
  it('uses the unit that reads best', () => {
    expect(formatSize(0)).toBe('0 B')
    expect(formatSize(999)).toBe('999 B')
    expect(formatSize(12_400)).toBe('12 kB')
    expect(formatSize(1_500_000)).toBe('1.5 MB')
    expect(formatSize(3_200_000_000)).toBe('3.2 GB')
  })
  it('says nothing when the size is unknown or nonsense', () => {
    expect(formatSize(undefined)).toBe('')
    expect(formatSize(-1)).toBe('')
    expect(formatSize(NaN)).toBe('')
  })
})

describe('safeFileName', () => {
  it('keeps an ordinary name, including spaces and unicode', () => {
    expect(safeFileName('notes.txt')).toBe('notes.txt')
    expect(safeFileName('Rapport été 2026.pdf')).toBe('Rapport été 2026.pdf')
  })
  it('makes a path harmless', () => {
    expect(safeFileName('../../etc/passwd')).not.toMatch(/[\\/]/)
    expect(safeFileName('C:\\Windows\\evil.exe')).not.toMatch(/[\\/:]/)
  })
  it('removes control characters and bidi overrides that disguise an extension', () => {
    expect(safeFileName('inv\u0000oice.pdf')).toBe('invoice.pdf')
    expect(safeFileName('photo\u202egnp.exe')).toBe('photognp.exe')
  })
  it('does not produce a hidden file, a dots-only name or an empty one', () => {
    expect(safeFileName('.bashrc')).toBe('bashrc')
    expect(safeFileName('...')).toBe('file')
    expect(safeFileName('   ')).toBe('file')
    expect(safeFileName(undefined)).toBe('file')
    expect(safeFileName('', 'attachment')).toBe('attachment')
  })
  it('limits the length', () => {
    expect(safeFileName('a'.repeat(500) + '.txt').length).toBeLessThanOrEqual(120)
  })
})

describe('extensionOf and kindOf', () => {
  it('reads the extension', () => {
    expect(extensionOf('Notes.TXT')).toBe('txt')
    expect(extensionOf('archive.tar.gz')).toBe('gz')
    expect(extensionOf('README')).toBe('')
  })
  it('sorts files into a few kinds', () => {
    expect(kindOf('a.zip')).toBe('archive')
    expect(kindOf('a.json')).toBe('code')
    expect(kindOf('a.xlsx')).toBe('sheet')
    expect(kindOf('clip', 'video/mp4')).toBe('video')
    expect(kindOf('a.txt')).toBe('document')
    expect(kindOf('a.bin')).toBe('other')
  })
})

describe('typeLabel and exactSize', () => {
  it('names a known kind of file, falls back to the MIME type, and stays quiet otherwise', () => {
    expect(typeLabel('notes.txt')).toBe('Plain text')
    expect(typeLabel('Report.PDF')).toBe('PDF document')
    expect(typeLabel('data.bin', 'application/x-custom; charset=binary')).toBe('application/x-custom')
    expect(typeLabel('x', 'text/plain')).toBe('Plain text')
    expect(typeLabel('x', 'application/octet-stream')).toBe('')
    expect(typeLabel('x')).toBe('')
  })
  it('gives the exact size', () => {
    expect(exactSize(1)).toBe('1 byte')
    expect(exactSize(0)).toBe('0 bytes')
    expect(exactSize(undefined)).toBe('')
    expect(exactSize(-5)).toBe('')
    expect(exactSize(12345)).toMatch(/^12[,.\u202f\u00a0 ]?345 bytes$/)
  })
})
