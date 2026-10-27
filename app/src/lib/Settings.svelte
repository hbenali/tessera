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
    <p class="hint">Theme</p>
    <div class="row">
      {#each ['auto', 'light', 'dark'] as t (t)}
        <button class="chip" class:on={ui.theme === t} onclick={() => ui.setTheme(t as 'auto')}>{t}</button>
      {/each}
    </div>
  {:else if tab === 'security'}
    <div class="status" class:ok={security.verified}>
      {security.verified ? '✓ This session is verified' : '⚠ This session is not verified'}
    </div>
    <p class="hint">Key backup: {security.hasBackup ? 'on' : 'off'}. Verify this session to read your old encrypted messages.</p>

    {#if security.generatedKey}
      <div class="key"><p><b>Save your recovery key</b>. It is shown once. Without it, encrypted history can be lost.</p><code>{security.generatedKey}</code>
        <button class="chip" onclick={() => navigator.clipboard.writeText(security.generatedKey)}>Copy</button>
        <button class="chip" onclick={() => (security.generatedKey = '')}>I saved it</button></div>
    {:else}
      <h3>Verify with another device</h3>
      <button class="primary" disabled={security.busy} onclick={() => security.requestVerification()}>Start verification</button>
      <h3>Restore with recovery key</h3>
      <form onsubmit={(e) => { e.preventDefault(); security.restore(recovery); recovery = '' }}>
        <input bind:value={recovery} placeholder="EsT… recovery key" autocomplete="off" />
        <button class="primary" disabled={security.busy || !recovery}>Restore</button>
      </form>
      <h3>First time? Set up encryption</h3>
      <form onsubmit={(e) => { e.preventDefault(); security.setup(password); password = '' }}>
        <input type="password" bind:value={password} placeholder="Account password" autocomplete="current-password" />
        <button class="primary" disabled={security.busy || !password}>Set up</button>
      </form>
    {/if}
    {#if security.message}<div class="err" role="alert">{security.message}</div>{/if}
  {:else}
    <p class="hint">Signed in as <b>{chat.userId}</b></p>
    <button class="primary danger" onclick={() => chat.logout()}>Sign out</button>
  {/if}
</Modal>

<style>
  .tabs { display: flex; gap: 6px; margin-bottom: 14px; } .tabs button { padding: 6px 12px; border-radius: 999px; color: var(--muted); } .tabs .on { background: var(--tile); color: var(--text); }
  .hint { color: var(--muted); font-size: 13px; } h3 { font-size: 13px; margin: 16px 0 6px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
  .row { display: flex; gap: 8px; } .chip { padding: 6px 14px; border-radius: 999px; background: var(--tile); border: 1px solid var(--line); text-transform: capitalize; } .chip.on { border-color: var(--accent); }
  .status { padding: 10px 14px; border-radius: 12px; background: #ffb02030; } .status.ok { background: #3ddc8430; }
  form { display: flex; gap: 8px; } input { flex: 1; padding: 9px 12px; border-radius: 10px; background: var(--bg); border: 1px solid var(--line); }
  .primary { padding: 9px 16px; border-radius: 10px; background: var(--accent); color: #1a1208; font-weight: 600; } .primary:disabled { opacity: .5; } .danger { background: var(--danger); color: #fff; }
  .key { padding: 12px; border-radius: 12px; background: var(--tile); } code { display: block; word-break: break-all; margin: 8px 0; font-size: 13px; }
  .err { color: var(--danger); font-size: 13px; margin-top: 10px; }
</style>
