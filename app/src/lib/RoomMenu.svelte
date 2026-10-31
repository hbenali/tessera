<script lang="ts">
  import { t } from './i18n.svelte'
  import { tick } from 'svelte'
  import { chat } from './matrix.svelte'
  import { ui } from './ui.svelte'
  import Icon from './Icon.svelte'

  const at = ui.roomMenu!
  const room = $derived(chat.rooms.find((r) => r.id === at.id))
  let menu: HTMLElement | undefined = $state()
  let leaving = $state(false)
  let note = $state('')
  let left = $state(at.x)
  let top = $state(at.y)

  function close() {
    const back = at.opener
    ui.roomMenu = null
    back?.focus()
  }
  // Keep the menu on screen: measured after it renders, so its real size decides which way it opens.
  $effect(() => {
    const m = menu
    if (!m) return
    tick().then(() => {
      left = Math.max(8, Math.min(at.x, innerWidth - m.offsetWidth - 8))
      top = Math.max(8, at.y + m.offsetHeight > innerHeight - 8 ? at.y - m.offsetHeight : at.y)
      m.querySelector<HTMLElement>('[role^=menuitem]')?.focus()
    })
  })
  const items = () => [...(menu?.querySelectorAll<HTMLElement>('[role^=menuitem]') ?? [])]
  function key(e: KeyboardEvent) {
    const list = items()
    const i = list.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus() }
    else if (e.key === 'Home') { e.preventDefault(); list[0]?.focus() }
    else if (e.key === 'End') { e.preventDefault(); list.at(-1)?.focus() }
    else if (e.key === 'Tab') { e.preventDefault(); close() }
  }
  async function run(fn: () => Promise<unknown> | unknown, keepOpen = false) {
    try {
      await fn()
      if (!keepOpen) ui.roomMenu = null
    } catch (e) {
      note = e instanceof Error ? e.message : 'That did not work'
    }
  }
  async function copy() {
    await run(async () => {
      await navigator.clipboard.writeText(chat.permalink(at.id))
    })
  }
  async function details() {
    ui.roomMenu = null
    await chat.openRoom(at.id)
    ui.details = true
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={close} oncontextmenu={(e) => { e.preventDefault(); close() }}></div>
{#if room}
  <div class="menu" role="menu" aria-label="Options for {room.name}" tabindex="-1" bind:this={menu} style="left:{left}px;top:{top}px" onkeydown={key}>
    {#if leaving}
      <p class="ask">Leave {room.name}?</p>
      <button role="menuitem" class="danger" onclick={() => run(() => chat.leaveRoom(room.id))}><Icon name="logout" size={15} />{t("Leave room")}</button>
      <button role="menuitem" onclick={close}><Icon name="x" size={15} />Cancel</button>
    {:else}
      {#if room.unread > 0 || room.markedUnread}<button role="menuitem" onclick={() => run(() => chat.markRead(room.id))}><Icon name="checks" size={15} />{t("Mark as read")}</button>
      {:else}<button role="menuitem" onclick={() => run(() => chat.setMarkedUnread(room.id, true))}><Icon name="bell" size={15} />{t("Mark as unread")}</button>{/if}
      {#if room.notifs === 'mute'}
        <button role="menuitem" onclick={() => run(() => chat.setRoomNotifs(room.id, 'all'))}><Icon name="bell" size={15} />{t("Unmute")}</button>
      {:else}
        <button role="menuitem" onclick={() => run(() => chat.setRoomNotifs(room.id, 'mute'))}><Icon name="bellOff" size={15} />{t("Mute")}</button>
      {/if}
      {#if room.notifs === 'mentions'}
        <button role="menuitem" onclick={() => run(() => chat.setRoomNotifs(room.id, 'all'))}><Icon name="bell" size={15} />{t("Notify for all messages")}</button>
      {:else}
        <button role="menuitem" onclick={() => run(() => chat.setRoomNotifs(room.id, 'mentions'))}><Icon name="at" size={15} />{t("Mentions only")}</button>
      {/if}
      <button role="menuitem" onclick={() => run(() => chat.setQuiet(room.id, !chat.isQuiet(room.id)))}><Icon name="eyeOff" size={15} />{chat.isQuiet(room.id) ? 'Stop quiet reading' : 'Read quietly'}</button>
      <button role="menuitem" onclick={() => run(() => chat.setLowPriority(room.id, !room.lowPriority))}><Icon name="bellOff" size={15} />{room.lowPriority ? t('Remove from low priority') : t('Low priority')}</button>
      <button role="menuitem" onclick={() => run(() => chat.setFavourite(room.id, !room.favourite))}><Icon name="star" size={15} />{room.favourite ? t('Remove from favourites') : t('Add to favourites')}</button>
      <hr />
      <button role="menuitem" onclick={copy}><Icon name="link" size={15} />{t("Copy link")}</button>
      <button role="menuitem" onclick={async () => { ui.roomMenu = null; await chat.openRoom(at.id); chat.closeThread(); ui.roomSearch = true }}><Icon name="search" size={15} />{t("Search in room")}</button>
      <button role="menuitem" onclick={details}><Icon name="info" size={15} />{t("Room details")}</button>
      <hr />
      <button role="menuitem" class="danger" onclick={() => (leaving = true)}><Icon name="logout" size={15} />{t("Leave room")}</button>
    {/if}
    {#if note}<p class="note" role="alert">{note}</p>{/if}
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 30; }
  .menu { position: fixed; z-index: 31; min-width: 220px; max-width: 280px; padding: 6px; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow); outline: none; }
  button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border-radius: 6px; text-align: left; } button:hover, button:focus-visible { background: var(--tile); }
  hr { border: 0; border-top: 1px solid var(--line); margin: 4px 2px; }
  .danger { color: var(--danger); }
  .ask { margin: 6px 10px 8px; font-weight: 600; } .note { margin: 6px 10px; color: var(--danger); font-size: 12px; }
</style>
