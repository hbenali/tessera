// How to install Tessera in browsers that have no Install button. SDK-free.
export interface InstallHelp { title: string; steps: string[]; note?: string }

/**
 * Safari has no install prompt: on iPhone and iPad it is Share, then Add to Home Screen; on a Mac it is Add to Dock.
 * Nothing is returned for an app that is already installed, or for a browser that offers its own prompt.
 */
export function installHelp(ua: string, standalone: boolean, touchMac = false): InstallHelp | null {
  if (standalone) return null
  const ios = /iPad|iPhone|iPod/.test(ua) || (touchMac && /Macintosh/.test(ua))
  const safari = /Safari\//.test(ua) && !/(Chrome|Chromium|CriOS|FxiOS|EdgiOS|OPiOS|Android)/.test(ua)
  if (ios && safari) {
    return {
      title: 'Add Tessera to your Home Screen',
      steps: ['Tap the Share button (the square with an arrow) in Safari.', 'Choose "Add to Home Screen".', 'Open Tessera from your Home Screen.'],
      note: 'On iPhone and iPad, notifications only work for an app opened from the Home Screen.',
    }
  }
  if (ios) {
    return { title: 'Open Tessera in Safari to install it', steps: ['Open this page in Safari.', 'Tap Share, then "Add to Home Screen".'], note: 'iPhone and iPad install web apps from Safari.' }
  }
  if (safari && /Macintosh/.test(ua)) {
    return { title: 'Add Tessera to your Dock', steps: ['In Safari, choose File, then "Add to Dock".'], note: 'Needs macOS Sonoma (14) or later.' }
  }
  return null
}

/** True when the page runs as an installed app (display mode standalone, or iOS's own flag). */
export const isStandalone = (): boolean => {
  try {
    return matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
  } catch {
    return false
  }
}
