<script lang="ts">
  import { chat } from './lib/matrix.svelte'
  import Login from './lib/Login.svelte'
  import Shell from './lib/Shell.svelte'

  // An SSO redirect lands here with ?loginToken=; otherwise resume a saved session.
  chat.finishSso().then((handled) => {
    const saved = chat.loadSession()
    if (!handled && saved) chat.start(saved)
  })
  const loggedIn = $derived(!!chat.userId)
</script>

{#if loggedIn}
  <Shell />
{:else}
  <Login />
{/if}
