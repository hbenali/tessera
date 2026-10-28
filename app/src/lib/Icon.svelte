<script lang="ts">
  type Name = 'pin' | 'hash' | 'lock' | 'send' | 'clip' | 'search' | 'plus' | 'smile' | 'reply' | 'edit' | 'chevron' | 'x' | 'users' | 'info' | 'back' | 'shield' | 'sliders' | 'check' | 'logout' | 'trash' | 'clock' | 'checks' | 'alert' | 'qr' | 'link' | 'bellOff' | 'star' | 'at' | 'users2' | 'more' | 'eyeOff' | 'moon' | 'file' | 'mic' | 'play' | 'pause' | 'zoomIn' | 'zoomOut' | 'download' | 'bell' | 'thread'
  let { name, size = 18 }: { name: Name; size?: number } = $props()
  const paths: Record<Name, string[]> = {
    pin: ['M12 17v5', 'M9 3h6l-1 6 3 3v2H7v-2l3-3z'],
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
    thread: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
    bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M13.7 21a2 2 0 0 1-3.4 0'],
    clock: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M12 6v6l4 2'],
    checks: ['m2 12 5 5L17 7', 'm12 15 2 2L22 7'],
    alert: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M12 8v5', 'M12 16h.01'],
    link: ['M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7', 'M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7'],
    bellOff: ['M13.7 21a2 2 0 0 1-3.4 0', 'M18.6 14c.2.8.4 1.6.4 3H6', 'M17 17H3s3-2 3-9a6 6 0 0 1 .4-2.2', 'M8.7 3.5A6 6 0 0 1 18 8c0 1.1.1 2.1.3 3', 'm2 2 20 20'],
    star: ['m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.3-6.2 3.3L8 14.2 3 9.3l6.9-1z'],
    at: ['M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z', 'M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.9 7.9'],
    users2: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'],
    file: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6'],
    mic: ['M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z', 'M19 10v2a7 7 0 0 1-14 0v-2', 'M12 19v3', 'M8 22h8'],
    play: ['M7 4.5v15l12-7.5z'],
    pause: ['M8 4h3v16H8z', 'M13 4h3v16h-3z'],
    zoomIn: ['M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z', 'm21 21-4.3-4.3', 'M11 8v6', 'M8 11h6'],
    zoomOut: ['M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z', 'm21 21-4.3-4.3', 'M8 11h6'],
    download: ['M12 3v12', 'm7 10 5 5 5-5', 'M5 21h14'],
    moon: ['M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'],
    eyeOff: ['M9.9 4.2A10 10 0 0 1 12 4c6 0 10 8 10 8a17 17 0 0 1-2.2 3.2', 'M6.6 6.6A17 17 0 0 0 2 12s4 8 10 8a10 10 0 0 0 5.4-1.6', 'M9.9 9.9a3 3 0 0 0 4.2 4.2', 'm2 2 20 20'],
    more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
    qr: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h3v3h-3z', 'M20 14v3', 'M14 20h3', 'M20 20h1'],
    logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'm16 17 5-5-5-5', 'M21 12H9'],
  }
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#each paths[name] as d (d)}<path {d} />{/each}
</svg>
