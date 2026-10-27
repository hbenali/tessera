<script lang="ts">
  import { chat } from './matrix.svelte'
  import { ui } from './ui.svelte'
  import Sidebar from './Sidebar.svelte'
  import Timeline from './Timeline.svelte'
  import Palette from './Palette.svelte'
  import Settings from './Settings.svelte'
  import NewRoom from './NewRoom.svelte'
  import Verification from './Verification.svelte'

  let palette = $state(false)
  function key(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      palette = !palette
    }
  }
</script>

<svelte:window onkeydown={key} />

<div class="shell" class:has-room={!!chat.activeRoom}>
  <Sidebar onsearch={() => (palette = true)} />
  <Timeline />
</div>
{#if palette}<Palette onclose={() => (palette = false)} />{/if}
{#if ui.modal === 'settings'}<Settings />{/if}
{#if ui.modal === 'new-room'}<NewRoom />{/if}
{#if ui.modal === 'join-room'}<NewRoom join />{/if}
<Verification />

<style>
  .shell { height: 100%; display: grid; grid-template-columns: 272px 1fr; }
  @media (max-width: 720px) {
    .shell { grid-template-columns: 1fr; }
    .shell.has-room :global(aside) { display: none; }
    .shell:not(.has-room) :global(main.main) { display: none; }
  }
</style>
