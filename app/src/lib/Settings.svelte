<script lang="ts">
  import Modal from './Modal.svelte'
  import { chat } from './matrix.svelte'
  import { security } from './security.svelte'
  import { THEMES, ui } from './ui.svelte'

  let tab = $state<'look' | 'security' | 'notify' | 'account'>('security')
  let perm = $state(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
  async function enableNotifications() {
    perm = await Notification.requestPermission()
  }
  let password = $state('')
  let recovery = $state('')
  $effect(() => { security.refresh() })
</script>

<Modal title="Settings" onclose={() => (ui.modal = null)}>
  <div class="tabs" role="tablist">
    {#each [['look', 'Appearance'], ['security', 'Security'], ['notify', 'Notifications'], ['account', 'Account']] as [k, label] (k)}
      <button role="tab" aria-selected={tab === k} class:on={tab === k} onclick={() => (tab = k as typeof tab)}>{label}</button>
    {/each}
  </div>

  {#if tab === 'look'}
    <h3 class="label">Theme</h3>
    <div class="themes" role="radiogroup" aria-label="Theme">
      {#each THEMES as t (t.id)}
        <button class="theme" role="radio" aria-checked={ui.theme === t.id} class:on={ui.theme === t.id} onclick={() => ui.setTheme(t.id)}>
          <span class="swatch" style="background:{t.bg};color:{t.fg}"><i style="background:{t.ac}"></i><b>Aa</b></span>
          <span>{t.label}</span>
        </button>
      {/each}
    </div>
  {:else if tab === 'security'}
    <p class="status" class:ok={security.verified}>{security.verified ? 'This session is verified.' : 'This session is not verified.'}
      <span class="mono">Key backup {security.hasBackup ? 'on' : 'off'}</span></p>

    {#if security.generatedKey}
      <div class="key">
        <p><b>Save your recovery key.</b> It is shown once. Without it, encrypted history can be lost.</p>
        <code>{security.generatedKey}</code>
        <div class="row"><button class="btn ghost" onclick={() => navigator.clipboard.writeText(security.generatedKey)}>Copy</button>
          <button class="btn" onclick={() => (security.generatedKey = '')}>I have saved it</button></div>
      </div>
    {:else}
      <h3 class="label">Verify with another device</h3>
      <button class="btn" disabled={security.busy} onclick={() => security.requestVerification()}>Start verification</button>
      <h3 class="label">Restore with recovery key</h3>
      <form onsubmit={(e) => { e.preventDefault(); security.restore(recovery); recovery = '' }}>
        <input bind:value={recovery} placeholder="Recovery key" autocomplete="off" />
        <button class="btn" disabled={security.busy || !recovery}>Restore</button>
      </form>
      <h3 class="label">First time: set up encryption</h3>
      <form onsubmit={(e) => { e.preventDefault(); security.setup(password); password = '' }}>
        <input type="password" bind:value={password} placeholder="Account password" autocomplete="current-password" />
        <button class="btn" disabled={security.busy || !password}>Set up</button>
      </form>
    {/if}
    {#if security.message}<div class="err" role="alert">{security.message}</div>{/if}
  {:else if tab === 'notify'}
    <h3 class="label">Desktop notifications</h3>
    {#if perm === 'unsupported'}
      <p class="hint">This browser does not support notifications.</p>
    {:else if perm === 'granted'}
      <p class="status ok">Enabled. You will be notified of new messages while this tab is in the background.</p>
    {:else if perm === 'denied'}
      <p class="hint">Blocked in your browser settings. Allow notifications for this site, then reload.</p>
    {:else}
      <p class="hint">Get a notification when a message arrives in a room you are not looking at.</p>
      <button class="btn" onclick={enableNotifications}>Enable notifications</button>
    {/if}
    <p class="hint">Message text is shown in the notification for unencrypted rooms and, once decrypted on this device, for encrypted ones. Notifications follow your Matrix push rules.</p>
  {:else}
    <p>Signed in as <b>{chat.userId}</b></p>
    <button class="btn" onclick={() => chat.logout()}>Sign out</button>
  {/if}
</Modal>

<style>
  .tabs { display: flex; gap: 4px; margin-bottom: 16px; padding: 3px; background: var(--tile); border-radius: 8px; } .tabs button { flex: 1; padding: 6px 8px; border-radius: 6px; font-size: 13px; font-weight: 500; color: var(--muted); } .tabs .on { background: var(--bg); color: var(--text); }
  .hint { color: var(--muted); font-size: 13px; }
  h3 { margin: 20px 0 8px; }
  .themes { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 10px; }
  .theme { display: grid; gap: 6px; text-align: left; font-size: 13px; padding: 6px; border-radius: 8px; border: 2px solid transparent; } .theme.on { border-color: var(--accent); }
  .swatch { display: flex; align-items: center; justify-content: space-between; padding: 10px; border-radius: 6px; border: 1px solid var(--line); } .swatch i { width: 14px; height: 14px; border-radius: 3px; } .swatch b { font-size: 18px; }
  .row { display: flex; gap: 10px; }
  .status { margin: 0; padding: 10px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; color: var(--danger); } .status.ok { color: var(--ok); } .status .mono { color: var(--muted); }
  form { display: flex; gap: 12px; align-items: end; }
  .key { padding: 14px 0; } code { display: block; word-break: break-all; margin: 10px 0 14px; padding: 12px; background: var(--tile); font-family: var(--mono); font-size: 13px; }
  .err { color: var(--danger); font-size: 13px; margin-top: 12px; }
</style>
