<script lang="ts">
  import { chat } from './lib/matrix.svelte'
  import Login from './lib/Login.svelte'
  import Shell from './lib/Shell.svelte'

  const saved = chat.loadSession()
  if (saved) chat.start(saved)
  const loggedIn = $derived(!!chat.userId)
</script>

{#if loggedIn}
  <Shell />
{:else}
  <Login />
{/if}
