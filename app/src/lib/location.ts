// Location messages (geo: URIs). SDK-free.
export function parseGeo(uri: unknown): { lat: number; lon: number } | undefined {
  if (typeof uri !== 'string') return undefined
  const m = /^geo:(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)(?:[;,].*)?$/i.exec(uri.trim())
  if (!m) return undefined
  const lat = Number(m[1])
  const lon = Number(m[2])
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : undefined
}

/** A link to a map; no tiles are loaded by Tessera itself, so nothing is sent to a map server until you click. */
export const mapLink = (lat: number, lon: number): string => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`
