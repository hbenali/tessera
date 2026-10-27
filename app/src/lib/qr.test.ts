import { describe, expect, it } from 'vitest'
import { decode, modules } from './qr'

// Draw the modules into RGBA pixels the way the dialog does: 6px per module and a 4 module quiet zone.
function raster(m: boolean[][], scale = 6, quiet = 4) {
  const size = (m.length + quiet * 2) * scale
  const data = new Uint8ClampedArray(size * size * 4).fill(255)
  m.forEach((row, r) => row.forEach((dark, c) => {
    if (!dark) return
    for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) {
      const i = (((r + quiet) * scale + y) * size + (c + quiet) * scale + x) * 4
      data[i] = data[i + 1] = data[i + 2] = 0
    }
  }))
  return { data, width: size, height: size }
}

describe('verification QR', () => {
  it('round-trips binary bytes, including zeros and values above 127', () => {
    const bytes = Uint8ClampedArray.from([...new TextEncoder().encode('MATRIX'), 2, 1, 0, 0, 255, 128, 200, 0, 7, ...Array.from({ length: 70 }, (_, i) => (i * 37) % 256)])
    expect(decode(raster(modules(bytes)))).toEqual(bytes)
  })
  it('finds nothing in a blank image', () => {
    expect(decode({ data: new Uint8ClampedArray(200 * 200 * 4).fill(255), width: 200, height: 200 })).toBeNull()
  })
})
