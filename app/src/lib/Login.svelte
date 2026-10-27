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
  <form onsubmit={submit}>
    <div class="mark" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <h1>Tessera</h1>
    <p class="lede">A quiet place for your Matrix conversations.</p>
    <label><span class="label">Homeserver</span><input bind:value={server} placeholder="matrix.example.org" required /></label>
    <label><span class="label">Username</span><input bind:value={user} autocomplete="username" required /></label>
    <label><span class="label">Password</span><input type="password" bind:value={password} autocomplete="current-password" required /></label>
    {#if chat.error}<div class="err" role="alert">{chat.error}</div>{/if}
    <button class="btn" disabled={busy}>{busy ? 'Signing in' : 'Sign in'}</button>
  </form>
</main>

<style>
  main { min-height: 100%; display: grid; align-items: center; padding: 6vh 8vw; }
  form { width: min(380px, 100%); display: grid; gap: 22px; }
  .mark { display: grid; grid-template-columns: repeat(2, 14px); gap: 3px; }
  .mark i { width: 14px; height: 14px; background: var(--text); } .mark i:nth-child(2) { background: var(--accent); } .mark i:nth-child(3) { background: none; border: 1px solid var(--text); }
  h1 { margin: 0; font: 400 56px/1 var(--serif); letter-spacing: -.02em; }
  .lede { margin: -10px 0 8px; color: var(--muted); font-family: var(--serif); font-size: 18px; }
  label { display: grid; gap: 2px; }
  .err { color: var(--accent); font-size: 13px; }
</style>
