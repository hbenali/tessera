<script lang="ts">
  import { chat } from './matrix.svelte'
  import { deviceTitle, isStale, lastSeen, orderDevices, type Device } from './devices'
  import Icon from './Icon.svelte'

  let list = $state<Device[]>([])
  let loading = $state(true)
  let err = $state('')
  let note = $state('')
  let editing = $state<string | null>(null)
  let draft = $state('')
  let password = $state('')
  let picked = $state<string[]>([])
  let asking = $state(false)
  const others = $derived(list.filter((d) => !d.current))
  const stale = $derived(others.filter((d) => isStale(d)))

  async function load() {
    try { list = orderDevices(await chat.loadDevices()); err = '' } catch (e) { err = e instanceof Error ? e.message : 'Could not load your sessions' }
    loading = false
  }
  $effect(() => { load() })

  async function rename(d: Device) {
    try { await chat.renameDevice(d.id, draft); editing = null; await load() } catch (e) { err = e instanceof Error ? e.message : 'Could not rename' }
  }
  async function signOut(ids: string[]) {
    err = ''; note = ''
    try {
      await chat.signOutDevices(ids, password)
      note = ids.length === 1 ? 'Signed out' : `Signed out ${ids.length} sessions`
      picked = []; asking = false; password = ''
      await load()
    } catch (e) {
      err = e instanceof Error ? e.message : 'Could not sign out'
      if (/password/i.test(err)) asking = true
    }
  }
  const toggle = (id: string) => (picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])
</script>

<h3 class="label">Your sessions</h3>
<p class="hint">Every browser or app signed in to your account. Sign out any you do not recognise, and verify the ones you do.</p>
{#if loading}<p class="hint">Loading…</p>{/if}
<ul class="devs">
  {#each list as d (d.id)}
    <li class:cur={d.current}>
      {#if !d.current}<input type="checkbox" aria-label="Select {deviceTitle(d)}" checked={picked.includes(d.id)} onchange={() => toggle(d.id)} />{/if}
      <div class="info">
        {#if editing === d.id}
          <form onsubmit={(e) => { e.preventDefault(); rename(d) }}><input aria-label="Session name" bind:value={draft} maxlength="80" /><button class="btn sm">Save</button><button type="button" class="btn ghost sm" onclick={() => (editing = null)}>Cancel</button></form>
        {:else}
          <b>{deviceTitle(d)}</b>
          <span class="meta">{lastSeen(d)}<span class="mono"> · {d.id}</span></span>
          <span class="tags">
            {#if d.verified}<span class="tag ok"><Icon name="shield" size={12} /> Verified</span>{:else if d.verified === false}<span class="tag">Not verified</span>{/if}
            {#if isStale(d)}<span class="tag warn">Inactive</span>{/if}
          </span>
        {/if}
      </div>
      {#if editing !== d.id}
        <button class="icon-btn" aria-label="Rename {deviceTitle(d)}" onclick={() => { editing = d.id; draft = d.name }}><Icon name="edit" size={15} /></button>
        {#if !d.current}<button class="btn ghost sm" onclick={() => signOut([d.id])}>Sign out</button>{/if}
      {/if}
    </li>
  {/each}
</ul>
{#if others.length}
  <div class="row">
    <button class="btn ghost" disabled={!picked.length} onclick={() => signOut(picked)}>Sign out selected ({picked.length})</button>
    {#if stale.length}<button class="btn ghost" onclick={() => signOut(stale.map((d) => d.id))}>Sign out {stale.length} inactive</button>{/if}
  </div>
{/if}
{#if asking}
  <label class="pw">Your homeserver asks for your password to confirm
    <input type="password" bind:value={password} autocomplete="current-password" />
  </label>
  <p class="hint">Enter it, then press the sign-out button again.</p>
{/if}
{#if err}<p class="err" role="alert">{err}</p>{:else if note}<p class="okmsg" role="status">{note}</p>{/if}

<style>
  .devs { list-style: none; margin: 8px 0; padding: 0; display: grid; gap: 6px; }
  li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; background: var(--tile); } li.cur { box-shadow: inset 2px 0 0 var(--accent); }
  .info { flex: 1; min-width: 0; display: grid; gap: 2px; } .info b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .meta { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
  .tags { display: flex; gap: 6px; flex-wrap: wrap; } .tag { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 1px 7px; border-radius: 8px; background: var(--bg); color: var(--muted); box-shadow: inset 0 0 0 1px var(--line); } .tag.ok { color: var(--ok); } .tag.warn { color: var(--danger); }
  form { display: flex; gap: 6px; align-items: center; } form input, .pw input { font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; min-width: 0; flex: 1; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; } .sm { padding: 3px 10px; } .pw { display: grid; gap: 4px; margin-top: 10px; font-size: 12px; color: var(--muted); }
  .hint { color: var(--muted); font-size: 12px; margin: 4px 0; } .err { color: var(--danger); font-size: 13px; } .okmsg { color: var(--ok); font-size: 13px; }
</style>
