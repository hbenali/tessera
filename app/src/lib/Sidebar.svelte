<script lang="ts">
  import { chat } from './matrix.svelte'
  import { initials, tile, ui } from './ui.svelte'
  let { onsearch }: { onsearch: () => void } = $props()
  const dms = $derived(chat.visibleRooms.filter((r) => r.isDM))
  const channels = $derived(chat.visibleRooms.filter((r) => !r.isDM))
  const total = $derived(chat.rooms.reduce((n, r) => n + (r.isSpace ? 0 : r.unread), 0))
</script>

<aside>
  <header>
    <div class="brand"><span class="mark">◆</span> Tessera {#if total}<span class="pill">{total}</span>{/if}</div>
    <button onclick={() => (ui.modal = 'settings')} aria-label="Settings" title="Settings">⚙</button>
  </header>

  <nav class="spaces" aria-label="Spaces">
    <button class:on={!chat.activeSpace} onclick={() => (chat.activeSpace = null)}>All</button>
    {#each chat.spaces as s (s.id)}
      <button class:on={chat.activeSpace === s.id} onclick={() => (chat.activeSpace = s.id)}>{s.name}</button>
    {/each}
  </nav>

  <button class="search" onclick={onsearch}>Jump to… <kbd>Ctrl K</kbd></button>

  <div class="list">
    <div class="head"><span>Rooms</span>
      <span><button onclick={() => (ui.modal = 'join-room')} title="Join a room" aria-label="Join a room">⎆</button><button onclick={() => (ui.modal = 'new-room')} title="New room" aria-label="New room">＋</button></span></div>
    {#each channels as r (r.id)}
      <button class="room" class:active={chat.activeRoom === r.id} class:unread={r.unread > 0} onclick={() => chat.openRoom(r.id)}>
        <span class="tile" style={tile(r.name)}>{initials(r.name)}</span>
        <span class="name">{r.name}</span>
        {#if r.encrypted}<span class="lock" title="Encrypted">🔒</span>{/if}
        {#if r.unread}<span class="badge" class:hl={r.highlight > 0}>{r.unread}</span>{/if}
      </button>
    {/each}
    {#if dms.length}<div class="head"><span>People</span></div>{/if}
    {#each dms as r (r.id)}
      <button class="room" class:active={chat.activeRoom === r.id} class:unread={r.unread > 0} onclick={() => chat.openRoom(r.id)}>
        <span class="tile round" style={tile(r.name)}>{initials(r.name)}</span>
        <span class="name">{r.name}</span>
        {#if r.unread}<span class="badge hl">{r.unread}</span>{/if}
      </button>
    {/each}
  </div>
</aside>

<style>
  aside { display: flex; flex-direction: column; gap: 10px; min-width: 0; height: 100%; padding: 14px 10px; background: var(--panel); border: 1px solid var(--line); border-radius: 22px; }
  header { display: flex; justify-content: space-between; align-items: center; padding: 0 6px; }
  .brand { font-weight: 700; letter-spacing: -.01em; display: flex; gap: 8px; align-items: center; } .mark { color: var(--accent); }
  header button { color: var(--muted); font-size: 18px; padding: 4px; }
  .pill { background: var(--accent); color: #1a1208; border-radius: 999px; padding: 0 8px; font-size: 11px; font-weight: 700; }
  .spaces { display: flex; gap: 6px; overflow-x: auto; padding: 2px 4px 6px; scrollbar-width: none; }
  .spaces button { flex: none; padding: 5px 12px; border-radius: 999px; background: var(--tile); color: var(--muted); font-size: 13px; }
  .spaces button.on { background: var(--accent); color: #1a1208; font-weight: 600; }
  .search { display: flex; justify-content: space-between; padding: 10px 14px; border-radius: 14px; color: var(--muted); background: var(--tile); }
  kbd { font-size: 11px; opacity: .7; }
  .list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
  .head { display: flex; justify-content: space-between; padding: 12px 10px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
  .head button { color: var(--muted); font-size: 16px; padding: 0 4px; }
  .room { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 14px; text-align: left; color: var(--muted); }
  .room:hover { background: var(--tile); } .room.active { background: var(--tile); color: var(--text); box-shadow: inset 3px 0 0 var(--accent); }
  .room.unread { color: var(--text); font-weight: 600; }
  .tile { flex: none; width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; color: #fff; font-size: 11px; font-weight: 700; } .tile.round { border-radius: 50%; }
  .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .lock { font-size: 10px; opacity: .6; }
  .badge { background: var(--muted); color: var(--bg); border-radius: 999px; padding: 0 7px; font-size: 11px; } .badge.hl { background: var(--accent); color: #1a1208; font-weight: 700; }
</style>
