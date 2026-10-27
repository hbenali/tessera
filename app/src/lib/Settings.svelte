<script lang="ts">
  import Modal from './Modal.svelte'
  import { chat } from './matrix.svelte'
  import { security } from './security.svelte'
  import { ui } from './ui.svelte'

  let tab = $state<'look' | 'security' | 'account'>('security')
  let password = $state('')
  let recovery = $state('')
  $effect(() => { security.refresh() })
</script>

<Modal title="Settings" onclose={() => (ui.modal = null)}>
  <div class="tabs" role="tablist">
    {#each [['look', 'Appearance'], ['security', 'Security'], ['account', 'Account']] as [k, label] (k)}
      <button role="tab" aria-selected={tab === k} class:on={tab === k} onclick={() => (tab = k as typeof tab)}>{label}</button>
    {/each}
  </div>

  {#if tab === 'look'}
    <h3 class="label">Theme</h3>
    <div class="row">
      {#each ['auto', 'light', 'dark'] as t (t)}
        <button class="opt" class:on={ui.theme === t} onclick={() => ui.setTheme(t as 'auto')}>{t}</button>
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
  {:else}
    <p>Signed in as <b>{chat.userId}</b></p>
    <button class="btn" onclick={() => chat.logout()}>Sign out</button>
  {/if}
</Modal>

<style>
  .tabs { display: flex; gap: 20px; margin-bottom: 18px; } .tabs button { color: var(--muted); padding-bottom: 3px; border-bottom: 2px solid transparent; } .tabs .on { color: var(--text); border-bottom-color: var(--accent); }
  h3 { margin: 22px 0 8px; font-weight: 400; }
  .row { display: flex; gap: 10px; } .opt { padding: 6px 14px; border: 1px solid var(--line); text-transform: capitalize; } .opt.on { border-color: var(--text); background: var(--text); color: var(--bg); }
  .status { margin: 0; padding: 10px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; color: var(--accent); } .status.ok { color: var(--ok); } .status .mono { color: var(--muted); }
  form { display: flex; gap: 12px; align-items: end; }
  .key { padding: 14px 0; } code { display: block; word-break: break-all; margin: 10px 0 14px; padding: 12px; background: var(--tile); font-family: var(--mono); font-size: 13px; }
  .err { color: var(--accent); font-size: 13px; margin-top: 12px; }
</style>
