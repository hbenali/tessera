import { describe, expect, it } from 'vitest'
import { deviceName } from './devicename'

const CHROME_LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
describe('deviceName', () => {
  it('names the browser and the system', () => expect(deviceName(CHROME_LINUX)).toBe('Tessera (Chrome on Linux)'))
  it('tells Edge and Opera from Chrome, which they also claim to be', () => {
    expect(deviceName(CHROME_LINUX + ' Edg/130.0')).toBe('Tessera (Edge on Linux)')
    expect(deviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36 OPR/110')).toBe('Tessera (Opera on Windows)')
  })
  it('knows Firefox, Safari on a Mac, and phones', () => {
    expect(deviceName('Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0')).toBe('Tessera (Firefox on Linux)')
    expect(deviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605 Version/17 Safari/605')).toBe('Tessera (Safari on macOS)')
    expect(deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17 Mobile Safari/604')).toBe('Tessera (Safari on iPhone)')
    expect(deviceName('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537 Chrome/130 Mobile Safari/537')).toBe('Tessera (Chrome on Android)')
  })
  it('says so for an installed app', () => expect(deviceName(CHROME_LINUX, true)).toBe('Tessera (installed app, Chrome on Linux)'))
  it('is just the app name when the browser says nothing useful', () => expect(deviceName('')).toBe('Tessera'))
})
