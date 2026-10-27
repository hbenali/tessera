<script lang="ts">
  import { initials, tone } from './ui.svelte'
  let { name, size = 36, round = false }: { name: string; size?: number; round?: boolean } = $props()
</script>

<span class="av" class:round style="--s:{size}px;background:var(--t{tone(name)})" aria-hidden="true">{initials(name)}</span>

<style>
  .av { flex: none; width: var(--s); height: var(--s); border-radius: calc(var(--s) * .3); display: grid; place-items: center; color: var(--ink); font: 700 calc(var(--s) * .38)/1 var(--sans); letter-spacing: -.02em; user-select: none; }
  .av.round { border-radius: 50%; }
</style>
