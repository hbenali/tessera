<script lang="ts">
  import { chat } from './matrix.svelte'
  let server = $state(localStorage.getItem('tessera.server') ?? 'http://localhost:8008')
  let user = $state('')
  let password = $state('')
  let busy = $state(false)

  async function submit(e: Event) {
    e.preventDefault()
    busy = true
    localStorage.setItem('tessera.server', server)
    await chat.login(server, user, password)
    busy = false
  }
</script>

<main>
  <div class="mosaic" aria-hidden="true">
    {#each [0, 3, 2, 1, 4, 0, 5, 3, 1, 2, 4, 5, 3, 0, 2, 1] as t, i (i)}<i style="background:var(--t{t})"></i>{/each}
  </div>
  <form onsubmit={submit}>
    <h1>tessera</h1>
    <p class="lede">Matrix chat, one tile at a time.</p>
    <label><span class="label">Homeserver</span><input bind:value={server} placeholder="matrix.example.org" required /></label>
    <label><span class="label">Username</span><input bind:value={user} autocomplete="username" required /></label>
    <label><span class="label">Password</span><input type="password" bind:value={password} autocomplete="current-password" required /></label>
    {#if chat.error}<div class="err" role="alert">{chat.error}</div>{/if}
    <button class="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
  </form>
</main>

<style>
  main { min-height: 100%; display: grid; grid-template-columns: 1fr 1fr; }
  .mosaic { display: grid; grid-template-columns: repeat(4, 1fr); grid-auto-rows: 1fr; gap: 6px; padding: 6px; }
  .mosaic i { border-radius: 6px; }
  form { align-self: center; justify-self: center; width: min(380px, 84%); display: grid; gap: 20px; padding: 40px 0; }
  h1 { margin: 0; font: 800 64px/.9 var(--display); letter-spacing: -.045em; }
  .lede { margin: -6px 0 10px; color: var(--muted); font-size: 17px; }
  label { display: grid; gap: 2px; } .err { color: var(--danger); font-size: 13px; }
  @media (max-width: 760px) { main { grid-template-columns: 1fr; } .mosaic { grid-template-columns: repeat(8, 1fr); grid-auto-rows: 28px; } .mosaic i:nth-child(n+9) { display: none; } }
</style>
