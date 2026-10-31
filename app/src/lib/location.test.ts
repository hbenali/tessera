import { describe, expect, it } from 'vitest'
import { mapLink, parseGeo } from './location'

describe('parseGeo', () => {
  it('reads latitude and longitude, ignoring accuracy', () => {
    expect(parseGeo('geo:48.858370,2.294481;u=35')).toEqual({ lat: 48.85837, lon: 2.294481 })
    expect(parseGeo('geo:-33.8,151.2')).toEqual({ lat: -33.8, lon: 151.2 })
  })
  it('rejects anything else', () => {
    for (const bad of ['geo:91,0', 'geo:0,181', 'http://x', 'geo:a,b', 42, undefined]) expect(parseGeo(bad)).toBeUndefined()
  })
  it('builds a link from numbers only', () => expect(mapLink(1.5, -2)).toBe('https://www.openstreetmap.org/?mlat=1.5&mlon=-2#map=16/1.5/-2'))
})
