<script lang="ts">
  import { chat } from './matrix.svelte'
  import Avatar from './Avatar.svelte'
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
  <section class="card">
    <div class="brand"><Avatar name="Tessera" size={40} /><span>Tessera</span></div>
    <h1>Sign in</h1>
    <p class="lede">Use your Matrix account on any homeserver.</p>
    <form onsubmit={submit}>
      <label>Homeserver<input bind:value={server} placeholder="matrix.example.org" required /></label>
      <label>Username<input bind:value={user} autocomplete="username" required /></label>
      <label>Password<input type="password" bind:value={password} autocomplete="current-password" required /></label>
      {#if chat.error}<div class="err" role="alert">{chat.error}</div>{/if}
      <button class="btn" disabled={busy}>{busy ? 'Signing in…' : 'Continue'}</button>
    </form>
  </section>
</main>

<style>
  main { min-height: 100%; display: grid; place-items: center; padding: 24px; background: var(--panel); }
  .card { width: min(400px, 100%); padding: 32px; background: var(--bg); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow); }
  .brand { display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: 18px; letter-spacing: -.02em; margin-bottom: 22px; }
  h1 { margin: 0; font-size: 24px; letter-spacing: -.02em; } .lede { margin: 4px 0 20px; color: var(--muted); }
  form { display: grid; gap: 14px; } label { display: grid; gap: 6px; font-size: 13px; font-weight: 500; }
  .btn { padding: 10px; margin-top: 4px; } .err { color: var(--danger); font-size: 13px; }
</style>
