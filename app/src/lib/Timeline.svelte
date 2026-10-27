<script lang="ts">
  import { tick } from 'svelte'
  import { chat, type Msg } from './matrix.svelte'

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
    <div class="empty"><h2>Pick a conversation</h2><p>Press <kbd>Ctrl K</kbd> to jump anywhere.</p></div>
  {:else}
    <header>
      <button class="back" onclick={() => (chat.activeRoom = null)} aria-label="Back">←</button>
      <strong>{chat.active.isDM ? '@' : '#'} {chat.active.name}</strong>
    </header>
    <div class="scroll" bind:this={scroller} {onscroll}>
      {#if chat.loadingOlder}<div class="note">Loading earlier messages…</div>{/if}
      {#each grouped as { m, cont } (m.id)}
        <article class:cont class:pending={m.pending}>
          {#if !cont}<div class="av">{m.senderName.slice(0, 1).toUpperCase()}</div>{:else}<div class="av ghost"></div>{/if}
          <div class="body">
            {#if !cont}<div class="meta"><b>{m.senderName}</b><time>{fmt(m.ts)}</time></div>{/if}
            {#if m.replyTo}<div class="quote">↪ {byId(m.replyTo)?.body ?? 'message'}</div>{/if}
            {#if m.imageUrl}<img src={m.imageUrl} alt={m.body} loading="lazy" />{:else}<div class="text">{m.body}{#if m.edited}<small> (edited)</small>{/if}</div>{/if}
            {#if Object.keys(m.reactions).length}
              <div class="reacts">{#each Object.entries(m.reactions) as [k, n] (k)}<button onclick={() => chat.react(m.id, k)}>{k} {n}</button>{/each}</div>
            {/if}
          </div>
          <div class="tools">
            {#each EMOJI as e (e)}<button onclick={() => chat.react(m.id, e)} aria-label="React {e}">{e}</button>{/each}
            <button onclick={() => { replyTo = m; editing = null }}>Reply</button>
            {#if m.mine}<button onclick={() => { editing = m; text = m.body }}>Edit</button>{/if}
          </div>
        </article>
      {/each}
    </div>
    <div class="typing" aria-live="polite">{chat.typing.length ? `${chat.typing.join(', ')} typing…` : ''}</div>
    <footer>
      {#if replyTo}<div class="ctx">Replying to {replyTo.senderName}: {replyTo.body.slice(0, 80)} <button onclick={() => (replyTo = null)}>✕</button></div>{/if}
      {#if editing}<div class="ctx">Editing message <button onclick={() => { editing = null; text = '' }}>✕</button></div>{/if}
      <div class="composer">
        <label class="attach" title="Attach a file">＋<input type="file" hidden onchange={pick} /></label>
        <textarea rows="1" bind:value={text} onkeydown={keydown} placeholder="Message {chat.active.name}" aria-label="Message"></textarea>
        <button class="send" onclick={submit} disabled={!text.trim()}>Send</button>
      </div>
    </footer>
  {/if}
</section>

<style>
  section { display: flex; flex-direction: column; min-width: 0; height: 100%; }
  .empty { margin: auto; text-align: center; color: var(--muted); }
  header { display: flex; gap: 10px; align-items: center; padding: 14px 20px; border-bottom: 1px solid var(--line); }
  .back { display: none; } @media (max-width: 720px) { .back { display: block; } }
  .scroll { flex: 1; overflow-y: auto; padding: 12px 0; }
  .note { text-align: center; color: var(--muted); font-size: 12px; padding: 6px; }
  article { position: relative; display: flex; gap: 12px; padding: 2px 20px; margin-top: 12px; }
  article.cont { margin-top: 0; } article.pending { opacity: .55; } article:hover { background: var(--bg-2); }
  .av { flex: none; width: 36px; height: 36px; border-radius: 10px; background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #fff; display: grid; place-items: center; font-weight: 600; }
  .av.ghost { background: none; }
  .body { min-width: 0; } .meta { display: flex; gap: 8px; align-items: baseline; } time, small { color: var(--muted); font-size: 12px; }
  .text { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.45; }
  .quote { color: var(--muted); font-size: 13px; border-left: 3px solid var(--accent); padding-left: 8px; margin: 2px 0; }
  img { max-width: min(480px, 100%); border-radius: 10px; margin-top: 4px; }
  .reacts { display: flex; gap: 6px; margin-top: 4px; } .reacts button { padding: 1px 8px; border-radius: 12px; background: var(--bg-3); border: 1px solid var(--line); font-size: 13px; }
  .tools { display: none; position: absolute; right: 20px; top: -14px; background: var(--bg-3); border: 1px solid var(--line); border-radius: 8px; padding: 2px; }
  article:hover .tools, article:focus-within .tools { display: flex; } .tools button { padding: 3px 7px; font-size: 13px; border-radius: 6px; } .tools button:hover { background: var(--line); }
  .typing { height: 20px; padding: 0 20px; font-size: 12px; color: var(--muted); }
  footer { padding: 0 20px 16px; } .ctx { font-size: 12px; color: var(--muted); padding: 6px 12px; background: var(--bg-2); border-radius: 8px 8px 0 0; }
  .composer { display: flex; align-items: flex-end; gap: 8px; padding: 8px 10px; background: var(--bg-2); border: 1px solid var(--line); border-radius: var(--radius); }
  .composer:focus-within { border-color: var(--accent); }
  textarea { flex: 1; resize: none; max-height: 160px; background: none; border: 0; outline: none; padding: 6px 4px; field-sizing: content; }
  .attach { cursor: pointer; padding: 4px 8px; color: var(--muted); font-size: 18px; }
  .send { padding: 7px 14px; border-radius: 8px; background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #fff; font-weight: 600; } .send:disabled { opacity: .4; }
</style>
