<script lang="ts">
  import { chat, type MessageHit } from './matrix.svelte'
  import { highlight } from './highlight'
  import { ui } from './ui.svelte'
  import Avatar from './Avatar.svelte'
  import Icon from './Icon.svelte'

  const room = $derived(chat.active)
  let q = $state(ui.lastSearch.room === chat.activeRoom ? ui.lastSearch.term : '')
  let remote = $state<MessageHit[]>([])
  let next = $state<string | undefined>()
  let searching = $state(false)
  let more = $state(false)
  let failed = $state(false)
  let token = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  // Simple by default: just the box. Advanced adds filters, and is remembered on this device.
  let adv = $state(read('tessera.searchAdvanced') === '1')
  let from = $state('') // a sender's Matrix id, or any
  let after = $state('') // YYYY-MM-DD
  let before = $state('')
  let has = $state<'any' | 'link' | 'image' | 'file'>('any')
  let mine = $state(false) // only messages that mention me
  function read(k: string) { try { return localStorage.getItem(k) } catch { return null } }
  function toggleAdv() {
    adv = !adv
    try { localStorage.setItem('tessera.searchAdvanced', adv ? '1' : '0') } catch { /* not remembered */ }
  }
  const active = $derived(adv && (!!from || !!after || !!before || has !== 'any' || mine))
  function reset() { from = after = before = ''; has = 'any'; mine = false }

  const term = $derived(q.trim())
  const day = 86_400_000
  const keep = (h: MessageHit) => {
    if (!adv) return true
    if (from && h.senderId !== from) return false
    if (after && h.ts < new Date(`${after}T00:00:00`).getTime()) return false
    if (before && h.ts >= new Date(`${before}T00:00:00`).getTime() + day) return false
    if (has === 'link' && !h.link) return false
    if ((has === 'image' || has === 'file') && h.kind !== has) return false
    if (mine && !h.mentionsMe) return false
    return true
  }
  // Messages already on this device (the only ones for an encrypted room), then older ones from the server.
  const hits = $derived.by(() => {
    if (!room || term.length < 2) return []
    const local = chat.searchMessages(term, 200, room.id)
    const seen = new Set(local.map((h) => h.eventId))
    return [...local, ...remote.filter((h) => !seen.has(h.eventId))].filter(keep).sort((a, b) => b.ts - a.ts)
  })
  // What the server can narrow itself: a sender, and media. The rest is filtered here.
  const serverOpts = $derived(adv ? { sender: from || undefined, media: has === 'image' || has === 'file' } : {})

  // A new term or room starts over; the server is asked a beat after typing stops.
  $effect(() => {
    const id = room?.id
    const t = term
    const opts = serverOpts
    clearTimeout(timer)
    remote = []
    next = undefined
    failed = false
    if (!id || t.length < 2 || room?.encrypted) { searching = false; return }
    searching = true
    const ticket = ++token
    timer = setTimeout(async () => {
      try {
        const r = await chat.searchRoom(id, t, undefined, opts)
        if (ticket === token) { remote = r.hits; next = r.next }
      } catch {
        if (ticket === token) failed = true
      } finally {
        if (ticket === token) searching = false
      }
    }, 300)
    return () => clearTimeout(timer)
  })
  // Another room starts with a clean box, but reopening this room's panel restores what was searched.
  let seenRoom: string | undefined
  let first = true
  $effect(() => {
    const id = room?.id
    if (first) { first = false; seenRoom = id; return } // the first run keeps what was restored
    if (id !== seenRoom) { seenRoom = id; q = ''; reset() }
  })
  $effect(() => { if (room) ui.lastSearch = { room: room.id, term: q } })

  async function loadMore() {
    if (!room || !next || more) return
    more = true
    const ticket = token
    try {
      const r = await chat.searchRoom(room.id, term, next, serverOpts)
      if (ticket === token) { remote = [...remote, ...r.hits]; next = r.next }
    } catch {
      failed = true
    } finally {
      more = false
    }
  }

  const when = (ts: number) => {
    const d = new Date(ts)
    return d.toDateString() === new Date().toDateString()
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
  }
  // On a phone the panel covers the room, so picking a result closes it to show the message; on a wide screen it stays
  // open beside the room so you can step through the results.
  function pick(h: MessageHit) {
    chat.openMessage(h)
    if (matchMedia('(max-width: 720px)').matches) ui.roomSearch = false
  }
  const focus = (n: HTMLElement) => n.focus()
</script>

