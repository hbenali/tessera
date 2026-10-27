<script lang="ts">
  import { chat, type RoomItem } from './matrix.svelte'
  import { ui } from './ui.svelte'
  let { onsearch }: { onsearch: () => void } = $props()

  // An index grouped by space; rooms outside any space, then people.
  const groups = $derived.by(() => {
    const rooms = chat.rooms.filter((r) => !r.isSpace && !r.isDM)
    const out: { title: string; rooms: RoomItem[] }[] = []
    for (const s of chat.spaces) {
      const inSpace = rooms.filter((r) => r.parents.includes(s.id))
      if (inSpace.length) out.push({ title: s.name, rooms: inSpace })
    }
    const loose = rooms.filter((r) => !r.parents.some((p) => chat.spaces.some((s) => s.id === p)))
    if (loose.length) out.unshift({ title: 'Rooms', rooms: loose })
    const dms = chat.rooms.filter((r) => r.isDM)
    if (dms.length) out.push({ title: 'People', rooms: dms })
    return out
  })
  const total = $derived(chat.rooms.reduce((n, r) => n + (r.isSpace ? 0 : r.unread), 0))
</script>

<aside>
  <header>
    <span class="word">Tessera</span>
    {#if total}<span class="mono unread-total" title="Unread">{total}</span>{/if}
  </header>
  <button class="jump" onclick={onsearch}><span>Jump to</span><span class="mono">Ctrl K</span></button>

  <nav class="index" aria-label="Rooms">
    {#each groups as g (g.title)}
      <h2 class="label">{g.title}</h2>
      {#each g.rooms as r (r.id)}
        <button class="room" class:active={chat.activeRoom === r.id} class:unread={r.unread > 0} onclick={() => chat.openRoom(r.id)}>
          <span class="name">{r.name}</span>
          {#if r.encrypted}<span class="mono dim" title="End-to-end encrypted">e2e</span>{/if}
          {#if r.unread}<span class="mono count" class:hl={r.highlight > 0}>{r.unread}</span>{/if}
        </button>
      {/each}
    {/each}
    {#if !groups.length}<p class="empty">No rooms yet. Create or join one below.</p>{/if}
  </nav>

  <footer>
    <button class="link" onclick={() => (ui.modal = 'new-room')}>New room</button>
    <button class="link" onclick={() => (ui.modal = 'join-room')}>Join</button>
    <button class="link" onclick={() => (ui.modal = 'settings')}>Settings</button>
  </footer>
</aside>

<style>
  aside { display: flex; flex-direction: column; min-width: 0; height: 100%; border-right: 1px solid var(--line); }
  header { display: flex; justify-content: space-between; align-items: baseline; padding: 18px 18px 12px; }
  .word { font: 400 24px/1 var(--serif); letter-spacing: -.01em; }
  .unread-total { background: var(--accent); color: var(--accent-ink); padding: 1px 6px; }
  .jump { display: flex; justify-content: space-between; margin: 0 18px 8px; padding: 8px 0; border-bottom: 1px solid var(--line); border-top: 1px solid var(--line); color: var(--muted); text-align: left; }
  .jump:hover { color: var(--text); }
  .index { flex: 1; overflow-y: auto; padding-bottom: 12px; }
  h2 { margin: 18px 18px 4px; font-weight: 400; }
  .room { display: flex; align-items: baseline; gap: 8px; width: 100%; padding: 5px 18px; text-align: left; color: var(--muted); border-left: 3px solid transparent; }
  .room:hover { color: var(--text); } .room.active { color: var(--text); border-left-color: var(--text); background: var(--tile); }
  .room.unread { color: var(--text); font-weight: 650; }
  .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dim { color: var(--muted); font-weight: 400; } .count { padding: 0 5px; border: 1px solid var(--text); } .count.hl { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
  .empty { margin: 18px; color: var(--muted); font-size: 13px; }
  footer { display: flex; gap: 16px; padding: 12px 18px; border-top: 1px solid var(--line); font-size: 13px; color: var(--muted); }
</style>
