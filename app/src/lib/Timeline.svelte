<script lang="ts">
  import { tick } from 'svelte'
  import { chat, type Msg } from './matrix.svelte'
  import { render } from './markdown'
  import { ink } from './ui.svelte'

  let text = $state('')
  let replyTo = $state<Msg | null>(null)
  let editing = $state<Msg | null>(null)
  let scroller: HTMLElement | undefined = $state()
  let stick = true
  let typingTimer: ReturnType<typeof setTimeout> | undefined

  const EMOJI = ['👍', '❤️', '😂', '🎉', '👀']
  const fmt = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const byId = (id?: string) => chat.messages.find((m) => m.id === id)

  // Group consecutive messages from one sender within 5 minutes.
  const grouped = $derived(
    chat.messages.map((m, i) => {
      const p = chat.messages[i - 1]
      return { m, cont: !!p && p.sender === m.sender && m.ts - p.ts < 300_000 && !m.replyTo }
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
    if (editing) { await chat.edit(editing.id, body); editing = null }
    else { await chat.send(body, replyTo?.id); replyTo = null }
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

<section class="main" aria-label="Conversation" ondragover={(e) => e.preventDefault()} ondrop={drop}>
  {#if !chat.active}
    <div class="empty"><p class="big">Nothing open.</p><p>Pick a room from the index, or press <span class="mono">Ctrl K</span>.</p></div>
  {:else}
    <header>
      <button class="back link" onclick={() => (chat.activeRoom = null)}>Rooms</button>
      <h1>{chat.active.name}</h1>
      {#if chat.active.encrypted}<span class="mono enc">end-to-end encrypted</span>{/if}
    </header>
    <div class="scroll" bind:this={scroller} {onscroll}>
      {#if chat.loadingOlder}<div class="note mono">Loading earlier messages</div>{/if}
      {#each grouped as { m, cont } (m.id)}
        <article class:cont class:pending={m.pending}>
          <time class="mono">{fmt(m.ts)}</time>
          <div class="body">
            {#if !cont}<div class="who" style={ink(m.senderName)}>{m.senderName}{#if m.mine}<span class="mono you">you</span>{/if}</div>{/if}
            {#if m.replyTo}<div class="quote">{byId(m.replyTo)?.senderName ?? ''}: {byId(m.replyTo)?.body ?? 'earlier message'}</div>{/if}
            {#if m.imageUrl}<img src={m.imageUrl} alt={m.body} loading="lazy" />{:else}<div class="text" class:utd={m.undecryptable}>{@html render(m.body)}{#if m.edited}<span class="mono"> edited</span>{/if}</div>{/if}
            {#if Object.keys(m.reactions).length}
              <div class="reacts">{#each Object.entries(m.reactions) as [k, n] (k)}<button class="mono" onclick={() => chat.react(m.id, k)}>{k} {n}</button>{/each}</div>
            {/if}
          </div>
          <div class="tools mono">
            {#each EMOJI as e (e)}<button onclick={() => chat.react(m.id, e)} aria-label="React {e}">{e}</button>{/each}
            <button onclick={() => { replyTo = m; editing = null }}>reply</button>
            {#if m.mine}<button onclick={() => { editing = m; text = m.body }}>edit</button>{/if}
          </div>
        </article>
      {/each}
    </div>
    <div class="typing mono" aria-live="polite">{chat.typing.length ? `${chat.typing.join(', ')} typing` : ''}</div>
    <footer>
      {#if replyTo}<div class="ctx mono">Replying to {replyTo.senderName}: {replyTo.body.slice(0, 80)} <button class="link" onclick={() => (replyTo = null)}>cancel</button></div>{/if}
      {#if editing}<div class="ctx mono">Editing message <button class="link" onclick={() => { editing = null; text = '' }}>cancel</button></div>{/if}
      <div class="composer">
        <label class="attach mono link">attach<input type="file" hidden onchange={pick} /></label>
        <textarea rows="1" bind:value={text} onkeydown={keydown} placeholder="Write to {chat.active.name}" aria-label="Message"></textarea>
        <button class="btn" onclick={submit} disabled={!text.trim()}>Send</button>
      </div>
    </footer>
  {/if}
</section>

<style>
  section { display: flex; flex-direction: column; min-width: 0; height: 100%; }
  .empty { margin: auto; padding: 0 24px; color: var(--muted); } .big { font: 400 40px/1.1 var(--serif); color: var(--text); margin: 0 0 8px; }
  header { display: flex; gap: 14px; align-items: baseline; padding: 16px 28px 12px; border-bottom: 1px solid var(--line); }
  h1 { margin: 0; font: 400 28px/1.1 var(--serif); letter-spacing: -.01em; } .enc { margin-left: auto; color: var(--muted); }
  .back { display: none; font-size: 13px; } @media (max-width: 720px) { .back { display: block; } header { padding-inline: 16px; } }
  .scroll { flex: 1; overflow-y: auto; padding: 14px 0; }
  .note { text-align: center; color: var(--muted); padding: 6px; }
  article { position: relative; display: grid; grid-template-columns: 64px 1fr; gap: 0 12px; padding: 4px 28px 4px 20px; margin-top: 12px; }
  article.cont { margin-top: 0; } article.pending { opacity: .5; } article:hover { background: var(--tile); }
  @media (max-width: 720px) { article { grid-template-columns: 48px 1fr; padding-right: 16px; } }
  time { color: var(--muted); text-align: right; padding-top: 3px; font-size: 11px; visibility: hidden; } article:not(.cont) time, article:hover time { visibility: visible; }
  .who { font-weight: 700; font-size: 14px; } .you { color: var(--muted); font-weight: 400; margin-left: 6px; }
  .text { white-space: pre-wrap; overflow-wrap: anywhere; max-width: 70ch; } .text.utd { color: var(--muted); font-style: italic; } .text .mono { color: var(--muted); }
  .text :global(code) { background: var(--tile); padding: 0 5px; font-family: var(--mono); font-size: 13px; } .text :global(pre) { margin: 6px 0 0; padding: 10px 12px; background: var(--tile); overflow-x: auto; } .text :global(pre code) { padding: 0; }
  .text :global(blockquote) { margin: 2px 0; padding-left: 12px; border-left: 2px solid var(--text); color: var(--muted); } .text :global(a) { text-decoration: underline; text-underline-offset: 3px; }
  .quote { color: var(--muted); font-size: 13px; border-left: 2px solid var(--line); padding-left: 10px; margin: 2px 0 4px; }
  img { max-width: min(480px, 100%); display: block; margin-top: 4px; }
  .reacts { display: flex; gap: 6px; margin-top: 4px; } .reacts button { padding: 0 6px; border: 1px solid var(--line); } .reacts button:hover { border-color: var(--text); }
  .tools { display: none; position: absolute; top: -12px; right: 24px; background: var(--bg); border: 1px solid var(--text); } article:hover .tools, article:focus-within .tools { display: flex; }
  .tools button { padding: 2px 8px; } .tools button:hover { background: var(--text); color: var(--bg); }
  .typing { height: 20px; padding: 0 28px; color: var(--muted); }
  footer { padding: 0 28px 18px; } @media (max-width: 720px) { footer { padding-inline: 16px; } }
  .ctx { padding: 6px 0; color: var(--muted); }
  .composer { display: flex; align-items: end; gap: 14px; border-top: 2px solid var(--text); padding-top: 10px; }
  textarea { flex: 1; resize: none; max-height: 180px; border: 0; padding: 6px 0; field-sizing: content; }
  .attach { cursor: pointer; padding-bottom: 8px; color: var(--muted); }
</style>
