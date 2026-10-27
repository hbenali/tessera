<script lang="ts">
  import { tick } from 'svelte'
  import { chat, type Msg } from './matrix.svelte'
  import { render } from './markdown'
  import { dayLabel, ui } from './ui.svelte'
  import Avatar from './Avatar.svelte'
  import Photo from './Photo.svelte'
  import { getDraft, setDraft } from './drafts'
  import Icon from './Icon.svelte'
  import EmojiPicker from './EmojiPicker.svelte'

  let text = $state('')
  let replyTo = $state<Msg | null>(null)
  let editing = $state<Msg | null>(null)
  let notice = $state('')
  let picker = $state<string | null>(null) // message id, or 'composer'
  let scroller: HTMLElement | undefined = $state()
  let fileInput: HTMLInputElement | undefined = $state()
  let stick = true
  let pins = $state(false) // pinned list open
  let away = $state(false) // scrolled up from the newest message
  let typingTimer: ReturnType<typeof setTimeout> | undefined

  const QUICK = ['👍', '❤️', '😂', '🎉']
  const fmt = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const byId = (id?: string) => chat.messages.find((m) => m.id === id)

  // Consecutive messages from one sender within 5 minutes share a header; a new day gets a divider.
  const rows = $derived(
    chat.messages.map((m, i) => {
      const p = chat.messages[i - 1]
      const newDay = !p || new Date(p.ts).toDateString() !== new Date(m.ts).toDateString()
      return { m, newDay, cont: !newDay && p.sender === m.sender && m.ts - p.ts < 300_000 && !m.replyTo }
    }),
  )

  $effect(() => {
    chat.messages.length
    if (stick) tick().then(() => scroller?.scrollTo({ top: scroller.scrollHeight }))
  })
  // Jump to a message chosen from search, and flash it so the eye can find it.
  $effect(() => {
    const id = chat.focusEvent
    chat.messages.length
    if (!id || !scroller) return
    tick().then(() => {
      const el = scroller?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)
      if (!el) return
      stick = false
      el.scrollIntoView({ block: 'center' })
      el.classList.add('flash')
      setTimeout(() => el.classList.remove('flash'), 1800)
      chat.focusEvent = null
    })
  })
  let textRoom: string | null = null // the room `text` belongs to
  $effect(() => {
    const id = chat.activeRoom
    stick = true
    replyTo = editing = null
    picker = null
    notice = ''
    textRoom = id
    text = id ? getDraft(id) : ''
  })
  $effect(() => {
    const t = text
    if (textRoom && textRoom === chat.activeRoom && !editing) setDraft(textRoom, t, !chat.active?.encrypted)
  })

  // Many of a room's newest events are not shown (reactions, joins, edits), so the first window can hold too few
  // messages to fill the screen. Then there is nothing to scroll and nothing would ever trigger loading, so
  // keep paging back until the list can scroll or the start of the room is reached.
  let filling = false
  async function fill() {
    if (filling) return
    filling = true
    try {
      for (let i = 0; i < 12; i++) {
        await tick()
        if (!scroller || scroller.scrollHeight > scroller.clientHeight + 40 || !chat.hasOlder() || chat.loadingOlder) return
        await chat.loadOlder()
        await new Promise((r) => setTimeout(r, 200)) // let the new events reach the list
      }
    } finally {
      filling = false
    }
  }
  $effect(() => {
    chat.activeRoom
    chat.messages.length
    fill()
  })
  // Load when the top of the list comes near the viewport. A scroll event is not enough: at scrollTop 0
  // scrolling up changes nothing, so no event fires, but an observer still reports the top as visible.
  let topEl: HTMLElement | undefined = $state()
  async function loadEarlier() {
    if (!scroller || chat.loadingOlder || !chat.hasOlder()) return
    const h = scroller.scrollHeight
    await chat.loadOlder()
    await tick()
    if (scroller) scroller.scrollTop += scroller.scrollHeight - h // keep the reader's place
  }
  $effect(() => {
    if (!topEl || !scroller) return
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && loadEarlier(), { root: scroller, rootMargin: '300px 0px 0px 0px' })
    io.observe(topEl)
    return () => io.disconnect()
  })
  // Scrolling up while already at the top fires no scroll event; the wheel and touch-drag still do.
  $effect(() => {
    const el = scroller
    if (!el) return
    const wheel = (e: WheelEvent) => { if (e.deltaY < 0 && el.scrollTop < 40) loadEarlier() }
    const touch = () => { if (el.scrollTop < 40) loadEarlier() }
    el.addEventListener('wheel', wheel, { passive: true })
    el.addEventListener('touchmove', touch, { passive: true })
    return () => { el.removeEventListener('wheel', wheel); el.removeEventListener('touchmove', touch) }
  })

  function onscroll() {
    if (!scroller) return
    stick = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80
    away = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight > 400
    if (scroller.scrollTop < 40 && !chat.loadingOlder && chat.hasOlder()) {
      const h = scroller.scrollHeight
      // Keep the reader's place: add only the height that was loaded above, never jump to a fixed position.
      chat.loadOlder().then(() => tick().then(() => scroller && (scroller.scrollTop += scroller.scrollHeight - h)))
    }
  }

  async function submit() {
    const body = text
    if (!body.trim()) return
    text = ''
    notice = ''
    const cmd = body.match(/^\/invite\s+(@\S+)\s*$/)
    if (cmd) {
      await chat.invite(cmd[1]).catch((e) => (notice = String(e.message ?? e)))
    } else if (editing) {
      await chat.edit(editing.id, body)
      editing = null
    } else {
      await chat.send(body, replyTo?.id)
      replyTo = null
    }
    chat.setTyping(false)
  }
  // @-mention autocomplete: the word being typed, if it starts with @ at a word boundary.
  let area: HTMLTextAreaElement | undefined = $state()
  let caret = $state(0)
  let sel = $state(0)
  const query = $derived.by(() => {
    const m = /(?:^|\s)@([^\s@]*)$/.exec(text.slice(0, caret))
    return m ? m[1].toLowerCase() : null
  })
  const suggestions = $derived(
    query === null
      ? []
      : chat.members.filter((u) => u.id !== chat.userId && (u.name.toLowerCase().includes(query) || u.id.toLowerCase().includes(query))).slice(0, 6),
  )
  $effect(() => { suggestions; sel = 0 })
  function complete(u: { id: string }) {
    const before = text.slice(0, caret).replace(/@[^\s@]*$/, `${u.id} `)
    text = before + text.slice(caret)
    caret = before.length
    tick().then(() => { area?.focus(); area?.setSelectionRange(caret, caret) })
  }
  function keydown(e: KeyboardEvent) {
    if (suggestions.length && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
      e.preventDefault()
      if (e.key === 'ArrowDown') sel = (sel + 1) % suggestions.length
      else if (e.key === 'ArrowUp') sel = (sel + suggestions.length - 1) % suggestions.length
      else if (e.key === 'Escape') caret = 0
      else complete(suggestions[sel])
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
    else if (e.key === 'Escape') { replyTo = editing = null }
    else if (e.key === 'ArrowUp' && !text) {
      const mine = [...chat.messages].reverse().find((m) => m.mine && !m.pending)
      if (mine) { editing = mine; text = mine.body }
    } else {
      chat.setTyping(true)
      clearTimeout(typingTimer)
      typingTimer = setTimeout(() => chat.setTyping(false), 4000)
    }
  }
  function paste(e: ClipboardEvent) {
    const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
    if (!file) return
    e.preventDefault()
    chat.upload(file).catch((x) => (notice = String(x.message ?? x)))
  }
  function pick(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0]
    if (f) chat.upload(f)
    ;(e.target as HTMLInputElement).value = ''
  }
  function drop(e: DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer?.files[0]
    if (f) chat.upload(f)
  }
