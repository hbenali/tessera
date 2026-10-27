<script lang="ts">
  import { chat } from './matrix.svelte'
  import Sidebar from './Sidebar.svelte'
  import Timeline from './Timeline.svelte'
  import Palette from './Palette.svelte'

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

<style>
  .shell { height: 100%; display: grid; grid-template-columns: 300px 1fr; }
  @media (max-width: 720px) {
    .shell { grid-template-columns: 1fr; }
    .shell.has-room :global(aside) { display: none; }
    .shell:not(.has-room) :global(section.main) { display: none; }
  }
</style>
