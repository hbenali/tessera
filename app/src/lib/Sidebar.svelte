<script lang="ts">
  import { chat, type RoomItem } from './matrix.svelte'
  import { tileBg, ui } from './ui.svelte'
  let { onsearch }: { onsearch: () => void } = $props()

  const groups = $derived.by(() => {
    const rooms = chat.rooms.filter((r) => !r.isSpace && !r.isDM && !r.invited)
    const out: { title: string; rooms: RoomItem[] }[] = []
    for (const s of chat.spaces) {
      const inSpace = rooms.filter((r) => r.parents.includes(s.id))
      if (inSpace.length) out.push({ title: s.name, rooms: inSpace })
    }
    const loose = rooms.filter((r) => !r.parents.some((p) => chat.spaces.some((s) => s.id === p)))
    if (loose.length) out.unshift({ title: 'Rooms', rooms: loose })
    const dms = chat.rooms.filter((r) => r.isDM && !r.invited)
    if (dms.length) out.push({ title: 'People', rooms: dms })
    return out
  })
  const invites = $derived(chat.rooms.filter((r) => r.invited))
  const total = $derived(chat.rooms.reduce((n, r) => n + (r.isSpace || r.invited ? 0 : r.unread), 0))
</script>

<aside>
  <header>
    <span class="word">tessera</span>
    {#if total}<span class="total" title="Unread messages">{total}</span>{/if}
  </header>
  <button class="jump" onclick={onsearch}><span>Jump to…</span><span class="mono">Ctrl K</span></button>

  <nav class="index" aria-label="Rooms">
    {#if invites.length}
      <h2 class="label">Invitations</h2>
      {#each invites as r (r.id)}
        <div class="invite"><span class="name">{r.name}</span>
          <button class="btn" onclick={() => chat.acceptInvite(r.id)}>Accept</button>
          <button class="btn ghost" onclick={() => chat.declineInvite(r.id)}>Decline</button></div>
      {/each}
    {/if}
    {#each groups as g (g.title)}
      <h2 class="label">{g.title}</h2>
      <div class="grid">
        {#each g.rooms as r (r.id)}
          <button class="room" class:active={chat.activeRoom === r.id} style={tileBg(r.name)} onclick={() => chat.openRoom(r.id)} title={r.name}>
            <span class="top">
              {#if r.encrypted}<span class="mono">e2e</span>{:else}<span></span>{/if}
              {#if r.unread}<span class="count" class:hl={r.highlight > 0}>{r.unread}</span>{/if}
            </span>
            <span class="name">{r.name}</span>
          </button>
        {/each}
      </div>
    {/each}
    {#if !groups.length && !invites.length}<p class="empty">No rooms yet. Create or join one below.</p>{/if}
  </nav>

  <footer>
    <button class="btn" onclick={() => (ui.modal = 'new-room')}>New room</button>
    <button class="btn ghost" onclick={() => (ui.modal = 'join-room')}>Join</button>
    <button class="btn ghost" onclick={() => (ui.modal = 'settings')}>Settings</button>
  </footer>
</aside>

<style>
  aside { display: flex; flex-direction: column; min-width: 0; height: 100%; background: var(--panel); }
  header { display: flex; justify-content: space-between; align-items: center; padding: 18px 16px 10px; }
  .word { font: 800 26px/1 var(--display); letter-spacing: -.04em; }
  .total { background: var(--danger); color: var(--ink); font: 700 12px var(--mono); padding: 2px 7px; border-radius: 4px; }
  .jump { display: flex; justify-content: space-between; margin: 4px 12px 6px; padding: 10px 12px; background: var(--tile); border-radius: 6px; color: var(--muted); text-align: left; }
  .jump:hover { color: var(--text); }
  .index { flex: 1; overflow-y: auto; padding: 0 12px 12px; }
  h2 { margin: 16px 2px 8px; font-weight: 500; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
  .room { aspect-ratio: 1.25; display: flex; flex-direction: column; justify-content: space-between; padding: 9px 10px; border-radius: 6px; color: var(--ink); text-align: left; outline-offset: 2px; transition: transform .08s; }
  .room:hover { transform: translateY(-1px); } .room.active { outline: 3px solid var(--text); }
  .top { display: flex; justify-content: space-between; align-items: start; font-size: 10px; opacity: .85; }
  .count { background: var(--ink); color: #fff; font: 700 11px var(--mono); padding: 1px 6px; border-radius: 4px; } .count.hl { background: #fff; color: var(--ink); }
  .name { font: 750 15px/1.1 var(--display); letter-spacing: -.02em; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
  .invite { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 10px; border: 2px dashed var(--accent); border-radius: 6px; margin-bottom: 6px; } .invite .name { flex: 1 0 100%; font-size: 15px; } .invite .btn { padding: 5px 12px; font-size: 13px; }
  .empty { margin: 18px 4px; color: var(--muted); font-size: 13px; }
  footer { display: flex; gap: 6px; padding: 12px; border-top: 1px solid var(--line); } footer .btn { padding: 8px 12px; font-size: 13px; }
</style>
