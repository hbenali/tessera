<script lang="ts">
  import Modal from './Modal.svelte'
  import Avatar from './Avatar.svelte'
  import { chat } from './matrix.svelte'
  import { ui } from './ui.svelte'

  let value = $state('')
  let encrypted = $state(true)
  let error = $state('')
  let results = $state<{ id: string; name: string }[]>([])
  let timer: ReturnType<typeof setTimeout> | undefined
  const focus = (n: HTMLElement) => n.focus()
  const tabs = [['room', 'New room'], ['dm', 'Message someone'], ['join', 'Join'], ['explore', 'Explore'], ['space', 'New space']] as const

  $effect(() => {
    ui.newTab
    value = ''
    error = ''
    results = []
  })

  import type { PublicRoom } from './directory'
  let found = $state<PublicRoom[]>([])
  let searching = $state(false)
  let asked = $state<string[]>([])
  let reason = $state('')
  let knocking = $state<string | null>(null)
  let dirTimer: ReturnType<typeof setTimeout> | undefined
  $effect(() => {
    if (ui.newTab !== 'explore') return
    const term = value
    clearTimeout(dirTimer)
    dirTimer = setTimeout(async () => {
      searching = true
      error = ''
      try { found = await chat.searchDirectory(term) } catch (e) { error = e instanceof Error ? e.message : String(e); found = [] }
      searching = false
    }, term ? 300 : 0)
  })
  async function enter(r: PublicRoom) {
    error = ''
    try { await chat.joinRoom(r.alias ?? r.id); ui.modal = null } catch (e) { error = e instanceof Error ? e.message : String(e) }
  }
  async function ask(r: PublicRoom) {
    error = ''
    try { await chat.knock(r.alias ?? r.id, reason); asked = [...asked, r.id]; knocking = null; reason = '' } catch (e) { error = e instanceof Error ? e.message : String(e) }
  }

  function search() {
    clearTimeout(timer)
    const term = value.trim()
    if (ui.newTab !== 'dm' || term.length < 2) { results = []; return }
    timer = setTimeout(async () => {
      try { results = await chat.searchUsers(term) } catch (e) { error = e instanceof Error ? e.message : String(e) }
    }, 250)
  }
  async function submit(e: Event) {
    e.preventDefault()
    try {
      if (ui.newTab === 'join') await chat.joinRoom(value.trim())
      else if (ui.newTab === 'dm') await chat.startDM(value.trim())
      else if (ui.newTab === 'space') await chat.createSpace(value.trim())
      else await chat.createRoom(value.trim(), encrypted)
      ui.modal = null
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }
  }
  async function pickUser(id: string) {
    try { await chat.startDM(id); ui.modal = null } catch (err) { error = err instanceof Error ? err.message : String(err) }
  }
</script>

<Modal title="Start something" onclose={() => (ui.modal = null)}>
  <div class="tabs" role="tablist">
    {#each tabs as [k, label] (k)}<button role="tab" aria-selected={ui.newTab === k} class:on={ui.newTab === k} onclick={() => (ui.newTab = k)}>{label}</button>{/each}
  </div>
  <form onsubmit={submit}>
    <input use:focus bind:value oninput={search} aria-label={ui.newTab === 'dm' ? 'Find a person' : ui.newTab === 'join' ? 'Room address' : ui.newTab === 'explore' ? 'Search public rooms' : ui.newTab === 'space' ? 'Space name' : 'Room name'}
      placeholder={ui.newTab === 'join' ? '#room:server or room ID' : ui.newTab === 'dm' ? 'Search people or enter @user:server' : ui.newTab === 'explore' ? 'Search public rooms, or "rust @ matrix.org"' : ui.newTab === 'space' ? 'Space name' : 'Room name'} required={ui.newTab !== 'explore'} />
    {#if ui.newTab === 'explore'}
      {#if searching}<p class="hint">Searching…</p>{/if}
      <ul class="dir">{#each found as r (r.id)}
        <li class="room"><Avatar name={r.name} size={34} src={r.avatar} />
          <span class="info"><b>{r.name}</b><small>{r.members} {r.members === 1 ? 'member' : 'members'}{r.alias && r.alias !== r.name ? ` · ${r.alias}` : ''}</small>{#if r.topic}<small class="topic">{r.topic}</small>{/if}</span>
          {#if r.join === 'public'}<button type="button" class="btn sm" onclick={() => enter(r)}>Join</button>
          {:else if asked.includes(r.id)}<span class="hint">Asked</span>
          {:else}<button type="button" class="btn ghost sm" onclick={() => (knocking = knocking === r.id ? null : r.id)}>Ask to join</button>{/if}
        </li>
        {#if knocking === r.id}<li class="why"><input aria-label="Why do you want to join?" placeholder="Why do you want to join? (optional)" bind:value={reason} maxlength="200" /><button type="button" class="btn sm" onclick={() => ask(r)}>Send request</button></li>{/if}
      {:else}{#if !searching}<li class="hint">No public rooms found</li>{/if}{/each}</ul>
    {/if}
    {#if ui.newTab === 'room'}<label class="check"><input type="checkbox" bind:checked={encrypted} /> End-to-end encrypted</label>{/if}
    {#if ui.newTab === 'dm' && results.length}
      <ul>{#each results as u (u.id)}<li><button type="button" onclick={() => pickUser(u.id)}><Avatar name={u.name} size={30} round /><span><b>{u.name}</b><small>{u.id}</small></span></button></li>{/each}</ul>
    {/if}
    {#if error}<div class="err" role="alert">{error}</div>{/if}
    {#if ui.newTab !== 'explore' && (ui.newTab !== 'dm' || value.startsWith('@'))}<button class="btn">{ui.newTab === 'join' ? 'Join' : ui.newTab === 'dm' ? 'Start chat' : ui.newTab === 'space' ? 'Create space' : 'Create room'}</button>{/if}
  </form>
</Modal>

<style>
  .tabs { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 16px; padding: 3px; background: var(--tile); border-radius: 8px; } .tabs button { flex: 1 1 auto; white-space: nowrap; padding: 6px 8px; border-radius: 6px; font-size: 13px; font-weight: 500; color: var(--muted); } .tabs .on { background: var(--bg); color: var(--text); }
  form { display: grid; gap: 14px; } .check { display: flex; gap: 10px; align-items: center; } input[type='checkbox'] { accent-color: var(--accent); width: 16px; height: 16px; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; } li button { display: flex; gap: 10px; align-items: center; width: 100%; padding: 7px 8px; border-radius: 8px; text-align: left; } li button:hover { background: var(--tile); } li span { display: grid; } small { color: var(--muted); }
  .err { color: var(--danger); font-size: 13px; }
  .dir { max-height: 320px; overflow: auto; } .room { display: flex; gap: 10px; align-items: center; padding: 6px 4px; } .info { flex: 1; min-width: 0; display: grid; } .info small { color: var(--muted); } .topic { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .why { display: flex; gap: 6px; padding: 0 4px 6px; } .why input { flex: 1; font: inherit; color: var(--text); background: var(--tile); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; } .sm { padding: 4px 12px; } .hint { color: var(--muted); font-size: 13px; margin: 0; }
</style>
