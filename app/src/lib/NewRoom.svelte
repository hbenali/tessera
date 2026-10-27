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
  const tabs = [['room', 'New room'], ['dm', 'Message someone'], ['join', 'Join']] as const

  $effect(() => {
    ui.newTab
    value = ''
    error = ''
    results = []
  })

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
    <input use:focus bind:value oninput={search} aria-label={ui.newTab === 'dm' ? 'Find a person' : ui.newTab === 'join' ? 'Room address' : 'Room name'}
      placeholder={ui.newTab === 'join' ? '#room:server or room ID' : ui.newTab === 'dm' ? 'Search people or enter @user:server' : 'Room name'} required />
    {#if ui.newTab === 'room'}<label class="check"><input type="checkbox" bind:checked={encrypted} /> End-to-end encrypted</label>{/if}
    {#if ui.newTab === 'dm' && results.length}
      <ul>{#each results as u (u.id)}<li><button type="button" onclick={() => pickUser(u.id)}><Avatar name={u.name} size={30} round /><span><b>{u.name}</b><small>{u.id}</small></span></button></li>{/each}</ul>
    {/if}
    {#if error}<div class="err" role="alert">{error}</div>{/if}
    {#if ui.newTab !== 'dm' || value.startsWith('@')}<button class="btn">{ui.newTab === 'join' ? 'Join' : ui.newTab === 'dm' ? 'Start chat' : 'Create room'}</button>{/if}
  </form>
</Modal>

<style>
  .tabs { display: flex; gap: 4px; margin-bottom: 16px; padding: 3px; background: var(--tile); border-radius: 8px; } .tabs button { flex: 1; padding: 6px 8px; border-radius: 6px; font-size: 13px; font-weight: 500; color: var(--muted); } .tabs .on { background: var(--bg); color: var(--text); }
  form { display: grid; gap: 14px; } .check { display: flex; gap: 10px; align-items: center; } input[type='checkbox'] { accent-color: var(--accent); width: 16px; height: 16px; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; } li button { display: flex; gap: 10px; align-items: center; width: 100%; padding: 7px 8px; border-radius: 8px; text-align: left; } li button:hover { background: var(--tile); } li span { display: grid; } small { color: var(--muted); }
  .err { color: var(--danger); font-size: 13px; }
</style>
