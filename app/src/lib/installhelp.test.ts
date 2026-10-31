import { describe, expect, it } from 'vitest'
import { installHelp } from './installhelp'

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0 Mobile/15E148 Safari/604.1'
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
const MAC_SAFARI = IPAD_AS_MAC
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Mobile Safari/537.36'
const DESKTOP_CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36'

describe('installHelp', () => {
  it('walks an iPhone Safari user through Share, then Add to Home Screen', () => {
    const h = installHelp(IPHONE_SAFARI, false)
    expect(h?.steps.join(' ')).toMatch(/Share.*Add to Home Screen/s)
    expect(h?.note).toMatch(/notifications/)
  })
  it('sends other iPhone browsers to Safari', () => expect(installHelp(IPHONE_CHROME, false)?.title).toMatch(/Safari/))
  it('treats an iPad that calls itself a Mac like an iPad', () => {
    expect(installHelp(IPAD_AS_MAC, false, true)?.title).toMatch(/Home Screen/)
    expect(installHelp(MAC_SAFARI, false, false)?.title).toMatch(/Dock/)
  })
  it('says nothing to browsers with their own install prompt, or to an installed app', () => {
    expect(installHelp(ANDROID_CHROME, false)).toBeNull()
    expect(installHelp(DESKTOP_CHROME, false)).toBeNull()
    expect(installHelp(IPHONE_SAFARI, true)).toBeNull()
  })
})
