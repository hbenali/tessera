<script lang="ts">
  type Name = 'hash' | 'lock' | 'send' | 'clip' | 'search' | 'plus' | 'smile' | 'reply' | 'edit' | 'chevron' | 'x' | 'users' | 'info' | 'back' | 'shield' | 'sliders' | 'check' | 'logout' | 'trash' | 'bell'
  let { name, size = 18 }: { name: Name; size?: number } = $props()
  const paths: Record<Name, string[]> = {
    hash: ['M4 9h16', 'M4 15h16', 'M10 3 8 21', 'M16 3l-2 18'],
    lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
    send: ['M22 2 11 13', 'M22 2l-7 20-4-9-9-4z'],
    clip: ['m21.4 11-9.2 9.2a6 6 0 0 1-8.5-8.5l8.6-8.6a4 4 0 0 1 5.6 5.7l-8.6 8.5a2 2 0 0 1-2.8-2.8l8.5-8.5'],
    search: ['M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z', 'm21 21-4.3-4.3'],
    plus: ['M5 12h14', 'M12 5v14'],
    smile: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M8 14s1.5 2 4 2 4-2 4-2', 'M9 9h.01', 'M15 9h.01'],
    reply: ['m9 17-5-5 5-5', 'M20 18v-2a4 4 0 0 0-4-4H4'],
    edit: ['M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z'],
    chevron: ['m6 9 6 6 6-6'],
    x: ['M18 6 6 18', 'm6 6 12 12'],
    users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M22 21v-2a4 4 0 0 0-3-3.9', 'M16 3.1a4 4 0 0 1 0 7.8'],
    info: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M12 16v-4', 'M12 8h.01'],
    back: ['m12 19-7-7 7-7', 'M19 12H5'],
    shield: ['M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6z', 'm9 12 2 2 4-4'],
    sliders: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M2 14h4', 'M10 8h4', 'M18 16h4'],
    check: ['m5 12 5 5L20 7'],
    trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 11v6', 'M14 11v6'],
    bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M13.7 21a2 2 0 0 1-3.4 0'],
    logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'm16 17 5-5-5-5', 'M21 12H9'],
  }
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#each paths[name] as d (d)}<path {d} />{/each}
</svg>
