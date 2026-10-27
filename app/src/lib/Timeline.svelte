<script lang="ts">
  import { tick } from 'svelte'
  import { chat, type Msg } from './matrix.svelte'
  import { render } from './markdown'
  import { dayLabel, ui } from './ui.svelte'
  import Avatar from './Avatar.svelte'
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
  $effect(() => {
    chat.activeRoom
    stick = true
    replyTo = editing = null
    picker = null
    notice = ''
    text = ''
  })

  function onscroll() {
    if (!scroller) return
    stick = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80
    if (scroller.scrollTop < 40 && !chat.loadingOlder) {
      const h = scroller.scrollHeight
      chat.loadOlder().then(() => tick().then(() => scroller && (scroller.scrollTop = scroller.scrollHeight - h)))
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
  function keydown(e: KeyboardEvent) {
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
      <Avatar name={chat.active.name} size={32} round={chat.active.isDM} />
      <div class="title"><h1>{chat.active.name}</h1>{#if chat.active.topic}<span class="topic">{chat.active.topic}</span>{:else}<span class="topic">{chat.active.memberCount} {chat.active.memberCount === 1 ? 'member' : 'members'}</span>{/if}</div>
      {#if chat.active.encrypted}<span class="enc" title="End-to-end encrypted"><Icon name="lock" size={13} /> Encrypted</span>{/if}
      <button class="icon-btn" class:on={ui.details} onclick={() => (ui.details = !ui.details)} aria-label="Room details" aria-pressed={ui.details}><Icon name="info" /></button>
    </header>

    <div class="scroll" bind:this={scroller} {onscroll}>
      {#if chat.loadingOlder}<div class="note">Loading earlier messages…</div>{/if}
      {#each rows as { m, newDay, cont } (m.id)}
        {#if newDay}<div class="day" role="separator"><span>{dayLabel(m.ts)}</span></div>{/if}
        <article class:cont class:pending={m.pending}>
          <div class="gutter">
            {#if !cont}<Avatar name={m.senderName} size={36} round />{:else}<time>{fmt(m.ts)}</time>{/if}
          </div>
          <div class="body">
            {#if !cont}<div class="head"><b>{m.senderName}</b><time>{fmt(m.ts)}</time></div>{/if}
            {#if m.replyTo}<div class="quote"><Icon name="reply" size={12} /> <b>{byId(m.replyTo)?.senderName ?? ''}</b> {byId(m.replyTo)?.body ?? 'earlier message'}</div>{/if}
            {#if m.imageUrl}<img src={m.imageUrl} alt={m.body} loading="lazy" />{:else}<div class="text" class:utd={m.undecryptable}>{@html render(m.body)}{#if m.edited}<span class="edited"> (edited)</span>{/if}</div>{/if}
            {#if Object.keys(m.reactions).length}
              <div class="reacts">{#each Object.entries(m.reactions) as [k, n] (k)}<button onclick={() => chat.react(m.id, k)} aria-label="React {k}"><span>{k}</span> {n}</button>{/each}</div>
            {/if}
          </div>
          <div class="tools">
            {#each QUICK as e (e)}<button class="icon-btn" onclick={() => chat.react(m.id, e)} aria-label="React {e}">{e}</button>{/each}
            <span class="pw"><button class="icon-btn" onclick={() => (picker = picker === m.id ? null : m.id)} aria-label="More reactions"><Icon name="smile" size={16} /></button>
              {#if picker === m.id}<EmojiPicker onpick={(e) => chat.react(m.id, e)} onclose={() => (picker = null)} />{/if}</span>
            <button class="icon-btn" onclick={() => { replyTo = m; editing = null }} aria-label="Reply"><Icon name="reply" size={16} /></button>
            {#if m.mine && !m.undecryptable}<button class="icon-btn" onclick={() => { editing = m; replyTo = null; text = m.body }} aria-label="Edit"><Icon name="edit" size={16} /></button>{/if}
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
        <div class="input">
          <button class="icon-btn" title="Attach a file" aria-label="Attach a file" onclick={() => fileInput?.click()}><Icon name="clip" /></button>
          <input type="file" hidden bind:this={fileInput} onchange={pick} />
          <textarea rows="1" bind:value={text} onkeydown={keydown} placeholder="Message {chat.active.name}" aria-label="Message"></textarea>
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
  main { display: flex; flex-direction: column; min-width: 0; height: 100%; background: var(--bg); }
  .empty { margin: auto; padding: 24px; text-align: center; color: var(--muted); display: grid; justify-items: center; gap: 4px; } .empty h1 { margin: 10px 0 0; font-size: 20px; color: var(--text); } .empty p { margin: 0; }
  header { display: flex; align-items: center; gap: 12px; height: 56px; padding: 0 16px; border-bottom: 1px solid var(--line); flex: none; }
  .back { display: none; } @media (max-width: 720px) { .back { display: grid; } }
  .title { min-width: 0; display: grid; line-height: 1.25; } h1 { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: -.01em; } .topic { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .enc { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--ok); padding: 3px 9px; border-radius: 999px; background: color-mix(in srgb, var(--ok) 14%, transparent); }
  .scroll { flex: 1; overflow-y: auto; padding: 8px 0 4px; }
  .note { text-align: center; color: var(--muted); font-size: 12px; padding: 8px; }
  .day { display: flex; align-items: center; gap: 12px; margin: 16px 20px 6px; color: var(--muted); font-size: 12px; font-weight: 600; } .day::before, .day::after { content: ''; flex: 1; height: 1px; background: var(--line); }
  article { position: relative; display: flex; gap: 12px; padding: 2px 20px; margin-top: 10px; } article.cont { margin-top: 0; } article.pending { opacity: .55; } article:hover { background: color-mix(in srgb, var(--tile) 55%, transparent); }
  .gutter { flex: none; width: 36px; padding-top: 2px; } .gutter time { display: none; font-size: 10px; color: var(--muted); text-align: right; line-height: 22px; } article:hover .gutter time { display: block; }
  .body { min-width: 0; flex: 1; }
  .head { display: flex; align-items: baseline; gap: 8px; } .head b { font-weight: 650; } .head time { color: var(--muted); font-size: 11px; }
  .text { white-space: pre-wrap; overflow-wrap: anywhere; max-width: 75ch; } .text.utd { color: var(--muted); font-style: italic; } .edited { color: var(--muted); font-size: 11px; }
  .text :global(code) { background: var(--tile); padding: 1px 5px; border-radius: 4px; font-family: var(--mono); font-size: 12.5px; } .text :global(pre) { margin: 6px 0; padding: 10px 12px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow-x: auto; } .text :global(pre code) { padding: 0; background: none; }
  .text :global(blockquote) { margin: 2px 0; padding-left: 12px; border-left: 3px solid var(--line); color: var(--muted); } .text :global(a) { color: var(--accent); text-underline-offset: 3px; }
  .quote { display: flex; gap: 6px; align-items: center; color: var(--muted); font-size: 12px; margin: 2px 0 3px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; padding-left: 8px; border-left: 2px solid var(--accent); }
  img { max-width: min(420px, 100%); max-height: 320px; display: block; margin-top: 4px; border-radius: 10px; border: 1px solid var(--line); }
  .reacts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 5px; } .reacts button { display: inline-flex; gap: 5px; align-items: center; padding: 1px 8px; border-radius: 999px; background: var(--tile); border: 1px solid var(--line); font-size: 12px; font-weight: 600; } .reacts button:hover { border-color: var(--accent); }
  .tools { display: none; position: absolute; top: -16px; right: 20px; z-index: 2; gap: 0; padding: 2px; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow); }
  article:hover .tools, article:focus-within .tools { display: flex; } .tools .icon-btn { width: 30px; height: 28px; font-size: 15px; } .pw { position: relative; }
  .typing { height: 22px; padding: 0 20px; font-size: 12px; color: var(--muted); flex: none; }
  footer { padding: 0 16px 10px; flex: none; }
  .composer { background: var(--tile); border: 1px solid var(--line); border-radius: 12px; } .composer:focus-within { border-color: var(--accent); }
  .ctx { display: flex; align-items: center; gap: 6px; padding: 6px 8px 6px 12px; font-size: 12px; color: var(--muted); border-bottom: 1px solid var(--line); } .ctx .clip { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .ctx button { margin-left: auto; } .err { color: var(--danger); border: 0; }
  .input { display: flex; align-items: flex-end; gap: 2px; padding: 6px; }
  textarea { flex: 1; resize: none; max-height: 180px; background: none; border: 0; padding: 7px 6px; field-sizing: content; } textarea:focus { border: 0; }
  .send { width: 34px; height: 34px; border-radius: 8px; display: grid; place-items: center; background: var(--accent); color: var(--accent-ink); } .send:disabled { background: transparent; color: var(--muted); opacity: .6; }
  .hint { margin-top: 6px; font-size: 11px; color: var(--muted); text-align: center; } @media (max-width: 720px) { .hint { display: none; } }
</style>
