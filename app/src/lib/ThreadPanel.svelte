<script lang="ts">
  import { chat } from './matrix.svelte'
  import { render } from './markdown'
  import Avatar from './Avatar.svelte'
  import Icon from './Icon.svelte'
  let text = $state('')
  const fmt = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const replies = $derived(Math.max(chat.threadMessages.length - 1, 0))

  async function submit() {
    const body = text
    if (!body.trim()) return
    text = ''
    await chat.sendInThread(body)
  }
  function keydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
    else if (e.key === 'Escape') chat.closeThread()
  }
  const focus = (n: HTMLElement) => n.focus()
</script>

<aside aria-label="Thread">
  <header>
    <div><h2>Thread</h2><span>{replies} {replies === 1 ? 'reply' : 'replies'}</span></div>
    <button class="icon-btn" onclick={() => chat.closeThread()} aria-label="Close thread"><Icon name="x" /></button>
  </header>
  <div class="list">
    {#each chat.threadMessages as m, i (m.id)}
      <article class:root={i === 0}>
        <Avatar name={m.senderName} size={30} round />
        <div class="body">
          <div class="head"><b>{m.senderName}</b><time>{fmt(m.ts)}</time></div>
          <div class="text" class:utd={m.undecryptable}>{@html render(m.body, { name: chat.nameOf, me: chat.userId })}</div>
        </div>
      </article>
      {#if i === 0 && chat.threadMessages.length > 1}<div class="sep"><span>{replies} {replies === 1 ? 'reply' : 'replies'}</span></div>{/if}
    {/each}
  </div>
  <footer>
    <textarea use:focus rows="1" bind:value={text} onkeydown={keydown} placeholder="Reply in thread" aria-label="Reply in thread"></textarea>
    <button class="send" onclick={submit} disabled={!text.trim()} aria-label="Send reply"><Icon name="send" size={16} /></button>
  </footer>
</aside>

<style>
  aside { height: 100%; display: flex; flex-direction: column; min-width: 0; background: var(--panel); border-left: 1px solid var(--line); }
  header { display: flex; justify-content: space-between; align-items: center; height: 56px; padding: 0 12px 0 16px; border-bottom: 1px solid var(--line); flex: none; } h2 { margin: 0; font-size: 15px; } header span { color: var(--muted); font-size: 12px; }
  .list { flex: 1; overflow-y: auto; padding: 12px 16px; }
  article { display: flex; gap: 10px; padding: 6px 0; } article.root { padding-bottom: 10px; }
  .body { min-width: 0; flex: 1; } .head { display: flex; gap: 8px; align-items: baseline; } .head time { color: var(--muted); font-size: 11px; }
  .text { white-space: pre-wrap; overflow-wrap: anywhere; } .text.utd { color: var(--muted); font-style: italic; }
  .text :global(code) { background: var(--tile); padding: 1px 5px; border-radius: 4px; font-family: var(--mono); font-size: 12.5px; } .text :global(a) { color: var(--accent); }
  .sep { display: flex; align-items: center; gap: 10px; margin: 6px 0; color: var(--muted); font-size: 12px; } .sep::before, .sep::after { content: ''; flex: 1; height: 1px; background: var(--line); }
  footer { display: flex; align-items: flex-end; gap: 6px; margin: 0 12px 12px; padding: 6px; background: var(--tile); border: 1px solid var(--line); border-radius: 12px; } footer:focus-within { border-color: var(--accent); }
  textarea { flex: 1; resize: none; max-height: 140px; background: none; border: 0; padding: 7px 6px; field-sizing: content; } textarea:focus { border: 0; }
  .send { width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; background: var(--accent); color: var(--accent-ink); } .send:disabled { background: transparent; color: var(--muted); opacity: .6; }
</style>
