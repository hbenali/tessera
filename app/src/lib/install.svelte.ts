/** Install prompt and "new version" state for the PWA. Small and SDK-free, so the sign-in page can show it. */
interface InstallEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

class Install {
  private event = $state<InstallEvent | null>(null)
  installed = $state(false)
  /** A new version has taken over the service worker; the running page is still the old one. */
  updated = $state(false)

  get canInstall() {
    return !!this.event && !this.installed
  }

  listen() {
    addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault() // keep it for the Install button instead of the browser's mini-bar
      this.event = e as InstallEvent
    })
    addEventListener('appinstalled', () => {
      this.installed = true
      this.event = null
    })
    if ('serviceWorker' in navigator) {
      // The first install also fires controllerchange; only a change from an existing worker is an update.
      const had = !!navigator.serviceWorker.controller
      let first = !had
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (first) first = false
        else this.updated = true
      })
    }
  }

  async ask() {
    const e = this.event
    if (!e) return
    this.event = null
    await e.prompt()
    if ((await e.userChoice).outcome === 'accepted') this.installed = true
  }
}

export const install = new Install()
