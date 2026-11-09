// The name a new session gets in the account's device list ("Tessera (Chrome on Linux)"), so people who look at their
// sessions in any Matrix client can tell which one is this. Pure; the browser and system come from the User-Agent.
const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|OPiOS\//, 'Opera'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|Chromium\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
]
const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPod/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/CrOS/, 'ChromeOS'],
  [/Windows/, 'Windows'],
  [/Macintosh|Mac OS X/, 'macOS'],
  [/Linux|X11/, 'Linux'],
]

export function deviceName(ua: string, standalone = false): string {
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1]
  const system = SYSTEMS.find(([re]) => re.test(ua))?.[1]
  const where = [browser, system].filter(Boolean).join(' on ')
  const detail = [standalone ? 'installed app' : '', where].filter(Boolean).join(', ')
  return detail ? `Tessera (${detail})` : 'Tessera'
}

/** For this browser. */
export const thisDeviceName = (): string => {
  try {
    return deviceName(navigator.userAgent, matchMedia('(display-mode: standalone)').matches)
  } catch {
    return 'Tessera'
  }
}
