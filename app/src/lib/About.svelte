<script lang="ts">
  import { chat } from './matrix.svelte'
  import { install } from './install.svelte'

  const REPO = 'https://github.com/hbenali/tessera'
  let serverSpec = $state('')
  let rustCrypto = $state('')
  let deviceKey = $state('')
  let checking = $state('')
  let copied = $state(false)

  $effect(() => {
    const c = chat.client
    if (!c) return
    c.getVersions().then((v) => (serverSpec = v.versions.at(-1) ?? ''), () => {})
    rustCrypto = c.getCrypto()?.getVersion() ?? ''
    c.getCrypto()?.getOwnDeviceKeys().then((k) => (deviceKey = k.ed25519.match(/.{1,4}/g)?.join(' ') ?? k.ed25519), () => {})
  })

  const built = new Date(__BUILD_DATE__).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

  async function check() {
    checking = 'Checking…'
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      await reg?.update()
      await new Promise((r) => setTimeout(r, 1500))
      checking = install.updated ? 'A new version is ready. Reload to use it.' : 'You are up to date.'
    } catch {
      checking = 'Could not check. Are you offline?'
    }
  }

  // Everything useful when reporting a problem, and nothing secret: no access token, no keys beyond the public fingerprint.
  const debug = $derived(
    [
      `Tessera ${__APP_VERSION__} (${__BUILD_COMMIT__}, built ${__BUILD_DATE__})`,
      `matrix-js-sdk ${__SDK_VERSION__}, ${rustCrypto || 'crypto unavailable'}`,
      `Homeserver ${chat.client?.getHomeserverUrl() ?? '?'}, Matrix spec ${serverSpec || '?'}`,
      `User ${chat.userId}, device ${chat.client?.getDeviceId() ?? '?'}`,
      navigator.userAgent,
    ].join('\n'),
  )
  async function copy() {
    try {
      await navigator.clipboard.writeText(debug)
      copied = true
      setTimeout(() => (copied = false), 1800)
    } catch {
      copied = false
    }
  }
</script>

<div class="head">
  <img src="/icon-192.png" alt="" width="56" height="56" />
  <div>
    <h3>Tessera <span class="ver mono">{__APP_VERSION__}</span></h3>
    <p class="hint">A fast, private Matrix chat client. Build <span class="mono">{__BUILD_COMMIT__}</span>, {built}.</p>
  </div>
</div>

<p class="links">
  <a href={REPO} target="_blank" rel="noopener noreferrer">Source code</a>
  <a href="{REPO}/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">Licence (MIT)</a>
  <a href="{REPO}/blob/main/SECURITY.md" target="_blank" rel="noopener noreferrer">Report a vulnerability</a>
  <a href="{REPO}/issues" target="_blank" rel="noopener noreferrer">Report a problem</a>
</p>

<h3 class="label">This session</h3>
<dl>
  <dt>User</dt><dd class="mono">{chat.userId}</dd>
  <dt>Homeserver</dt><dd class="mono">{chat.client?.getHomeserverUrl()}</dd>
  <dt>Matrix spec</dt><dd class="mono">{serverSpec || '…'}</dd>
  <dt>Device</dt><dd class="mono">{chat.client?.getDeviceId()}</dd>
  {#if deviceKey}<dt>Session key</dt><dd class="mono key">{deviceKey}</dd>{/if}
</dl>

<h3 class="label">Built with</h3>
<dl>
  <dt>matrix-js-sdk</dt><dd class="mono">{__SDK_VERSION__}</dd>
  <dt>Encryption</dt><dd class="mono">{rustCrypto || '…'}</dd>
</dl>

<div class="row">
  <button class="btn" onclick={check}>Check for updates</button>
  <button class="btn ghost" onclick={copy}>{copied ? 'Copied' : 'Copy details for a bug report'}</button>
</div>
{#if checking}<p class="hint" role="status">{checking}</p>{/if}
<p class="hint">The copied details contain no access token or private key. The session key is a public fingerprint you can compare when verifying this device.</p>

<style>
  .head { display: flex; gap: 14px; align-items: center; margin-bottom: 12px; } .head img { border-radius: 12px; } h3 { margin: 0; } .ver { font-size: 12px; color: var(--muted); font-weight: 400; }
  .hint { color: var(--muted); font-size: 13px; margin: 2px 0 0; }
  .links { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 0 0 8px; } .links a { color: var(--accent); }
  .label { margin: 18px 0 6px; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 14px; margin: 0; padding: 10px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); font-size: 13px; } dt { color: var(--muted); } dd { margin: 0; overflow-wrap: anywhere; } .key { line-height: 1.5; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
</style>