</script>

<main class="main" ondragover={(e) => e.preventDefault()} ondrop={drop}>
  {#if !chat.active}
    <div class="empty"><Icon name="hash" size={40} /><h1>Select a conversation</h1><p>Choose a room on the left, or press <kbd class="mono">Ctrl K</kbd> to jump.</p></div>
  {:else}
    <header>
      <button class="icon-btn back" onclick={() => (chat.activeRoom = null)} aria-label="Back to rooms"><Icon name="back" /></button>
      <Avatar name={chat.active.name} size={32} round={chat.active.isDM} src={chat.active.avatar} />
      <div class="title"><h1>{chat.active.name}</h1>{#if chat.active.topic}<span class="topic">{chat.active.topic}</span>{:else}<span class="topic">{chat.active.memberCount} {chat.active.memberCount === 1 ? 'member' : 'members'}</span>{/if}</div>
      {#if chat.active.encrypted}<span class="enc" title="End-to-end encrypted"><Icon name="lock" size={13} /> Encrypted</span>{/if}
      <button class="icon-btn" class:on={ui.details} onclick={() => (ui.details = !ui.details)} aria-label="Room details" aria-pressed={ui.details}><Icon name="info" /></button>
    </header>

    {#if chat.pinned.length}
      <div class="pinbar">
        <button class="pin-main" onclick={() => { const p = chat.pinned.at(-1)!; chat.focusEvent = p.id }} title="Jump to pinned message">
          <Icon name="pin" size={14} /><b>{chat.pinned.at(-1)!.sender}</b><span>{chat.pinned.at(-1)!.body}</span>
        </button>
        {#if chat.pinned.length > 1}<button class="pin-count" aria-expanded={pins} onclick={() => (pins = !pins)}>{chat.pinned.length} pinned</button>{/if}
        {#if pins}
          <ul class="pinlist" aria-label="Pinned messages">
            {#each [...chat.pinned].reverse() as p (p.id)}
              <li><button onclick={() => { chat.focusEvent = p.id; pins = false }}><b>{p.sender}</b><span>{p.body}</span></button>{#if chat.canPin}<button class="icon-btn" onclick={() => chat.togglePin(p.id)} aria-label="Unpin message from {p.sender}"><Icon name="x" size={14} /></button>{/if}</li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
    {#if away}<button class="latest" onclick={() => { stick = true; scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' }) }}><Icon name="chevron" size={14} /> Jump to latest</button>{/if}
    <div class="scroll" bind:this={scroller} {onscroll} onloadcapture={() => stick && scroller?.scrollTo({ top: scroller.scrollHeight })}>
      {#if chat.loadingOlder}<div class="note">Loading earlier messages…</div>{/if}
      {#if chat.olderAvailable}
        <div class="sentinel" bind:this={topEl} role="status">{chat.loadingOlder ? 'Loading earlier messages…' : ''}</div>
      {:else if rows.length}
        <p class="start">This is the beginning of the conversation.</p>
      {/if}
      {#each rows as { m, newDay, cont } (m.id)}
        {#if newDay}<div class="day" role="separator"><span>{dayLabel(m.ts)}</span></div>{/if}
        <article class:cont class:pending={m.pending} class:active={picker === m.id} class:mention={m.mentionsMe} data-id={m.id}>
          <div class="gutter">
            {#if !cont}<Avatar name={m.senderName} size={36} round src={m.senderAvatar} />{:else}<time>{fmt(m.ts)}</time>{/if}
          </div>
          <div class="body">
            {#if !cont}<div class="head"><b>{m.senderName}</b><time>{fmt(m.ts)}</time>{#if m.pinned}<span class="pinned" title="Pinned"><Icon name="pin" size={12} /> Pinned</span>{/if}</div>{/if}
            {#if m.replyTo}<div class="quote"><Icon name="reply" size={12} /> <b>{byId(m.replyTo)?.senderName ?? ''}</b> {byId(m.replyTo)?.body ?? 'earlier message'}</div>{/if}
            {#if m.imageMxc}<Photo mxc={m.imageMxc} alt={m.body} />{:else}<div class="text" class:utd={m.undecryptable}>{@html render(m.body, { name: chat.nameOf, me: chat.userId })}{#if m.edited}<span class="edited"> (edited)</span>{/if}</div>{/if}
            {#if m.threadReplies}<button class="thread-link" onclick={() => chat.openThread(m.id)}><Icon name="thread" size={13} /> {m.threadReplies} {m.threadReplies === 1 ? 'reply' : 'replies'}</button>{/if}
            {#if m.seenBy?.length}<div class="seen" title="Seen by {m.seenBy.map((s) => s.name).join(', ')}">{#each m.seenBy.slice(0, 5) as s (s.name)}<Avatar name={s.name} size={14} round src={s.avatar} />{/each}<span>Seen{m.seenBy.length > 5 ? ` by ${m.seenBy.length}` : ''}</span></div>{/if}
            {#if Object.keys(m.reactions).length}
              <div class="reacts">{#each Object.entries(m.reactions) as [k, n] (k)}<button onclick={() => chat.react(m.id, k)} aria-label="{k} {n}, add your reaction"><span>{k}</span> {n}</button>{/each}</div>
            {/if}
          </div>
          <div class="tools">
            {#each QUICK as e (e)}<button class="icon-btn" onclick={() => chat.react(m.id, e)} aria-label="React {e}">{e}</button>{/each}
            <span class="pw"><button class="icon-btn" onclick={() => (picker = picker === m.id ? null : m.id)} aria-label="More reactions"><Icon name="smile" size={16} /></button>
              {#if picker === m.id}<EmojiPicker onpick={(e) => chat.react(m.id, e)} onclose={() => (picker = null)} />{/if}</span>
            <button class="icon-btn" onclick={() => { replyTo = m; editing = null }} aria-label="Reply"><Icon name="reply" size={16} /></button>
            {#if chat.canPin}<button class="icon-btn" onclick={() => chat.togglePin(m.id)} aria-label={m.pinned ? 'Unpin message' : 'Pin message'} aria-pressed={m.pinned}><Icon name="pin" size={16} /></button>{/if}
            <button class="icon-btn" onclick={() => chat.openThread(m.id)} aria-label="Reply in thread"><Icon name="thread" size={16} /></button>
            {#if m.mine && !m.undecryptable}<button class="icon-btn" onclick={() => { editing = m; replyTo = null; text = m.body }} aria-label="Edit"><Icon name="edit" size={16} /></button>{/if}
            {#if m.mine}<button class="icon-btn" onclick={() => chat.deleteMessage(m.id)} aria-label="Delete message"><Icon name="trash" size={16} /></button>{/if}
          </div>
        </article>
      {/each}
    </div>

    <div class="typing" aria-live="polite">{chat.typing.length ? `${chat.typing.join(', ')} ${chat.typing.length > 1 ? 'are' : 'is'} typing…` : ''}</div>
    <footer>
      {#if notice}<div class="ctx err" role="alert">{notice}</div>{/if}
      <div class="composer">
        {#if replyTo}<div class="ctx"><Icon name="reply" size={14} /> Replying to <b>{replyTo.senderName}</b><span class="clip">{replyTo.body}</span><button class="icon-btn" onclick={() => (replyTo = null)} aria-label="Cancel reply"><Icon name="x" size={14} /></button></div>{/if}
        {#if editing}<div class="ctx"><Icon name="edit" size={14} /> Editing message<button class="icon-btn" onclick={() => { editing = null; text = '' }} aria-label="Cancel edit"><Icon name="x" size={14} /></button></div>{/if}
        {#if suggestions.length}
          <ul class="mentions" id="mention-list" role="listbox" aria-label="Mention suggestions">
            {#each suggestions as u, i (u.id)}
              <li role="option" aria-selected={i === sel} class:on={i === sel} onmousedown={(e) => { e.preventDefault(); complete(u) }}><Avatar name={u.name} size={22} round src={u.avatar} /><span>{u.name}</span><small>{u.id}</small></li>
            {/each}
          </ul>
        {/if}
        <div class="input">
          <button class="icon-btn" title="Attach a file" aria-label="Attach a file" onclick={() => fileInput?.click()}><Icon name="clip" /></button>
          <input type="file" hidden bind:this={fileInput} onchange={pick} />
          <textarea rows="1" bind:this={area} bind:value={text} onkeydown={keydown} onpaste={paste} oninput={() => (caret = area?.selectionStart ?? 0)} onclick={() => (caret = area?.selectionStart ?? 0)} role="combobox" aria-expanded={suggestions.length > 0} aria-controls="mention-list" aria-autocomplete="list" placeholder="Message {chat.active.name}" aria-label="Message"></textarea>
          <span class="pw"><button class="icon-btn" onclick={() => (picker = picker === 'composer' ? null : 'composer')} aria-label="Insert emoji"><Icon name="smile" /></button>
            {#if picker === 'composer'}<EmojiPicker onpick={(e) => (text += e)} onclose={() => (picker = null)} />{/if}</span>
          <button class="send" onclick={submit} disabled={!text.trim()} aria-label="Send message"><Icon name="send" size={17} /></button>
        </div>
      </div>
      <div class="hint">Enter to send · Shift+Enter for a new line · ↑ edits your last message · /invite @user:server</div>
    </footer>
  {/if}
</main>

<style>
  main { position: relative; display: flex; flex-direction: column; min-width: 0; height: 100%; background: var(--bg); }
  .empty { margin: auto; padding: 24px; text-align: center; color: var(--muted); display: grid; justify-items: center; gap: 4px; } .empty h1 { margin: 10px 0 0; font-size: 20px; color: var(--text); } .empty p { margin: 0; }
  header { display: flex; align-items: center; gap: 12px; height: 56px; padding: 0 16px; border-bottom: 1px solid var(--line); flex: none; }
  .back { display: none; } @media (max-width: 720px) { .back { display: grid; } }
  .title { min-width: 0; display: grid; line-height: 1.25; } h1 { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: -.01em; } .topic { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .enc { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--ok); padding: 3px 9px; border-radius: 999px; background: color-mix(in srgb, var(--ok) 14%, transparent); }
  .scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 0 4px; }
  .note { text-align: center; color: var(--muted); font-size: 12px; padding: 8px; }
  .day { display: flex; align-items: center; gap: 12px; margin: 16px 20px 6px; color: var(--muted); font-size: 12px; font-weight: 600; } .day::before, .day::after { content: ''; flex: 1; height: 1px; background: var(--line); }
  /* Off-screen messages skip layout and paint, which keeps long rooms fast. */
.sentinel { min-height: 24px; margin: 4px 0; text-align: center; color: var(--muted); font-size: 12px; }
  .start { margin: 8px 0 4px; text-align: center; color: var(--muted); font-size: 12px; }
  .latest { position: absolute; left: 50%; bottom: 96px; transform: translateX(-50%); z-index: 5; display: inline-flex; gap: 6px; align-items: center; padding: 7px 14px; border-radius: 999px; border: 1px solid var(--line); background: var(--panel); color: var(--text); font: inherit; font-size: 12px; box-shadow: 0 6px 20px rgb(0 0 0 / .25); cursor: pointer; } .latest :global(svg) { transform: rotate(90deg); }
  article { position: relative; display: flex; gap: 12px; padding: 2px 20px; margin-top: 10px; content-visibility: auto; contain-intrinsic-size: auto 44px; } article.cont { margin-top: 0; } article.mention { background: color-mix(in srgb, var(--accent) 10%, transparent); box-shadow: inset 3px 0 0 var(--accent); } article.pending { opacity: .55; } article:hover { background: color-mix(in srgb, var(--tile) 55%, transparent); }
  .gutter { flex: none; width: 36px; padding-top: 2px; } .gutter time { display: none; white-space: nowrap; font-size: 10px; color: var(--muted); text-align: center; line-height: 22px; margin-inline: -8px; } article:hover .gutter time { display: block; }
  .body { min-width: 0; flex: 1; }
  .head { display: flex; align-items: baseline; gap: 8px; } .head b { font-weight: 650; } .head time { color: var(--muted); font-size: 11px; }
  .text { white-space: pre-wrap; overflow-wrap: anywhere; max-width: 75ch; } .text.utd { color: var(--muted); font-style: italic; } .edited { color: var(--muted); font-size: 11px; }
  .text :global(.mention) { padding: 0 5px; border-radius: 5px; background: color-mix(in srgb, var(--accent) 16%, transparent); color: color-mix(in srgb, var(--accent) 55%, var(--text)); font-weight: 600; white-space: nowrap; } .text :global(.mention.me) { background: var(--accent); color: var(--accent-ink); }
  .text :global(code) { background: var(--tile); padding: 1px 5px; border-radius: 4px; font-family: var(--mono); font-size: 12.5px; } .text :global(pre) { margin: 6px 0; padding: 10px 12px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow-x: auto; } .text :global(pre code) { padding: 0; background: none; }
  .text :global(blockquote) { margin: 2px 0; padding-left: 12px; border-left: 3px solid var(--line); color: var(--muted); } .text :global(a) { color: var(--accent); text-underline-offset: 3px; }
  .quote { display: flex; gap: 6px; align-items: center; color: var(--muted); font-size: 12px; margin: 2px 0 3px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; padding-left: 8px; border-left: 2px solid var(--accent); }
  .thread-link { display: inline-flex; align-items: center; gap: 6px; margin-top: 4px; padding: 2px 8px; border-radius: 6px; color: var(--accent); font-size: 12px; font-weight: 600; } .thread-link:hover { background: var(--tile); }
  .pinbar { position: relative; display: flex; align-items: center; gap: 8px; padding: 6px 16px; border-bottom: 1px solid var(--line); background: var(--panel); font-size: 12px; }
  .pin-main { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1; border: 0; background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; } .pin-main span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }
  .pin-count { border: 1px solid var(--line); border-radius: 999px; background: none; color: var(--muted); font: inherit; padding: 2px 10px; cursor: pointer; }
  .pinlist { position: absolute; z-index: 6; top: 100%; left: 12px; right: 12px; margin: 4px 0 0; padding: 4px; list-style: none; max-height: 260px; overflow-y: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow); } .pinlist li { display: flex; align-items: center; gap: 4px; } .pinlist li > button:first-child { flex: 1; min-width: 0; display: flex; gap: 8px; border: 0; background: none; color: var(--text); font: inherit; text-align: left; padding: 6px 8px; border-radius: 7px; cursor: pointer; } .pinlist li > button:first-child:hover { background: var(--tile); } .pinlist span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }
  .pinned { display: inline-flex; align-items: center; gap: 3px; color: var(--muted); font-size: 11px; }
  .seen { display: flex; align-items: center; gap: 3px; margin-top: 3px; color: var(--muted); font-size: 11px; } .seen span { margin-left: 3px; }
  .reacts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 5px; } .reacts button { display: inline-flex; flex: none; gap: 5px; align-items: center; white-space: nowrap; line-height: 20px; min-height: 24px; padding: 1px 9px; font-variant-numeric: tabular-nums; border-radius: 999px; background: var(--tile); border: 1px solid var(--line); font-size: 12px; font-weight: 600; } .reacts button span { font-size: 14px; line-height: 20px; } .reacts button:hover { border-color: var(--accent); }
  .tools { display: none; position: absolute; top: -16px; right: 20px; z-index: 2; gap: 0; padding: 2px; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow); }
  /* content-visibility clips overflow; the toolbar and emoji picker hang outside the row, so lift it while the row is in use. */
  article:hover, article:focus-within, article.active { content-visibility: visible; }
  article:hover .tools, article:focus-within .tools, article.active .tools { display: flex; } .tools .icon-btn { width: 30px; height: 28px; font-size: 15px; } .pw { position: relative; }
  .typing { height: 22px; padding: 0 20px; font-size: 12px; color: var(--muted); flex: none; }
  footer { padding: 0 16px 10px; flex: none; }
  .composer { background: var(--tile); border: 1px solid var(--line); border-radius: 12px; } .composer:focus-within { border-color: var(--accent); }
  .ctx { display: flex; align-items: center; gap: 6px; padding: 6px 8px 6px 12px; font-size: 12px; color: var(--muted); border-bottom: 1px solid var(--line); } .ctx .clip { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .ctx button { margin-left: auto; } .err { color: var(--danger); border: 0; }
  .input { display: flex; align-items: flex-end; gap: 2px; padding: 6px; }
.mentions { list-style: none; margin: 0 0 6px; padding: 4px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); box-shadow: 0 8px 24px rgb(0 0 0 / .25); } .mentions li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 7px; color: var(--text); cursor: pointer; } .mentions li.on { background: var(--tile); } .mentions small { margin-left: auto; color: var(--muted); font-size: 11px; }
  textarea { flex: 1; resize: none; max-height: 180px; background: none; border: 0; padding: 7px 6px; field-sizing: content; } textarea:focus { border: 0; }
  .send { width: 34px; height: 34px; border-radius: 8px; display: grid; place-items: center; background: var(--accent); color: var(--accent-ink); } .send:disabled { background: transparent; color: var(--muted); opacity: .6; }
  .hint { margin-top: 6px; font-size: 11px; color: var(--muted); text-align: center; } @media (max-width: 720px) { .hint { display: none; } }
</style>
