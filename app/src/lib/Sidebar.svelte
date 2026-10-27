<script lang="ts">
  import { chat } from './matrix.svelte'
  let { onsearch }: { onsearch: () => void } = $props()
  const initials = (n: string) => n.replace(/^[#@!]/, '').slice(0, 2).toUpperCase()
  const dms = $derived(chat.visibleRooms.filter((r) => r.isDM))
  const channels = $derived(chat.visibleRooms.filter((r) => !r.isDM))

  async function newRoom() {
    const name = prompt('New channel name')
    if (name) await chat.createRoom(name)
  }
  async function join() {
    const alias = prompt('Room alias or ID (e.g. #room:server)')
    if (alias) await chat.joinRoom(alias).catch((e) => alert(e.message))
  }
</script>

<aside>
  <nav class="spaces" aria-label="Spaces">
    <button class:on={!chat.activeSpace} onclick={() => (chat.activeSpace = null)} title="Home" aria-label="Home">⌂</button>
    {#each chat.spaces as s (s.id)}
      <button class:on={chat.activeSpace === s.id} onclick={() => (chat.activeSpace = s.id)} title={s.name}>{initials(s.name)}</button>
    {/each}
  </nav>
  <div class="list">
    <button class="search" onclick={onsearch}>Search or jump to… <kbd>Ctrl K</kbd></button>
    <div class="head"><span>Channels</span><span><button onclick={join} title="Join room" aria-label="Join room">⎆</button><button onclick={newRoom} title="New channel" aria-label="New channel">+</button></span></div>
    {#each channels as r (r.id)}
      <button class="room" class:active={chat.activeRoom === r.id} class:unread={r.unread > 0} onclick={() => chat.openRoom(r.id)}>
        <span class="hash">#</span><span class="name">{r.name}</span>
        {#if r.unread}<span class="badge" class:hl={r.highlight > 0}>{r.unread}</span>{/if}
      </button>
    {/each}
    {#if dms.length}<div class="head"><span>Direct messages</span></div>{/if}
    {#each dms as r (r.id)}
      <button class="room" class:active={chat.activeRoom === r.id} class:unread={r.unread > 0} onclick={() => chat.openRoom(r.id)}>
        <span class="av">{initials(r.name)}</span><span class="name">{r.name}</span>
        {#if r.unread}<span class="badge hl">{r.unread}</span>{/if}
      </button>
    {/each}
    <footer><span>{chat.userId}</span><button onclick={() => chat.logout()}>Sign out</button></footer>
  </div>
</aside>

<style>
  aside { display: flex; background: var(--bg-2); border-right: 1px solid var(--line); min-width: 0; height: 100%; }
  .spaces { width: 56px; padding: 10px 0; display: flex; flex-direction: column; align-items: center; gap: 8px; border-right: 1px solid var(--line); }
  .spaces button { width: 38px; height: 38px; border-radius: 12px; background: var(--bg-3); font-weight: 600; font-size: 13px; transition: border-radius .15s, background .15s; }
  .spaces button:hover, .spaces button.on { border-radius: 10px; background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #fff; }
  .list { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 10px 8px; overflow-y: auto; }
  .search { display: flex; justify-content: space-between; padding: 9px 12px; margin-bottom: 8px; border: 1px solid var(--line); border-radius: 8px; color: var(--muted); background: var(--bg); }
  kbd { font-size: 11px; opacity: .7; }
  .head { display: flex; justify-content: space-between; padding: 14px 8px 4px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
  .head button { color: var(--muted); font-size: 16px; padding: 0 4px; }
  .room { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 8px; text-align: left; color: var(--muted); }
  .room:hover { background: var(--bg-3); } .room.active { background: var(--bg-3); color: var(--text); }
  .room.unread { color: var(--text); font-weight: 600; }
  .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hash { opacity: .6; } .av { width: 20px; height: 20px; border-radius: 50%; background: var(--accent); color: #fff; font-size: 9px; display: grid; place-items: center; }
  .badge { background: var(--muted); color: var(--bg); border-radius: 10px; padding: 0 7px; font-size: 11px; } .badge.hl { background: var(--danger); color: #fff; }
  footer { margin-top: auto; display: flex; justify-content: space-between; gap: 8px; padding: 10px 8px 0; font-size: 12px; color: var(--muted); }
  footer span { overflow: hidden; text-overflow: ellipsis; } footer button { color: var(--accent); }
</style>
