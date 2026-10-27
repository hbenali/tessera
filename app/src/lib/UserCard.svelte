<script lang="ts">
  import { chat } from './matrix.svelte'
  import { ui } from './ui.svelte'
  import Avatar from './Avatar.svelte'
  import Icon from './Icon.svelte'

  const at = ui.userCard!
  const member = $derived(chat.members.find((m) => m.id === at.id))
  let fetched = $state<{ name: string; avatar?: string } | null>(null)
  const name = $derived(member?.name ?? fetched?.name ?? chat.nameOf(at.id) ?? at.id)
  const avatar = $derived(member?.avatar ?? fetched?.avatar)
  const me = $derived(at.id === chat.userId)
  const presence = $derived(me ? chat.myStatus : chat.presenceOf(at.id))
  const label = $derived(presence === 'online' ? 'Online' : presence === 'unavailable' ? 'Away' : presence === 'offline' ? 'Offline' : '')

  let card: HTMLElement | undefined = $state()
  let left = $state(at.x)
  let top = $state(at.y)
  let copied = $state(false)
  let err = $state('')

  // Someone mentioned who is not in this room: ask the homeserver who they are.
  $effect(() => {
    if (member) return
    chat.profileOf(at.id).then((p) => (fetched = p), () => {})
  })
  $effect(() => {
    const c = card
    if (!c) return
    queueMicrotask(() => {
      left = Math.max(8, Math.min(at.x, innerWidth - c.offsetWidth - 8))
      top = Math.max(8, at.y + c.offsetHeight > innerHeight - 8 ? Math.max(8, at.y - c.offsetHeight - 36) : at.y)
      c.querySelector<HTMLElement>('button')?.focus()
    })
  })

  function close() {
    const back = at.opener
    ui.userCard = null
    back?.focus()
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'Tab') {
      const f = [...(card?.querySelectorAll<HTMLElement>('button') ?? [])]
      if (!f.length) return
      const i = f.indexOf(document.activeElement as HTMLElement)
      e.preventDefault()
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus()
    }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(at.id); copied = true; setTimeout(() => (copied = false), 1600) } catch { err = 'Could not copy' }
  }
  async function message() {
    try { await chat.startDM(at.id); ui.userCard = null } catch (e) { err = e instanceof Error ? e.message : 'Could not start the chat' }
  }
  function mention() {
    ui.mentionRequest = at.id
    ui.userCard = null
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={close} oncontextmenu={(e) => { e.preventDefault(); close() }}></div>
<div class="card" role="dialog" aria-label="Profile of {name}" tabindex="-1" bind:this={card} style="left:{left}px;top:{top}px" onkeydown={key}>
  <div class="who">
    <Avatar {name} size={56} round src={avatar} presence={presence} />
    <div class="ids">
      <b>{name}{#if me} <span class="you">you</span>{/if}</b>
      <span class="mono id">{at.id}</span>
      {#if label}<span class="state {presence}">{label}</span>{/if}
    </div>
  </div>
  <div class="acts">
    {#if !me}
      <button class="btn" onclick={message}><Icon name="thread" size={15} /> Message</button>
      <button class="btn ghost" onclick={mention}><Icon name="at" size={15} /> Mention</button>
    {/if}
    <button class="btn ghost" onclick={copy}><Icon name={copied ? 'check' : 'link'} size={15} /> {copied ? 'Copied' : 'Copy ID'}</button>
  </div>
  {#if err}<p class="err" role="alert">{err}</p>{/if}
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 30; }
  .card { position: fixed; z-index: 31; width: min(300px, calc(100vw - 16px)); padding: 14px; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); outline: none; }
  .who { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; } .ids { display: grid; gap: 2px; min-width: 0; } b { font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .you { font-weight: 400; font-size: 12px; color: var(--muted); } .id { font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
  .state { font-size: 12px; display: inline-flex; align-items: center; gap: 6px; color: var(--muted); } .state::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--muted); } .state.online::before { background: var(--ok); } .state.unavailable::before { background: #e0a100; } .state.offline::before { background: transparent; box-shadow: inset 0 0 0 2px var(--muted); }
  .acts { display: flex; flex-wrap: wrap; gap: 8px; } .acts .btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; }
  .err { color: var(--danger); font-size: 12px; margin: 8px 0 0; }
</style>
