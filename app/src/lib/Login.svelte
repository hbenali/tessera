<script lang="ts">
  import { chat } from './matrix.svelte'
  let server = $state(localStorage.getItem('mychat.server') ?? 'http://localhost:8008')
  let user = $state('')
  let password = $state('')
  let busy = $state(false)

  async function submit(e: Event) {
    e.preventDefault()
    busy = true
    localStorage.setItem('mychat.server', server)
    await chat.login(server, user, password)
    busy = false
  }
</script>

<main>
  <form onsubmit={submit}>
    <div class="logo">M</div>
    <h1>Welcome to MyChat</h1>
    <p>Sign in with your Matrix account.</p>
    <label>Server<input bind:value={server} placeholder="matrix.example.org" required /></label>
    <label>Username<input bind:value={user} autocomplete="username" required /></label>
    <label>Password<input type="password" bind:value={password} autocomplete="current-password" required /></label>
    {#if chat.error}<div class="err" role="alert">{chat.error}</div>{/if}
    <button class="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
  </form>
</main>

<style>
  main { height: 100%; display: grid; place-items: center;
    background: radial-gradient(900px 500px at 20% 10%, #7c6cff33, transparent), radial-gradient(800px 500px at 90% 90%, #5b8cff2a, transparent), var(--bg); }
  form { width: min(380px, 92vw); display: grid; gap: 14px; padding: 32px; background: var(--bg-2); border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 20px 60px #0006; }
  .logo { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; font-weight: 700; background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #fff; }
  h1 { margin: 4px 0 0; font-size: 22px; } p { margin: 0 0 6px; color: var(--muted); }
  label { display: grid; gap: 6px; font-size: 13px; color: var(--muted); }
  input { padding: 10px 12px; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; color: var(--text); }
  .primary { padding: 11px; border-radius: 8px; background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #fff; font-weight: 600; }
  .primary:disabled { opacity: .6; }
  .err { color: var(--danger); font-size: 13px; }
</style>