{#if room}
  <aside aria-label="Search in {room.name}">
    <header>
      <h2>Search</h2>
      <button class="icon-btn" onclick={() => (ui.roomSearch = false)} aria-label="Close search"><Icon name="x" /></button>
    </header>
    <div class="field">
      <Icon name="search" size={15} />
      <input use:focus bind:value={q} onkeydown={(e) => e.key === 'Escape' && (ui.roomSearch = false)} placeholder="Search in {room.name}" aria-label="Search messages in {room.name}" />
      {#if q}<button class="icon-btn" onclick={() => (q = '')} aria-label="Clear search"><Icon name="x" size={14} /></button>{/if}
    </div>

    <button class="advtoggle" aria-expanded={adv} onclick={toggleAdv}>{adv ? 'Simple search' : 'Advanced'}{#if active} <span class="dot" title="Filters are on"></span><span class="sr">Filters are on</span>{/if}</button>
    {#if adv}
      <div class="filters">
        <label>From
          <select bind:value={from}>
            <option value="">Anyone</option>
            {#each chat.members as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
          </select>
        </label>
        <label>Has
          <select bind:value={has}>
            <option value="any">Anything</option>
            <option value="link">A link</option>
            <option value="image">An image</option>
            <option value="file">A file</option>
          </select>
        </label>
        <label>After<input type="date" bind:value={after} max={before || undefined} /></label>
        <label>Before<input type="date" bind:value={before} min={after || undefined} /></label>
        <label class="chk"><input type="checkbox" bind:checked={mine} /> Mentions me</label>
        {#if active}<button class="reset" onclick={reset}>Clear filters</button>{/if}
      </div>
    {/if}

    <div class="results" role="list" aria-label="Results">
      {#each hits as h (h.eventId)}
        <div role="listitem">
          <button class="hit" onclick={() => pick(h)}>
            <Avatar name={h.sender} size={26} round />
            <span class="body">
              <span class="top"><b>{h.sender}</b><time>{when(h.ts)}</time></span>
              <span class="snip">{#each highlight(h.snippet, term) as p, i (i)}{#if p.hit}<mark>{p.text}</mark>{:else}{p.text}{/if}{/each}</span>
            </span>
          </button>
        </div>
      {/each}
      {#if next && hits.length}
        <button class="more" onclick={loadMore} disabled={more}>{more ? 'Loading…' : 'Load more'}</button>
      {/if}
    </div>

    <p class="status" role="status">
      {#if term.length < 2}Type at least two letters.
      {:else if searching}Searching…
      {:else if !hits.length}{active ? 'Nothing matches these filters.' : 'Nothing found in this room.'}
      {:else}{hits.length} {hits.length === 1 ? 'message' : 'messages'}{next ? ' so far' : ''}.{/if}
      {#if failed} The server search failed; showing what this device has.{/if}
    </p>
    {#if room.encrypted}<p class="fine">This room is encrypted, so the server cannot search it. Only messages already loaded on this device are searched; scroll up in the room to load more history.</p>{/if}
  </aside>
{/if}

<style>
  aside { height: 100%; display: flex; flex-direction: column; overflow: hidden; min-height: 0; background: var(--panel); border-left: 1px solid var(--line); padding: 0 12px 12px; }
  header { display: flex; justify-content: space-between; align-items: center; height: 56px; flex: none; } h2 { margin: 0; font-size: 15px; }
  .field { display: flex; align-items: center; gap: 8px; flex: none; padding: 0 10px; border-radius: 8px; background: var(--tile); color: var(--muted); }
  .field input { flex: 1; min-width: 0; border: 0; background: none; padding: 10px 0; color: var(--text); font-size: 14px; } .field input:focus { border: 0; }
  .results { flex: 1; min-height: 0; overflow-y: auto; margin-top: 8px; }
  .advtoggle { align-self: flex-start; margin: 8px 0 0; padding: 2px 4px; font-size: 12px; color: var(--accent); text-decoration: underline; display: inline-flex; align-items: center; gap: 6px; } .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .filters { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 10px; margin: 8px 0 2px; padding: 10px; border-radius: 8px; background: var(--tile); flex: none; }
  .filters label { display: grid; gap: 3px; font-size: 11px; color: var(--muted); min-width: 0; } .filters .chk { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); }
  .filters select, .filters input[type=date] { font: inherit; font-size: 13px; color: var(--text); background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 5px 6px; min-width: 0; width: 100%; }
  .reset { grid-column: 1 / -1; justify-self: start; font-size: 12px; color: var(--accent); text-decoration: underline; }
  .hit { display: flex; gap: 10px; width: 100%; padding: 8px 6px; border-radius: 8px; text-align: left; align-items: flex-start; } .hit:hover, .hit:focus-visible { background: var(--tile); }
  .body { flex: 1; min-width: 0; display: grid; gap: 1px; }
  .top { display: flex; gap: 8px; align-items: baseline; } .top b { font-weight: 650; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .top time { margin-left: auto; color: var(--muted); font-size: 11px; flex: none; }
  .snip { font-size: 13px; color: var(--text); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  mark { background: color-mix(in srgb, var(--accent) 35%, transparent); color: inherit; border-radius: 3px; padding: 0 1px; }
  .more { display: block; margin: 8px auto; padding: 6px 14px; border-radius: 8px; background: var(--tile); font-size: 13px; }
  .status { flex: none; margin: 8px 2px 0; color: var(--muted); font-size: 12px; } .fine { flex: none; margin: 4px 2px 0; color: var(--muted); font-size: 12px; }
</style>
