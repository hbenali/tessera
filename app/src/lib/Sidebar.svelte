<script lang="ts">
  import { chat } from './matrix.svelte'
  import { shortTime, ui } from './ui.svelte'
  import Avatar from './Avatar.svelte'
  import Icon from './Icon.svelte'
  let { onsearch }: { onsearch: () => void } = $props()

  let filter = $state<'all' | 'unread' | 'people'>('all')
  let switcher = $state(false)

  const invites = $derived(chat.rooms.filter((r) => r.invited))
  const current = $derived(chat.spaces.find((s) => s.id === chat.activeSpace))
  const rooms = $derived(
    chat.rooms
      .filter((r) => !r.isSpace && !r.invited)
      .filter((r) => !chat.activeSpace || r.parents.includes(chat.activeSpace))
      .filter((r) => (filter === 'unread' ? r.unread > 0 : filter === 'people' ? r.isDM : true)),
  )
  const total = $derived(chat.rooms.reduce((n, r) => n + (r.isSpace || r.invited ? 0 : r.unread), 0))
  const pick = (id: string | null) => { chat.activeSpace = id; switcher = false }
</script>

<aside aria-label="Conversations">
  <header>
    <div class="ws">
      <button class="switch" onclick={() => (switcher = !switcher)} aria-expanded={switcher} aria-haspopup="listbox">
        <Avatar name={current?.name ?? 'Tessera'} size={26} />
        <span class="wsname">{current?.name ?? 'All rooms'}</span>
        <Icon name="chevron" size={14} />
      </button>
      {#if switcher}
        <div class="menu" role="listbox">
          <button role="option" aria-selected={!chat.activeSpace} onclick={() => pick(null)}>All rooms{#if !chat.activeSpace}<Icon name="check" size={14} />{/if}</button>
          {#each chat.spaces as s (s.id)}
            <button role="option" aria-selected={chat.activeSpace === s.id} onclick={() => pick(s.id)}><Avatar name={s.name} size={20} />{s.name}{#if chat.activeSpace === s.id}<Icon name="check" size={14} />{/if}</button>
          {/each}
        </div>
      {/if}
    </div>
    <button class="icon-btn" onclick={() => ui.open('room')} aria-label="New room or message" title="New room or message"><Icon name="plus" /></button>
  </header>

  <button class="search" onclick={onsearch}><Icon name="search" size={15} /><span>Search</span><kbd class="mono">Ctrl K</kbd></button>

  <div class="seg" role="tablist" aria-label="Filter rooms">
    {#each [['all', 'All'], ['unread', total ? `Unread ${total}` : 'Unread'], ['people', 'People']] as [k, label] (k)}
      <button role="tab" aria-selected={filter === k} class:on={filter === k} onclick={() => (filter = k as typeof filter)}>{label}</button>
    {/each}
  </div>

  <nav class="list" aria-label="Rooms">
    {#each invites as r (r.id)}
      <div class="invite">
        <Avatar name={r.name} size={36} />
        <div class="meta"><b>{r.name}</b><span>Invitation</span></div>
        <button class="btn" onclick={() => chat.acceptInvite(r.id)}>Join</button>
        <button class="icon-btn" onclick={() => chat.declineInvite(r.id)} aria-label="Decline invitation"><Icon name="x" size={16} /></button>
      </div>
    {/each}
    {#each rooms as r (r.id)}
      <button class="row" class:active={chat.activeRoom === r.id} class:unread={r.unread > 0} onclick={() => chat.openRoom(r.id)}>
        <Avatar name={r.name} size={38} round={r.isDM} />
        <span class="body">
          <span class="top">
            <span class="name">{r.name}</span>
            {#if r.encrypted}<span class="lock" title="End-to-end encrypted"><Icon name="lock" size={12} /></span>{/if}
            <span class="time">{r.lastTs ? shortTime(r.lastTs) : ''}</span>
          </span>
          <span class="bottom">
            <span class="preview">{r.preview || (r.topic ? r.topic : 'No messages yet')}</span>
            {#if r.unread}<span class="badge" class:hl={r.highlight > 0}>{r.unread}</span>{/if}
          </span>
        </span>
      </button>
    {/each}
    {#if !rooms.length && !invites.length}
      <p class="empty">{filter === 'unread' ? 'You are all caught up.' : 'No rooms here yet.'}</p>
    {/if}
  </nav>

  <footer>
    <button class="me" onclick={() => (ui.modal = 'settings')}><Avatar name={chat.userId.replace('@', '')} size={28} round /><span>{chat.userId}</span></button>
    <button class="icon-btn" onclick={() => ui.open('join')} aria-label="Join a room by address" title="Join a room"><Icon name="hash" /></button>
    <button class="icon-btn" onclick={() => (ui.modal = 'settings')} aria-label="Settings" title="Settings"><Icon name="sliders" /></button>
  </footer>
</aside>

<style>
  aside { display: flex; flex-direction: column; min-width: 0; height: 100%; background: var(--panel); border-right: 1px solid var(--line); }
  header { display: flex; align-items: center; justify-content: space-between; padding: 12px 12px 8px; }
  .ws { position: relative; min-width: 0; }
  .switch { display: flex; align-items: center; gap: 8px; padding: 4px 8px 4px 4px; border-radius: 8px; max-width: 100%; } .switch:hover { background: var(--tile); }
  .wsname { font-weight: 700; font-size: 15px; letter-spacing: -.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .menu { position: absolute; z-index: 5; top: calc(100% + 6px); left: 0; min-width: 220px; padding: 6px; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow); }
  .menu button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 8px; border-radius: 6px; text-align: left; } .menu button:hover { background: var(--tile); } .menu :global(svg:last-child) { margin-left: auto; color: var(--accent); }
  .search { display: flex; align-items: center; gap: 8px; margin: 0 12px 8px; padding: 8px 10px; border-radius: 8px; background: var(--tile); color: var(--muted); } .search:hover { color: var(--text); }
  .search span { flex: 1; text-align: left; } kbd { font-size: 11px; }
  .seg { display: flex; gap: 2px; margin: 0 12px 6px; padding: 2px; background: var(--tile); border-radius: 8px; }
  .seg button { flex: 1; padding: 5px 6px; border-radius: 6px; font-size: 12px; font-weight: 500; color: var(--muted); } .seg .on { background: var(--bg); color: var(--text); box-shadow: 0 1px 2px rgb(0 0 0 / .18); }
  .list { flex: 1; overflow-y: auto; padding: 0 6px 8px; }
  .row { display: flex; gap: 10px; width: 100%; padding: 8px; border-radius: 10px; text-align: left; align-items: center; } .row:hover { background: var(--tile); } .row.active { background: var(--tile); box-shadow: inset 2px 0 0 var(--accent); }
  .body { flex: 1; min-width: 0; display: grid; gap: 1px; }
  .top, .bottom { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; } .unread .name { font-weight: 700; }
  .lock { color: var(--muted); display: grid; } .time { color: var(--muted); font-size: 11px; flex: none; } .unread .time { color: var(--accent); }
  .preview { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 13px; } .unread .preview { color: var(--text); }
  .badge { flex: none; min-width: 20px; padding: 0 6px; border-radius: 10px; background: var(--muted); color: var(--bg); font-size: 11px; font-weight: 700; text-align: center; line-height: 20px; } .badge.hl { background: var(--accent); color: var(--accent-ink); }
  .invite { display: flex; align-items: center; gap: 10px; padding: 8px; margin: 0 0 4px; border-radius: 10px; border: 1px dashed var(--accent); } .invite .meta { flex: 1; display: grid; min-width: 0; } .invite .meta span { color: var(--muted); font-size: 12px; } .invite .btn { padding: 5px 12px; }
  .empty { padding: 24px 12px; color: var(--muted); text-align: center; }
  footer { display: flex; align-items: center; gap: 2px; padding: 8px 10px; border-top: 1px solid var(--line); }
  .me { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 4px; border-radius: 8px; text-align: left; color: var(--muted); } .me:hover { background: var(--tile); color: var(--text); } .me span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
</style>
