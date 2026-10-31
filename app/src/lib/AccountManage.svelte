<script lang="ts">
  import { chat } from './matrix.svelte'
  let current = $state('')
  let next = $state('')
  let again = $state('')
  let others = $state(true)
  let msg = $state('')
  let err = $state('')
  let ids = $state<{ medium: string; address: string }[]>([])
  let danger = $state(false)
  let pw = $state('')
  let erase = $state(false)
  let sure = $state('')
  const mismatch = $derived(!!again && next !== again)
  async function loadIds() { try { ids = await chat.threePids() } catch { ids = [] } }
  $effect(() => { loadIds() })
  async function change(e: Event) {
    e.preventDefault(); err = ''; msg = ''
    if (next.length < 8) { err = 'Use at least 8 characters'; return }
    try { await chat.changePassword(current, next, others); msg = 'Password changed'; current = next = again = '' } catch (x) { err = x instanceof Error ? x.message : 'Could not change the password' }
  }
  async function drop(medium: string, address: string) {
    err = ''
    try { await chat.removeThreePid(medium, address); await loadIds() } catch (x) { err = x instanceof Error ? x.message : 'Could not remove it' }
  }
  async function deactivate() {
    err = ''
    try { await chat.deactivateAccount(pw, erase) } catch (x) { err = x instanceof Error ? x.message : 'Could not deactivate' }
  }
</script>

<h3 class="label">Change password</h3>
<form onsubmit={change}>
  <label>Current password<input type="password" bind:value={current} autocomplete="current-password" required /></label>
  <label>New password<input type="password" bind:value={next} autocomplete="new-password" minlength="8" required /></label>
  <label>Repeat the new password<input type="password" bind:value={again} autocomplete="new-password" required />{#if mismatch}<small class="e">The passwords differ</small>{/if}</label>
  <label class="chk"><input type="checkbox" bind:checked={others} /> Sign out my other sessions</label>
  <button class="btn" disabled={!current || !next || next !== again}>Change password</button>
</form>

{#if ids.length}
  <h3 class="label">Email and phone</h3>
  <ul>{#each ids as t (t.medium + t.address)}<li><span>{t.address} <small>({t.medium === 'msisdn' ? 'phone' : t.medium})</small></span><button class="btn ghost sm" onclick={() => drop(t.medium, t.address)}>Remove</button></li>{/each}</ul>
  <p class="hint">Adding an address needs a link sent to it; do that from your homeserver's own account page.</p>
{/if}

<h3 class="label">Deactivate account</h3>
{#if danger}
  <p class="warn">This cannot be undone. You will not be able to sign in again, and your user name cannot be reused.</p>
  <label>Your password<input type="password" bind:value={pw} autocomplete="current-password" /></label>
  <label class="chk"><input type="checkbox" bind:checked={erase} /> Ask the server to forget the messages I sent</label>
  <label>Type <b>deactivate</b> to confirm<input bind:value={sure} autocomplete="off" /></label>
  <div class="row"><button class="btn danger" disabled={sure !== 'deactivate'} onclick={deactivate}>Deactivate my account</button><button class="btn ghost" onclick={() => (danger = false)}>Cancel</button></div>
{:else}
  <button class="btn ghost" onclick={() => (danger = true)}>Deactivate account…</button>
{/if}
{#if err}<p class="e" role="alert">{err}</p>{:else if msg}<p class="okm" role="status">{msg}</p>{/if}

<style>
  form { display: grid; gap: 8px; } label { display: grid; gap: 4px; font-size: 12px; color: var(--muted); margin-top: 6px; } form label { margin-top: 0; }
  input:not([type=checkbox]) { font: inherit; color: var(--text); background: var(--tile); border: 1px solid var(--line); border-radius: 8px; padding: 7px 9px; }
  .chk { display: flex; align-items: center; gap: 8px; } ul { list-style: none; margin: 0; padding: 0; } li { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 0; } .sm { padding: 3px 10px; }
  .e { color: var(--danger); font-size: 12px; } .okm { color: var(--ok); font-size: 13px; } .warn { color: var(--danger); font-size: 13px; margin: 6px 0; } .hint { color: var(--muted); font-size: 12px; } .row { display: flex; gap: 8px; margin-top: 8px; }
  .btn.danger { background: var(--danger); color: var(--bg); }
</style>
