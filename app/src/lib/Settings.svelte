<script lang="ts">
  import Modal from './Modal.svelte'
  import { chat } from './matrix.svelte'
  import { security } from './security.svelte'
  import { THEMES, ui } from './ui.svelte'
  import Avatar from './Avatar.svelte'

  let tab = $state<'look' | 'security' | 'notify' | 'account'>('security')
  let perm = $state(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
  async function enableNotifications() {
    perm = await Notification.requestPermission()
  }
  let photo: HTMLInputElement | undefined = $state()
  let name = $state('')
  let profileErr = $state('')
  async function pickPhoto() {
    const f = photo?.files?.[0]
    if (!f) return
    profileErr = ''
    if (!f.type.startsWith('image/')) { profileErr = 'Choose an image file'; return }
    try { await chat.setMyAvatar(f) } catch (x) { profileErr = x instanceof Error ? x.message : 'Could not upload' }
  }
  async function saveName(e: Event) {
    e.preventDefault()
    profileErr = ''
    try { await chat.setMyName(name); name = '' } catch (x) { profileErr = x instanceof Error ? x.message : 'Could not save' }
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
    <div class="me">
      <Avatar name={chat.me.name || chat.userId} size={64} round src={chat.me.avatar} presence={chat.myStatus} />
      <div><b>{chat.me.name || chat.userId}</b><div class="hint mono">{chat.userId}</div></div>
    </div>
    <input type="file" accept="image/*" hidden bind:this={photo} onchange={pickPhoto} />
    <button class="btn ghost" onclick={() => photo?.click()}>Change photo</button>
    <form onsubmit={saveName}>
      <label class="grow">Display name<input bind:value={name} maxlength="80" placeholder={chat.me.name} /></label>
      <button class="btn" disabled={!name.trim() || name.trim() === chat.me.name}>Save</button>
    </form>
    {#if profileErr}<div class="err" role="alert">{profileErr}</div>{/if}
    <h3 class="label">Status</h3>
    <div class="seg" role="radiogroup" aria-label="Status">
      {#each [['online', 'Online'], ['unavailable', 'Away'], ['offline', 'Invisible']] as [v, t] (v)}
        <button role="radio" aria-checked={chat.myStatus === v} class:on={chat.myStatus === v} onclick={() => chat.setStatus(v as 'online')}>{t}</button>
      {/each}
    </div>
    <p class="hint">Invisible shows you as offline. Presence must be enabled on your homeserver for others to see it.</p>
    <h3 class="label">Session</h3>
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
  .me { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; } .grow { flex: 1; display: grid; gap: 4px; font-size: 12px; color: var(--muted); }
  .seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; padding: 2px; border-radius: 8px; background: var(--tile); } .seg button { padding: 6px 0; border-radius: 6px; color: var(--muted); } .seg button.on { background: var(--bg); color: var(--text); box-shadow: 0 0 0 1px var(--line); }
  .status { margin: 0; padding: 10px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; color: var(--danger); } .status.ok { color: var(--ok); } .status .mono { color: var(--muted); }
  form { display: flex; gap: 12px; align-items: end; }
  .key { padding: 14px 0; } code { display: block; word-break: break-all; margin: 10px 0 14px; padding: 12px; background: var(--tile); font-family: var(--mono); font-size: 13px; }
  .err { color: var(--danger); font-size: 13px; margin-top: 12px; }
</style>
