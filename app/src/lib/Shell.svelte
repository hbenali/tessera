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
  import ImageViewer from './ImageViewer.svelte'

  let palette = $state(false)
  const unread = $derived(chat.rooms.reduce((n, r) => n + (r.isSpace || r.invited ? 0 : r.unread), 0))
  $effect(() => {
    document.title = unread ? `(${unread}) Tessera` : 'Tessera'
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
{#if ui.viewer}<ImageViewer />{/if}

<style>
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
