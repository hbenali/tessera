<script lang="ts">
  import { t } from './i18n.svelte'
  import { clearShared } from './sharedfiles'
  import { chat } from './matrix.svelte'
  import { shortTime, ui } from './ui.svelte'
  import Avatar from './Avatar.svelte'
  import Icon from './Icon.svelte'
  import Skeleton from './Skeleton.svelte'
  import ListDisplay from './ListDisplay.svelte'
  import { AVATAR_PX, WIDTH, groupRooms, type SectionId } from './listprefs'
  import type { RoomItem } from './matrix.svelte'
  import type { ComponentProps } from 'svelte'
  let { onsearch }: { onsearch: () => void } = $props()

  type View = 'all' | 'unread' | 'mentions' | 'favourites' | 'people' | 'rooms'
  let view = $state<View>('all')
  let switcher = $state(false)
  let display = $state(false)
  // How the list looks (per browser). The icon-only strip and the sections need a wide window; a phone always gets the full list.
  const L = $derived(ui.list)
  let narrow = $state(false)
  $effect(() => {
    const q = matchMedia('(max-width: 720px)')
    narrow = q.matches
    const on = () => (narrow = q.matches)
    q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  })
  const rail = $derived(L.rail && !narrow)
  const AV = $derived(rail ? 38 : AVATAR_PX[L.avatar])
  const toggleSection = (id: SectionId) => ui.setList({ folded: L.folded.includes(id) ? L.folded.filter((x) => x !== id) : [...L.folded, id] })
  // Drag the right edge to resize; arrow keys move it by a step; a double click resets it.
  let box: HTMLElement | undefined = $state()
  function startResize(e: PointerEvent) {
    if (!box) return
    e.preventDefault()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const left = box.getBoundingClientRect().left
    const move = (m: PointerEvent) => ui.setList({ width: m.clientX - left })
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up) }
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up)
  }
  function resizeKey(e: KeyboardEvent) {
    const d = e.key === 'ArrowLeft' ? -WIDTH.step : e.key === 'ArrowRight' ? WIDTH.step : 0
    if (d) { e.preventDefault(); ui.setList({ width: L.width + d }) }
    else if (e.key === 'Home') { e.preventDefault(); ui.setList({ width: WIDTH.min }) }
    else if (e.key === 'End') { e.preventDefault(); ui.setList({ width: WIDTH.max }) }
  }
  let status = $state(false)
  const STATUSES = [['online', 'Online'], ['unavailable', 'Away'], ['offline', 'Invisible']] as const
  const untilLabel = (t: number) => new Date(t).toLocaleString([], new Date(t).toDateString() === new Date().toDateString() ? { hour: '2-digit', minute: '2-digit' } : { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  const tomorrow8 = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return d.getTime() }
  const DND_CHOICES: [string, () => number | null][] = [
    ['For 30 minutes', () => Date.now() + 30 * 60_000],
    ['For 1 hour', () => Date.now() + 3600_000],
    ['For 8 hours', () => Date.now() + 8 * 3600_000],
    ['Until tomorrow 08:00', tomorrow8],
    ['Until I turn it off', () => null],
  ]
  const setStatus = (p: (typeof STATUSES)[number][0]) => { chat.setStatus(p); status = false }

  const PREVIEW_ICON: Partial<Record<RoomItem['previewKind'], ComponentProps<typeof Icon>['name']>> = { image: 'file', video: 'play', voice: 'mic', audio: 'mic', file: 'clip', encrypted: 'lock' }
  const ORDERS = [['activity', 'Latest activity'], ['unread', 'Needs attention first'], ['name', 'A to Z']] as const
  const invites = $derived(chat.rooms.filter((r) => r.invited))
  const current = $derived(chat.spaces.find((s) => s.id === chat.activeSpace))
  const rooms = $derived(
    chat.rooms
      .filter((r) => !r.isSpace && !r.invited)
      .filter((r) => !chat.activeSpace || r.parents.includes(chat.activeSpace))
      .filter((r) => matches(view, r)),
  )
  const sections = $derived(L.sections && !rail ? groupRooms(rooms, L.folded) : null)
  const matches = (v: View, r: RoomItem) =>
    v === 'unread' ? (r.unread > 0 && r.notifs !== 'mute') || r.markedUnread : v === 'mentions' ? r.highlight > 0 : v === 'favourites' ? r.favourite : v === 'people' ? r.isDM : v === 'rooms' ? !r.isDM : true
  const chats = $derived(chat.rooms.filter((r) => !r.isSpace && !r.invited))
  const count = (v: View) => chats.filter((r) => matches(v, r)).length
  const VIEWS: [View, string, ComponentProps<typeof Icon>['name']][] = [
    ['all', 'All conversations', 'hash'],
    ['unread', 'Unread', 'bell'],
    ['mentions', 'Mentions', 'at'],
    ['favourites', 'Favourites', 'star'],
    ['people', 'People', 'users2'],
    ['rooms', 'Rooms', 'users'],
  ]
  const title = $derived(current?.name ?? VIEWS.find((v) => v[0] === view)![1])
  $effect(() => { const p = ui.pending; if (p?.view && chat.ready) { pickView(p.view); ui.pending = null } })
  const pickView = (v: View) => { view = v; chat.activeSpace = null; switcher = false }
  const pick = (id: string) => { chat.activeSpace = id; view = 'all'; switcher = false }
</script>

<!-- Escape, or a press anywhere else, closes the view and status menus -->
<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && (switcher || status)) { switcher = false; status = false } }} onpointerdown={(e) => { if ((switcher || status) && !(e.target as Element)?.closest?.('.ws, .mewrap')) { switcher = false; status = false } }} />
{#snippet roomRow(r: RoomItem)}
      <div class="item">
        <button class="row" class:rail aria-label={rail ? r.name : undefined} title={rail ? r.name : undefined} class:active={chat.activeRoom === r.id} class:unread={(r.unread > 0 && r.notifs !== 'mute') || r.markedUnread} class:muted={r.notifs === 'mute'} onclick={() => { if (ui.shared || ui.sharedFiles) { const text = ui.shared ?? ''; const files = ui.sharedFiles > 0; ui.shared = null; ui.sharedFiles = 0; chat.shareTo(r.id, text, files) } else chat.openRoom(r.id) }} oncontextmenu={(e) => { e.preventDefault(); ui.openRoomMenu(r.id, e.clientX, e.clientY, e.currentTarget) }}>
          <Avatar name={r.name} size={AV} round={r.isDM} src={r.avatar} presence={r.dmUser ? (chat.presenceOf(r.dmUser) ?? 'offline') : undefined} />
          {#if rail && (r.unread || r.markedUnread)}<span class="rbadge" class:hl={r.highlight > 0 && r.notifs !== 'mute'} class:quiet={r.notifs === 'mute'} aria-hidden="true">{r.unread && (L.badge === 'count' || (r.highlight > 0 && r.notifs !== 'mute')) ? (r.unread > 99 ? '99+' : r.unread) : ''}</span><span class="sr">{r.unread ? `${r.unread} unread` : 'Marked as unread'}</span>{/if}
          <span class="body">
            <span class="top">
              <span class="name">{r.name}</span>
              {#if L.icons}
              {#if r.favourite}<span class="lock fav" title="Favourite"><Icon name="star" size={12} /><span class="sr">Favourite</span></span>{/if}
              {#if r.encrypted}<span class="lock" title="End-to-end encrypted"><Icon name="lock" size={12} /></span>{/if}
              {#if chat.isQuiet(r.id)}<span class="lock" title="Quiet reading"><Icon name="eyeOff" size={12} /><span class="sr">Quiet reading</span></span>{/if}
            {#if r.notifs === 'mute'}<span class="lock" title="Notifications are muted"><Icon name="bellOff" size={12} /><span class="sr">Muted</span></span>{:else if r.notifs === 'mentions'}<span class="lock" title="Only mentions notify you"><Icon name="at" size={12} /><span class="sr">Mentions only</span></span>{/if}
              {/if}
              <span class="time">{r.lastTs ? shortTime(r.lastTs) : ''}</span>
              {#if !L.previews}{@render badges(r)}{/if}
            </span>
            {#if L.previews}
            <span class="bottom">
              {#if r.typing}<span class="preview typing" aria-live="polite">typing<i></i><i></i><i></i></span>{:else}{#if r.draft && chat.activeRoom !== r.id}<span class="preview"><span class="draft">{t("Draft:")}</span> {r.draft}</span>{:else}<span class="preview">{#if PREVIEW_ICON[r.previewKind]}<Icon name={PREVIEW_ICON[r.previewKind]!} size={13} />{/if}{r.preview || (r.previewLoading ? '' : r.topic ? r.topic : t('No messages yet'))}</span>{/if}{/if}
              {@render badges(r)}
            </span>
            {/if}
          </span>
        </button>
        <button class="more icon-btn" aria-label="Options for {r.name}" aria-haspopup="menu" onclick={(e) => { const b = e.currentTarget.getBoundingClientRect(); ui.openRoomMenu(r.id, b.left, b.bottom + 4, e.currentTarget) }}><Icon name="more" size={16} /></button>
      </div>
{/snippet}

{#snippet badges(r: RoomItem)}
  {#if r.markedUnread && !r.unread}<span class="badge dotbadge" title="Marked as unread"><span class="sr">Marked as unread</span></span>{/if}
  {#if r.unread}{@const hl = r.highlight > 0 && r.notifs !== 'mute'}<span class="badge" class:hl class:dot={L.badge === 'dot' && !hl} class:quiet={r.notifs === 'mute'}>{#if L.badge === 'dot' && !hl}<span class="sr">{r.unread} unread</span>{:else}{r.unread}{/if}</span>{/if}
{/snippet}

<aside class="sidebar" class:rail aria-label="Conversations" bind:this={box} data-rows={L.rows}>
  <header>
    <div class="ws">
      <button class="switch" onclick={() => (switcher = !switcher)} aria-expanded={switcher} aria-haspopup="listbox">
        {#if current}
          <Avatar name={current.name} size={28} src={current.avatar} />
        {:else if view === 'all'}
          <!-- the Tessera mark: four tiles in the same colours as the avatar tiles -->
          <svg class="mark" viewBox="0 0 512 512" width="28" height="28" aria-hidden="true"><rect width="512" height="512" rx="112" fill="#0f1115" /><rect x="112" y="112" width="140" height="140" rx="26" fill="#f08a72" /><rect x="268" y="112" width="140" height="140" rx="26" fill="#8f9dff" /><rect x="112" y="268" width="140" height="140" rx="26" fill="#52c2b2" /><rect x="268" y="268" width="140" height="140" rx="26" fill="#efc352" /></svg>
        {:else}
          <span class="viewicon" aria-hidden="true"><Icon name={VIEWS.find((v) => v[0] === view)![2]} size={16} /></span>
        {/if}
        <span class="wsname">{t(title)}</span>
        <Icon name="chevron" size={14} />
      </button>
      {#if switcher}
        <div class="menu" role="listbox" aria-label="Show">
          <div role="group" aria-label="Views">
            {#each VIEWS as [v, label, icon] (v)}
              {@const on = !chat.activeSpace && view === v}
              <button role="option" aria-selected={on} onclick={() => pickView(v)}><Icon name={icon} size={15} />{t(label)}<span class="n">{v === 'all' ? '' : count(v) || ''}</span>{#if on}<Icon name="check" size={14} />{/if}</button>
            {/each}
          </div>
          <div role="group" aria-label="Read state">
            <button role="option" aria-selected="false" disabled={!rooms.some((r) => r.unread > 0 || r.markedUnread)} onclick={async () => { switcher = false; await chat.markAllRead(rooms.map((r) => r.id)) }}><Icon name="checks" size={15} />{t("Mark all as read")}{#if rooms.filter((r) => r.unread > 0 || r.markedUnread).length}<span class="n">{rooms.filter((r) => r.unread > 0 || r.markedUnread).length}</span>{/if}</button>
          </div>
          <div role="group" aria-label="Sort by"><span class="grp" aria-hidden="true">{t("Sort by")}</span>
            {#each ORDERS as [o, label] (o)}
              <button role="option" aria-selected={chat.roomOrder === o} onclick={() => { chat.setRoomOrder(o); switcher = false }}>{t(label)}{#if chat.roomOrder === o}<Icon name="check" size={14} />{/if}</button>
            {/each}
          </div>
          {#if chat.spaces.length}
            <div role="group" aria-label="Spaces"><span class="grp" aria-hidden="true">{t("Spaces")}</span>
              {#each chat.spaces as s (s.id)}
                <button role="option" aria-selected={chat.activeSpace === s.id} onclick={() => pick(s.id)}><Avatar name={s.name} size={20} src={s.avatar} />{s.name}{#if chat.activeSpace === s.id}<Icon name="check" size={14} />{/if}</button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>
    <span class="hbtns">
      <button class="icon-btn" class:on={display} onclick={() => (display = !display)} aria-label={t('List display')} aria-haspopup="dialog" aria-expanded={display} title={t('List display')}><Icon name="sliders" /></button>
      <button class="icon-btn" onclick={() => ui.open('room')} aria-label="New room or message" title="New room or message"><Icon name="plus" /></button>
    </span>
    {#if rail}<button class="icon-btn full" onclick={() => ui.setList({ rail: false })} aria-label={t('Show the full room list')} title={t('Show the full room list')}><Icon name="sidebar" /></button>{/if}
    {#if display}<ListDisplay {rail} onclose={() => (display = false)} />{/if}
  </header>

  <button class="search" onclick={onsearch}><Icon name="search" size={15} /><span>{t("Search")}</span><kbd class="mono">Ctrl K</kbd></button>


  {#if ui.shared || ui.sharedFiles}
    <div class="share" role="status"><b>Share to…</b><span class="what">{(ui.shared ?? '').slice(0, 120)}{#if ui.sharedFiles}{ui.shared ? ' · ' : ''}{ui.sharedFiles} {ui.sharedFiles === 1 ? 'file' : 'files'}{/if}</span><span class="hint">Pick a conversation below.</span><button class="btn ghost sm" onclick={() => { ui.shared = null; ui.sharedFiles = 0; clearShared(); try { sessionStorage.removeItem('tessera.share'); sessionStorage.removeItem('tessera.share.files') } catch { /* nothing */ } }}>Cancel</button></div>
  {/if}
  <nav class="list" aria-label="Rooms" data-rows={L.rows}>
    {#each invites as r (r.id)}
      <div class="invite">
        <Avatar name={r.name} size={36} src={r.avatar} />
        <div class="meta"><b>{r.name}</b><span>{t("Invitation")}</span></div>
        <button class="btn" onclick={() => chat.acceptInvite(r.id)}>{t("Join")}</button>
        <button class="icon-btn" onclick={() => chat.declineInvite(r.id)} aria-label="Decline invitation"><Icon name="x" size={16} /></button>
      </div>
    {/each}
    {#if sections}
      {#each sections as sec (sec.id)}
        <button class="sechead" aria-expanded={!sec.folded} onclick={() => toggleSection(sec.id)}>
          <Icon name="chevron" size={12} /><span class="sname">{t(sec.label)}</span>
          {#if sec.folded && sec.unread}<span class="badge sn">{sec.unread}</span>{/if}<span class="n">{sec.items.length}</span>
        </button>
        {#if !sec.folded}{#each sec.items as r (r.id)}{@render roomRow(r)}{/each}{/if}
      {/each}
    {:else}
      {#each rooms as r (r.id)}{@render roomRow(r)}{/each}
    {/if}
    {#if !chat.ready && !chat.rooms.length}
      <Skeleton variant="list" />
    {:else if !rooms.length && !invites.length}
      <p class="empty">{view === 'unread' ? t('You are all caught up.') : view === 'mentions' ? t('No one has mentioned you.') : view === 'favourites' ? 'Star a room in its details to find it here.' : t('Nothing here yet.')}</p>
    {/if}
  </nav>

  <footer>
    
    <div class="mewrap">
      <button class="me" title="Change your status" onclick={() => (status = !status)} aria-expanded={status} aria-haspopup="menu">
        <Avatar name={chat.me.name || chat.userId.replace('@', '')} size={28} round src={chat.me.avatar} presence={chat.myStatus} /><span>{chat.me.name || chat.userId}</span>{#if chat.dndActive}<span class="dnd" title={chat.manualDnd ? 'Do not disturb is on' : 'Quiet hours are on'}><Icon name="moon" size={14} /><span class="sr">{chat.manualDnd ? 'Do not disturb is on' : 'Quiet hours are on'}</span></span>{/if}
      </button>
      {#if status}
        <div class="menu up" role="menu">
          {#each STATUSES as [v, lbl] (v)}
            <button role="menuitemradio" aria-checked={chat.myStatus === v} onclick={() => setStatus(v)}><span class="pip {v}"></span>{t(lbl)}{#if chat.myStatus === v}<Icon name="check" size={14} />{/if}</button>
          {/each}
          <div class="grp" role="presentation" aria-hidden="true">{t("Do not disturb")}</div>
          {#if chat.quietNow && !chat.manualDnd}<button role="menuitem" class="dndnow" aria-disabled="true" tabindex="-1">Quiet hours are on until {chat.schedule.to}</button>{/if}
          {#if chat.manualDnd}
            <button role="menuitem" class="dndnow" aria-disabled="true" tabindex="-1">On {chat.dnd?.until ? `until ${untilLabel(chat.dnd.until)}` : 'until you turn it off'}</button>
            <button role="menuitem" onclick={() => { chat.endDnd(); status = false }}><Icon name="bell" size={14} />{t("Turn off")}</button>
          {:else}
            {#each DND_CHOICES as [label, until] (label)}
              <button role="menuitem" onclick={() => { chat.setDnd(until()); status = false }}><Icon name="moon" size={14} />{label}</button>
            {/each}
          {/if}
          <div class="sep" role="separator"></div>
          <div class="grp" role="presentation" aria-hidden="true">{t("Accounts")}</div>
          {#each chat.accounts.filter((a) => a.userId !== chat.userId) as a (a.userId)}
            <button role="menuitem" onclick={() => chat.switchTo(a.userId)}><Avatar name={a.name || a.userId} size={20} round />{t("Switch to")} {a.name || a.userId}</button>
          {/each}
          <button role="menuitem" onclick={() => chat.addAccount()}><Icon name="plus" size={14} />{t("Add an account")}</button>
          <div class="sep" role="separator"></div>
          <button role="menuitem" onclick={() => { status = false; ui.modal = 'settings' }}><Icon name="sliders" size={14} />{t("Profile and settings")}</button>
        </div>
      {/if}
    </div>
    <button class="icon-btn" onclick={() => ui.open('explore')} aria-label="Explore public rooms" title="Explore public rooms"><Icon name="users" /></button>
    <button class="icon-btn" onclick={() => ui.open('join')} aria-label="Join a room by address" title="Join a room"><Icon name="hash" /></button>
    <button class="icon-btn" onclick={() => (ui.modal = 'settings')} aria-label="Settings" title="Settings"><Icon name="sliders" /></button>
  </footer>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  {#if !rail}<div class="resize" role="separator" aria-orientation="vertical" aria-label={t('Resize the room list')} aria-valuenow={L.width} aria-valuemin={WIDTH.min} aria-valuemax={WIDTH.max} tabindex="0" onpointerdown={startResize} onkeydown={resizeKey} ondblclick={() => ui.setList({ width: WIDTH.dflt })}></div>{/if}
</aside>

<style>
  aside { position: relative; display: flex; flex-direction: column; min-width: 0; height: 100%; background: var(--panel); border-right: 1px solid var(--line); }
  .hbtns { display: inline-flex; flex: none; } header { position: relative; } .icon-btn.on { color: var(--accent); }
  /* Row density */
  .list[data-rows='compact'] .row { padding: 4px 8px; } .list[data-rows='large'] .row { padding: 12px 10px; }
  .list[data-rows='compact'] .body { gap: 0; }
  .badge.dot { min-width: 9px; width: 9px; height: 9px; padding: 0; line-height: 9px; font-size: 0; }
  /* Section headings */
  .sechead { display: flex; align-items: center; gap: 6px; width: 100%; padding: 10px 8px 4px; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); text-align: left; } .sechead:hover { color: var(--text); }
  .sechead :global(svg) { transition: transform .12s; } .sechead[aria-expanded='false'] :global(svg) { transform: rotate(-90deg); } .sname { flex: 1; } .sn { text-transform: none; letter-spacing: 0; } @media (prefers-reduced-motion: reduce) { .sechead :global(svg) { transition: none; } }
  /* The drag handle on the right edge */
  .resize { position: absolute; top: 0; bottom: 0; right: -3px; width: 7px; cursor: col-resize; z-index: 3; touch-action: none; } .resize:hover, .resize:focus-visible, .resize:active { background: color-mix(in srgb, var(--accent) 45%, transparent); outline: none; } @media (max-width: 720px) { .resize { display: none; } }
  /* The icon-only strip (wide windows only: a phone always shows the full list) */
  .rbadge { position: absolute; top: 1px; right: 3px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; background: var(--muted); color: var(--bg); font-size: 10px; font-weight: 700; line-height: 16px; text-align: center; box-shadow: 0 0 0 2px var(--panel); box-sizing: border-box; } .rbadge.hl { background: var(--accent); color: var(--accent-ink); } .rbadge.quiet { background: var(--tile); color: var(--muted); } .rbadge:empty { min-width: 10px; width: 10px; height: 10px; padding: 0; top: 4px; right: 6px; }
  .full { display: none; }
  @media (min-width: 721px) {
    .rail header { flex-direction: column; justify-content: flex-start; align-items: center; gap: 4px; padding: 12px 4px 8px; } .rail .wsname, .rail .switch > :global(svg:last-child) { display: none; } .rail .switch { padding: 4px; } .rail .hbtns { flex-direction: column; align-items: center; gap: 2px; }
    .rail .search { margin: 0 8px 8px; justify-content: center; padding: 8px 0; } .rail .search span, .rail .search kbd { display: none; }
    .rail .list { padding: 0 4px 8px; } .rail .row { position: relative; justify-content: center; padding: 6px 0; gap: 0; } .rail .body, .rail .more { display: none; }
    .rail .invite .meta, .rail .invite .btn, .rail .invite .icon-btn { display: none; } .rail .invite { justify-content: center; padding: 6px 0; }
    .rail footer { flex-direction: column; align-items: center; padding: 8px 4px; } .rail .full { display: inline-grid; color: var(--accent); } .rail .me { justify-content: center; padding: 4px; } .rail .me span, .rail .dnd { display: none; }
    .rail .sechead { display: none; }
  }
  header { display: flex; align-items: center; justify-content: space-between; padding: 12px 12px 8px; }
  .ws { position: relative; min-width: 0; }
  .switch { display: flex; align-items: center; gap: 9px; padding: 4px 8px 4px 4px; border-radius: 10px; max-width: 100%; } .switch:hover, .switch[aria-expanded=true] { background: var(--tile); }
  .mark { flex: none; border-radius: 8px; box-shadow: 0 0 0 1px var(--line); transition: transform .15s; } .switch:hover .mark { transform: rotate(-6deg) scale(1.05); }
  .viewicon { flex: none; width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; background: color-mix(in srgb, var(--accent) 18%, var(--tile)); color: var(--accent); }
  @media (prefers-reduced-motion: reduce) { .mark { transition: none; } .switch:hover .mark { transform: none; } }
  .wsname { font-weight: 700; font-size: 15px; letter-spacing: -.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .menu { position: absolute; z-index: 5; top: calc(100% + 6px); left: 0; min-width: 220px; padding: 6px; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow); }
  .menu button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 8px; border-radius: 6px; text-align: left; } .menu button:hover { background: var(--tile); } .menu :global(svg:last-child) { margin-left: auto; color: var(--accent); }
  .search { display: flex; align-items: center; gap: 8px; margin: 0 12px 8px; padding: 8px 10px; border-radius: 8px; background: var(--tile); color: var(--muted); } .search:hover { color: var(--text); }
  .search span { flex: 1; text-align: left; } kbd { font-size: 11px; } @media (hover: none) { kbd { display: none; } }
  .list { position: relative; flex: 1; overflow-y: auto; padding: 0 6px 8px; }
  .item { position: relative; } .more { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); opacity: 0; background: var(--panel); box-shadow: 0 0 0 1px var(--line); width: 28px; height: 28px; } .item:hover .more, .item:focus-within .more, .more:focus-visible { opacity: 1; } @media (hover: none) { .more { opacity: 1; width: 24px; height: 24px; right: 2px; top: 10px; transform: none; background: none; box-shadow: none; } }
  .row { display: flex; gap: 10px; width: 100%; padding: 8px; border-radius: 10px; text-align: left; align-items: center; } .row:hover { background: var(--tile); } .row.active { background: var(--tile); box-shadow: inset 2px 0 0 var(--accent); }
  .body { flex: 1; min-width: 0; display: grid; gap: 1px; }
  .top, .bottom { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; } .unread .name { font-weight: 700; }
  .lock { color: var(--muted); display: grid; } .time { color: var(--muted); font-size: 11px; flex: none; } .unread .time { color: var(--accent); }
  .preview { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 13px; } .unread .preview { color: var(--text); }
  .badge { flex: none; min-width: 20px; padding: 0 6px; border-radius: 10px; background: var(--muted); color: var(--bg); font-size: 11px; font-weight: 700; text-align: center; line-height: 20px; } .badge.hl { background: var(--accent); color: var(--accent-ink); }
  .invite { display: flex; align-items: center; gap: 10px; padding: 8px; margin: 0 0 4px; border-radius: 10px; border: 1px dashed var(--accent); } .invite .meta { flex: 1; display: grid; min-width: 0; } .invite .meta span { color: var(--muted); font-size: 12px; } .invite .btn { padding: 5px 12px; }
  .muted .name, .muted .preview { opacity: .6; } .badge.quiet { background: transparent; color: var(--muted); box-shadow: inset 0 0 0 1px var(--muted); } .fav { color: #e8a317; } .fav :global(svg) { fill: currentColor; }
  .grp { display: block; margin: 8px 8px 2px; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
  .dnd { margin-left: auto; display: inline-flex; color: var(--accent); flex: none; }  .menu .sep { border-top: 1px solid var(--line); margin: 4px 2px; } .menu button.dndnow { color: var(--muted); font-size: 12px; cursor: default; } .menu button.dndnow:hover { background: none; }
  .n { margin-left: auto; color: var(--muted); font-size: 12px; } .menu .n + :global(svg) { margin-left: 8px; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .empty { padding: 24px 12px; color: var(--muted); text-align: center; }
  footer { display: flex; align-items: center; gap: 2px; padding: 8px 10px; border-top: 1px solid var(--line); }
  .mewrap { position: relative; flex: 1; min-width: 0; } .menu.up { top: auto; bottom: calc(100% + 6px); min-width: 200px; } .pip { width: 10px; height: 10px; border-radius: 50%; background: var(--muted); } .pip.online { background: var(--ok); } .pip.unavailable { background: #e0a100; } .pip.offline { background: transparent; border: 2px solid var(--muted); box-sizing: border-box; }
  .draft { color: var(--danger, #e5484d); font-weight: 600; } .preview :global(svg) { vertical-align: -2px; margin-right: 4px; }
  .dotbadge { min-width: 10px; width: 10px; height: 10px; padding: 0; line-height: 10px; background: var(--accent); }
  .share { display: grid; gap: 4px; margin: 0 12px 8px; padding: 10px 12px; border-radius: 10px; border: 1px dashed var(--accent); background: var(--tile); } .share .what { color: var(--muted); font-size: 13px; overflow-wrap: anywhere; } .share .hint { font-size: 12px; color: var(--muted); } .share .sm { justify-self: start; padding: 3px 10px; }
  .typing { color: var(--accent); } .typing i { display: inline-block; width: 3px; height: 3px; margin-left: 2px; border-radius: 50%; background: currentColor; animation: blip 1.2s infinite; } .typing i:nth-child(2) { animation-delay: .2s; } .typing i:nth-child(3) { animation-delay: .4s; } @keyframes blip { 0%, 60%, 100% { opacity: .25; } 30% { opacity: 1; } } @media (prefers-reduced-motion: reduce) { .typing i { animation: none; } }
  .me { flex: 1;width: 100%; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 4px; border-radius: 8px; text-align: left; color: var(--muted); } .me:hover { background: var(--tile); color: var(--text); } .me span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
</style>
