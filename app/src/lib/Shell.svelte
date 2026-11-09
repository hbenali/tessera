<script lang="ts">
  import { chat } from './matrix.svelte'
  import { ui } from './ui.svelte'
  import Sidebar from './Sidebar.svelte'
  import Timeline from './Timeline.svelte'
  import Details from './Details.svelte'
  import ThreadPanel from './ThreadPanel.svelte'
  import RoomSearch from './RoomSearch.svelte'
  import Palette from './Palette.svelte'
  import Settings from './Settings.svelte'
  import NewRoom from './NewRoom.svelte'
  import Verification from './Verification.svelte'
  import RoomMenu from './RoomMenu.svelte'
  import UserCard from './UserCard.svelte'
  import CallPanel from './CallPanel.svelte'
  import ImageViewer from './ImageViewer.svelte'
  import ExportImage from './ExportImage.svelte'
  import ExportBar from './ExportBar.svelte'
  import { applyBadge, badgeCount } from './badge'
  import { pageTitle } from './pagetitle'
  import { isStandalone } from './installhelp'

  let palette = $state(false)
  const unread = $derived(chat.rooms.reduce((n, r) => n + (r.isSpace || r.invited ? 0 : r.unread), 0))
  $effect(() => {
    // The unread count stays first: the Tessera extension for eXo reads it from the start of the title.
    document.title = pageTitle(unread, chat.active?.name, isStandalone())
  })
  // The count on the installed app's icon (where the browser supports it): rooms that notify me, not muted ones.
  const badge = $derived(badgeCount(chat.rooms))
  $effect(() => { void applyBadge(chat.ready ? badge : 0) })
  // A shortcut or link asked for a screen: show it once the app is ready.
  $effect(() => {
    const p = ui.pending
    if (!p || !chat.ready) return
    if (p.action === 'search') palette = true
    else if (p.action === 'new') ui.open('room')
    else if (p.action === 'explore') ui.open('explore')
    else if (p.action === 'join') ui.open('join')
    if (p.matrix) void chat.openMatrixLink(p.matrix)
    // a view is applied by the list itself (Sidebar); leave it there until it has
    ui.pending = p.view ? { view: p.view } : null
  })
  function key(e: KeyboardEvent) {
    // Ctrl+Shift+F searches the open room; plain Ctrl+F stays the browser's own find.
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f' && chat.activeRoom) {
      e.preventDefault()
      ui.roomSearch = !ui.roomSearch
      if (ui.roomSearch) chat.closeThread()
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      palette = !palette
    }
  }
</script>

<svelte:window onkeydown={key} />

{#if chat.offline}<div class="offline" role="status">You are offline. Messages you write wait here and are sent when you are back online.</div>{/if}
{#if !chat.ready}<div class="syncbar" role="status" aria-label="Syncing"></div>{/if}
<div class="shell" class:has-room={!!chat.activeRoom} class:with-details={(ui.details || ui.roomSearch || !!chat.threadRoot) && !!chat.activeRoom}>
  <Sidebar onsearch={() => (palette = true)} />
  <Timeline />
  {#if chat.activeRoom && chat.threadRoot}<ThreadPanel />{:else if ui.roomSearch && chat.activeRoom}<RoomSearch />{:else if ui.details && chat.activeRoom}<Details />{/if}
</div>
{#if palette}<Palette onclose={() => (palette = false)} />{/if}
{#if ui.modal === 'settings'}<Settings />{/if}
{#if ui.modal === 'new'}<NewRoom />{/if}
<Verification />
{#if ui.roomMenu}<RoomMenu />{/if}
{#if ui.userCard}<UserCard />{/if}
<CallPanel />
{#if ui.viewer}<ImageViewer />{/if}
{#if ui.exportImage && chat.activeRoom}{#if ui.exportDialog}<ExportImage />{:else}<ExportBar />{/if}{/if}

<style>
  /* A thin moving bar along the top while the first sync runs. */
  .offline { position: fixed; z-index: 31; top: 8px; left: 50%; transform: translateX(-50%); max-width: calc(100vw - 24px); padding: 7px 14px; border-radius: 99px; background: var(--text); color: var(--bg); font-size: 13px; box-shadow: var(--shadow); text-align: center; }
  .syncbar { position: fixed; z-index: 30; top: 0; left: 0; right: 0; height: 2px; overflow: hidden; background: color-mix(in srgb, var(--accent) 18%, transparent); }
  .syncbar::after { content: ''; position: absolute; inset: 0 auto 0 0; width: 35%; background: var(--accent); animation: sync 1.1s ease-in-out infinite; }
  @keyframes sync { from { transform: translateX(-100%); } to { transform: translateX(300%); } }
  @media (prefers-reduced-motion: reduce) { .syncbar::after { animation: none; width: 100%; opacity: .5; } }
  /* The app fills the window and scrolls inside its own panes; the page itself must never scroll. */
  :global(html), :global(body) { overflow: hidden; }
  .shell { height: 100%; display: grid; grid-template-rows: minmax(0, 1fr); overflow: hidden; grid-template-columns: 320px 1fr; } .shell.with-details { grid-template-columns: 320px 1fr 300px; }
  @media (max-width: 720px) {
    .shell, .shell.with-details { grid-template-columns: 1fr; }
    .shell.with-details :global(main.main) { display: none; }
    /* Only the conversation list gives way to an open room; the side panels (search, details, thread) must stay. */
    .shell.has-room :global(aside.sidebar) { display: none; }
    .shell:not(.has-room) :global(main.main) { display: none; }
  }
</style>
