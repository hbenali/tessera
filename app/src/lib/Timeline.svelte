<script lang="ts">
  import { tick } from 'svelte'
  import { chat, type Msg } from './matrix.svelte'
  import { render } from './markdown'
  import { tile, initials } from './ui.svelte'

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
      <span class="tile" style={tile(chat.active.name)}>{initials(chat.active.name)}</span><strong>{chat.active.name}</strong>{#if chat.active.encrypted}<span class="enc">🔒 Encrypted</span>{/if}
    </header>
    <div class="scroll" bind:this={scroller} {onscroll}>
      {#if chat.loadingOlder}<div class="note">Loading earlier messages…</div>{/if}
      {#each grouped as { m, cont } (m.id)}
        <article class:cont class:pending={m.pending} class:mine={m.mine}>
          {#if !cont && !m.mine}<div class="av" style={tile(m.senderName)}>{initials(m.senderName)}</div>{:else if !m.mine}<div class="av ghost"></div>{/if}
          <div class="body">
            {#if !cont && !m.mine}<div class="meta"><b>{m.senderName}</b><time>{fmt(m.ts)}</time></div>{/if}
            {#if m.replyTo}<div class="quote">↪ {byId(m.replyTo)?.body ?? 'message'}</div>{/if}
            {#if m.imageUrl}<img src={m.imageUrl} alt={m.body} loading="lazy" />{:else}<div class="text" class:utd={m.undecryptable}>{@html render(m.body)}{#if m.edited}<small> (edited)</small>{/if}</div>{/if}
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
  section { display: flex; flex-direction: column; min-width: 0; height: 100%; background: var(--panel); border: 1px solid var(--line); border-radius: 22px; overflow: hidden; }
  .empty { margin: auto; text-align: center; color: var(--muted); }
  header { display: flex; gap: 12px; align-items: center; padding: 14px 20px; border-bottom: 1px solid var(--line); }
  .tile { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; color: #fff; font-size: 11px; font-weight: 700; }
  .enc { margin-left: auto; font-size: 12px; color: var(--muted); background: var(--tile); padding: 3px 10px; border-radius: 999px; }
  .back { display: none; } @media (max-width: 720px) { .back { display: block; } }
  .scroll { flex: 1; overflow-y: auto; padding: 16px 0; }
  .note { text-align: center; color: var(--muted); font-size: 12px; padding: 6px; }
  article { position: relative; display: flex; gap: 10px; padding: 0 20px; margin-top: 14px; align-items: flex-end; }
  article.cont { margin-top: 3px; } article.pending { opacity: .55; } article.mine { justify-content: flex-end; }
  .av { flex: none; width: 34px; height: 34px; border-radius: 50%; color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 12px; }
  .av.ghost { background: none; }
  .body { min-width: 0; max-width: min(640px, 78%); padding: 9px 14px; background: var(--tile); border-radius: 18px 18px 18px 6px; }
  article.mine .body { background: var(--mine); border-radius: 18px 18px 6px 18px; }
  .meta { display: flex; gap: 8px; align-items: baseline; margin-bottom: 2px; } .meta b { font-size: 13px; }
  time, small { color: var(--muted); font-size: 12px; }
  .text { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.45; } .text.utd { color: var(--muted); font-style: italic; }
  .text :global(code) { background: var(--bg); padding: 1px 6px; border-radius: 6px; font-size: 13px; } .text :global(pre) { margin: 6px 0 0; padding: 10px; background: var(--bg); border-radius: 10px; overflow-x: auto; } .text :global(pre code) { padding: 0; }
  .text :global(blockquote) { margin: 2px 0; padding-left: 10px; border-left: 3px solid var(--accent); color: var(--muted); } .text :global(a) { color: var(--accent); }
  .quote { color: var(--muted); font-size: 13px; border-left: 3px solid var(--accent); padding-left: 8px; margin: 2px 0; }
  img { max-width: min(480px, 100%); border-radius: 12px; margin-top: 4px; }
  .reacts { display: flex; gap: 6px; margin-top: 6px; } .reacts button { padding: 1px 8px; border-radius: 999px; background: var(--panel); border: 1px solid var(--line); font-size: 13px; }
  .tools { display: none; position: absolute; top: -16px; right: 24px; background: var(--panel); border: 1px solid var(--line); border-radius: 999px; padding: 2px 4px; box-shadow: 0 4px 14px #0004; }
  article:hover .tools, article:focus-within .tools { display: flex; } .tools button { padding: 3px 7px; font-size: 13px; border-radius: 999px; } .tools button:hover { background: var(--tile); }
  .typing { height: 20px; padding: 0 24px; font-size: 12px; color: var(--muted); }
  footer { padding: 0 16px 16px; } .ctx { font-size: 12px; color: var(--muted); padding: 6px 14px; background: var(--tile); border-radius: 14px 14px 0 0; }
  .composer { display: flex; align-items: flex-end; gap: 8px; padding: 8px 10px; background: var(--tile); border: 1px solid var(--line); border-radius: 20px; }
  .composer:focus-within { border-color: var(--accent); }
  textarea { flex: 1; resize: none; max-height: 160px; background: none; border: 0; outline: none; padding: 6px 4px; field-sizing: content; }
  .attach { cursor: pointer; padding: 4px 8px; color: var(--muted); font-size: 18px; }
  .send { padding: 7px 16px; border-radius: 999px; background: var(--accent); color: #1a1208; font-weight: 700; } .send:disabled { opacity: .35; }
</style>
