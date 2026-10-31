<script lang="ts">
  import { tick } from 'svelte'
  import { chat, friendlyError, type Msg } from './matrix.svelte'
  import { COMMANDS, isKnown, parseCommand, shrug } from './commands'
  import { quote as quoteLines, wrap, type Edit } from './format'
  import { findEmoji } from './emojiNames'
  import { canRecord, type Recorded } from './recorder'
  import VoiceRecorder from './VoiceRecorder.svelte'
  import Skeleton from './Skeleton.svelte'
  import AudioPlayer from './AudioPlayer.svelte'
  import FileCard from './FileCard.svelte'
  import LinkPreview from './LinkPreview.svelte'
  import JumpMenu from './JumpMenu.svelte'
  import PollCard from './PollCard.svelte'
  import ComposerMore from './ComposerMore.svelte'
  import { mapLink } from './location'
  import { render } from './markdown'
  import { dayLabel, ui } from './ui.svelte'
  import Avatar from './Avatar.svelte'
  import Photo from './Photo.svelte'
  import { highlight } from './highlight'
  import { fromComposer, mentionRanges, plainMentions, toComposer, type Picked } from './mentions'
  import { getDraft, setDraft } from './drafts'
  import MessageMore from './MessageMore.svelte'
  import Icon from './Icon.svelte'
  import EmojiPicker from './EmojiPicker.svelte'

  let text = $state('')
  let replyTo = $state<Msg | null>(null)
  let editing = $state<Msg | null>(null)
  let notice = $state('')
  let picker = $state<string | null>(null) // message id, or 'composer'
  let seenFor = $state<string | null>(null) // message whose list of readers is open
  let seenUp = $state(false) // open the list upward when there is no room below
  // The readers list closes on Escape, on a click anywhere else, and when the room changes.
  $effect(() => {
    if (!seenFor) return
    const away = (e: Event) => { if (!(e.target as HTMLElement).closest?.('.seen')) seenFor = null }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') seenFor = null }
    addEventListener('pointerdown', away)
    addEventListener('keydown', esc)
    return () => { removeEventListener('pointerdown', away); removeEventListener('keydown', esc) }
  })
  $effect(() => { chat.activeRoom; seenFor = null })
  let scroller: HTMLElement | undefined = $state()
  let rowsEl: HTMLElement | undefined = $state()
  let fileInput: HTMLInputElement | undefined = $state()
  let stick = true
  let pins = $state(false) // pinned list open
  let away = $state(false) // scrolled up from the newest message
  let typingTimer: ReturnType<typeof setTimeout> | undefined

  const QUICK = ['👍', '❤️', '😂', '🎉']
  const fmt = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const byId = (id?: string) => chat.messages.find((m) => m.id === id)

  // Consecutive messages from one sender within 5 minutes share a header; a new day gets a divider.
  const rows = $derived(
    chat.messages.map((m, i) => {
      const p = chat.messages[i - 1]
      const newDay = !p || new Date(p.ts).toDateString() !== new Date(m.ts).toDateString()
      return { m, newDay, cont: !newDay && p.sender === m.sender && m.ts - p.ts < 300_000 && !m.replyTo }
    }),
  )

  $effect(() => {
    chat.messages.length
    if (stick) tick().then(() => scroller?.scrollTo({ top: scroller.scrollHeight }))
  })
  // Jump to a message chosen from search, and flash it so the eye can find it.
  $effect(() => {
    const id = chat.focusEvent
    chat.messages.length
    if (!id || !scroller) return
    tick().then(() => {
      const el = scroller?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)
      if (!el) return
      stick = false
      el.scrollIntoView({ block: 'center' })
      el.classList.add('flash')
      setTimeout(() => el.classList.remove('flash'), 1800)
      chat.focusEvent = null
    })
  })
  // The box shows people as "@Name" (drawn as pills behind the text); the sent message carries their Matrix id.
  let picked = $state<Picked>({})
  function setComposer(wire: string) {
    const c = toComposer(wire, chat.nameOf)
    text = c.text
    picked = c.picked
  }
  const pieces = $derived.by(() => {
    const out: { t: string; pill: boolean }[] = []
    let at = 0
    for (const [a, b] of mentionRanges(text, picked)) {
      if (a > at) out.push({ t: text.slice(at, a), pill: false })
      out.push({ t: text.slice(a, b), pill: true })
      at = b
    }
    out.push({ t: text.slice(at) + '\u200b', pill: false }) // the zero-width space keeps a trailing newline's height
    return out
  })
  let mirror: HTMLElement | undefined = $state()
  const syncScroll = () => { if (mirror && area) mirror.scrollTop = area.scrollTop }
  let textRoom: string | null = null // the room `text` belongs to
  $effect(() => {
    const id = chat.activeRoom
    stick = true
    replyTo = editing = null
    picker = null
    notice = ''
    textRoom = id
    if (id) setComposer(getDraft(id))
    else { text = ''; picked = {} }
  })
  $effect(() => {
    const t = text
    if (textRoom && textRoom === chat.activeRoom && !editing) setDraft(textRoom, fromComposer(t, picked), !chat.active?.encrypted)
  })

  // Many of a room's newest events are not shown (reactions, joins, edits), so the first window can hold too few
  // messages to fill the screen. Then there is nothing to scroll and nothing would ever trigger loading, so
  // keep paging back until the list can scroll or the start of the room is reached.
  let filling = false
  async function fill() {
    if (filling) return
    filling = true
    try {
      for (let i = 0; i < 12; i++) {
        await tick()
        if (!scroller || scroller.scrollHeight > scroller.clientHeight + 40 || !chat.hasOlder() || chat.loadingOlder) return
        await chat.loadOlder()
        await new Promise((r) => setTimeout(r, 200)) // let the new events reach the list
      }
    } finally {
      filling = false
    }
  }
  $effect(() => {
    chat.activeRoom
    chat.messages.length
    fill()
  })
  // Load when the top of the list comes near the viewport. A scroll event is not enough: at scrollTop 0
  // scrolling up changes nothing, so no event fires, but an observer still reports the top as visible.
  let topEl: HTMLElement | undefined = $state()
  async function loadEarlier() {
    if (!scroller || chat.loadingOlder || !chat.hasOlder()) return
    const h = scroller.scrollHeight
    await chat.loadOlder()
    await tick()
    if (scroller) scroller.scrollTop += scroller.scrollHeight - h // keep the reader's place
  }
  $effect(() => {
    if (!topEl || !scroller) return
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && loadEarlier(), { root: scroller, rootMargin: '300px 0px 0px 0px' })
    io.observe(topEl)
    return () => io.disconnect()
  })
  // Scrolling up while already at the top fires no scroll event; the wheel and touch-drag still do.
  $effect(() => {
    const el = scroller
    if (!el) return
    const wheel = (e: WheelEvent) => { if (e.deltaY < 0 && el.scrollTop < 40) loadEarlier() }
    const touch = () => { if (el.scrollTop < 40) loadEarlier() }
    el.addEventListener('wheel', wheel, { passive: true })
    el.addEventListener('touchmove', touch, { passive: true })
    return () => { el.removeEventListener('wheel', wheel); el.removeEventListener('touchmove', touch) }
  })

  // Anything that changes the height of the message list (an image or font finishing, a reaction row, an edit) while you are
  // at the bottom keeps you at the bottom. The image load handler alone missed some late layout changes.
  $effect(() => {
    const el = rowsEl
    if (!el || !scroller) return
    const ro = new ResizeObserver(() => { if (stick) scroller?.scrollTo({ top: scroller.scrollHeight }) })
    ro.observe(el)
    return () => ro.disconnect()
  })

  function onscroll() {
    if (!scroller) return
    stick = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80
    away = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight > 400
    if (scroller.scrollTop < 40 && !chat.loadingOlder && chat.hasOlder()) {
      const h = scroller.scrollHeight
      // Keep the reader's place: add only the height that was loaded above, never jump to a fixed position.
      chat.loadOlder().then(() => tick().then(() => scroller && (scroller.scrollTop += scroller.scrollHeight - h)))
    }
  }

  async function submit() {
    const original = text
    const originalPicked = { ...picked }
    const body = fromComposer(text, picked)
    if (!body.trim() && !tray.length) return
    if (uploading) return
    notice = ''
    // Files go first, in order; if one fails, nothing else is sent and the text stays in the box.
    if (tray.length && !(await sendTray())) { notice = 'A file could not be sent. Retry, or remove it from the tray.'; return }
    if (!body.trim()) { chat.setTyping(false); return }
    // "/word" is a command and never goes to the room by accident; a doubled slash sends a literal one.
    const parsed = editing ? null : parseCommand(body)
    // When a command cannot run, the text goes back in the box so it can be corrected instead of being lost.
    const putBack = (why: string) => { text = original; picked = originalPicked; notice = why }
    text = ''
    picked = {}
    if (parsed && 'command' in parsed) {
      const { name, arg } = parsed.command
      try {
        if (name === 'invite') {
          say(`Invited ${await chat.invitePerson(arg)}`)
        } else if (name === 'me') {
          if (!arg) return putBack('Say what you are doing: /me waves')
          await chat.send(arg, replyTo?.id, 'm.emote').catch(() => {})
          replyTo = null
        } else if (name === 'shrug') {
          await chat.send(shrug(arg), replyTo?.id).catch(() => {})
          replyTo = null
        } else if (!isKnown(name)) {
          return putBack(`Unknown command /${name}. Commands: ${COMMANDS.map((c) => c.usage).join(', ')}. To send a message that starts with a slash, double it: //${name}`)
        }
      } catch (e) {
        return putBack(friendlyError(e))
      }
    } else if (editing) {
      await chat.edit(editing.id, body)
      editing = null
    } else {
      // A failed send stays in the list as "Not sent" with Retry and Delete, so the error itself needs no handling here.
      await chat.send(parsed && 'send' in parsed ? parsed.send : body, replyTo?.id).catch(() => {})
      replyTo = null
    }
    chat.setTyping(false)
  }
  // @-mention autocomplete: the word being typed, if it starts with @ at a word boundary.
  let area: HTMLTextAreaElement | undefined = $state()
  let caret = $state(0)
  let sel = $state(0)
  const query = $derived.by(() => {
    const m = /(?:^|\s)@([^\s@]*)$/.exec(text.slice(0, caret))
    return m ? m[1].toLowerCase() : null
  })
  // After "/invite" the people to suggest are not in the room yet, so they come from the server's user directory.
  // A colon means a full id has been typed or picked, so there is nothing left to suggest.
  const inviteQuery = $derived(/^\/invite\s+@?([^\s@:]*)$/i.exec(text.slice(0, caret))?.[1] ?? null)
  let inviteFound = $state<{ id: string; name: string; avatar?: string }[]>([])
  $effect(() => {
    const q = inviteQuery
    if (q === null || q.length < 2) { inviteFound = []; return }
    const t = setTimeout(async () => {
      try {
        const here = new Set(chat.members.map((m) => m.id))
        const r = await chat.searchUsers(q)
        if (inviteQuery === q) inviteFound = r.filter((u) => !here.has(u.id)).slice(0, 6)
      } catch {
        inviteFound = []
      }
    }, 250)
    return () => clearTimeout(t)
  })
  // ":smi" suggests emoji.
  const emojiQuery = $derived(/(?:^|\s):([a-z0-9_+\-]{2,})$/i.exec(text.slice(0, caret))?.[1] ?? null)
  const suggestions = $derived<{ id: string; name: string; avatar?: string; emoji?: string }[]>(
    emojiQuery !== null && inviteQuery === null
      ? findEmoji(emojiQuery).map(([n, e]) => ({ id: n, name: n, emoji: e }))
      : inviteQuery !== null
      ? inviteFound
      : query === null
        ? []
        : chat.members.filter((u) => u.id !== chat.userId && (u.name.toLowerCase().includes(query) || u.id.toLowerCase().includes(query))).slice(0, 6),
  )
  $effect(() => { suggestions; sel = 0 })
  function complete(u: { id: string; name: string; emoji?: string }) {
    if (u.emoji) {
      const before = text.slice(0, caret).replace(/:[a-z0-9_+\-]{2,}$/i, `${u.emoji} `)
      text = before + text.slice(caret)
      caret = before.length
      tick().then(() => { area?.focus(); area?.setSelectionRange(caret, caret) })
      return
    }
    if (inviteQuery !== null) {
      // An invitation takes the plain id.
      const before = text.slice(0, caret).replace(/^(\/invite\s+)@?[^\s@]*$/i, `$1${u.id}`)
      text = before + text.slice(caret)
      caret = before.length
      tick().then(() => { area?.focus(); area?.setSelectionRange(caret, caret) })
      return
    }
    // The name is shown when it is unambiguous; two people with one name fall back to the plain id.
    const shown = picked[u.name] && picked[u.name] !== u.id ? u.id : `@${u.name}`
    if (shown !== u.id) picked[u.name] = u.id
    const before = text.slice(0, caret).replace(/@[^\s@]*$/, `${shown} `)
    text = before + text.slice(caret)
    caret = before.length
    tick().then(() => { area?.focus(); area?.setSelectionRange(caret, caret) })
  }
  function keydown(e: KeyboardEvent) {
    if (suggestions.length && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
      e.preventDefault()
      if (e.key === 'ArrowDown') sel = (sel + 1) % suggestions.length
      else if (e.key === 'ArrowUp') sel = (sel + suggestions.length - 1) % suggestions.length
      else if (e.key === 'Escape') caret = 0
      else complete(suggestions[sel])
      return
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && ['b', 'i', 'e'].includes(e.key.toLowerCase())) {
      e.preventDefault()
      mark({ b: '**', i: '*', e: '`' }[e.key.toLowerCase() as 'b' | 'i' | 'e'])
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'x') { e.preventDefault(); mark('~~') }
    else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
    else if (e.key === 'Escape') { replyTo = editing = null }
    else if (e.key === 'ArrowUp' && !text) {
      const mine = [...chat.messages].reverse().find((m) => m.mine && !m.pending)
      if (mine) { editing = mine; setComposer(mine.body) }
    } else {
      chat.setTyping(true)
      clearTimeout(typingTimer)
      typingTimer = setTimeout(() => chat.setTyping(false), 4000)
    }
  }
  // A mention pill (or a name) opens that person's card. Delegated from the message text so pills made by {@html} work.
  function pills(node: HTMLElement) {
    const open = (el: HTMLElement) => {
      const id = el.dataset.user
      if (!id) return
      const r = el.getBoundingClientRect()
      ui.openUserCard(id, r.left, r.bottom + 6, el)
    }
    const click = (e: Event) => { const el = (e.target as HTMLElement).closest<HTMLElement>('.mention[data-user]'); if (el) open(el) }
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      const el = (e.target as HTMLElement).closest<HTMLElement>('.mention[data-user]')
      if (el) { e.preventDefault(); open(el) }
    }
    node.addEventListener('click', click)
    node.addEventListener('keydown', key)
    return { destroy() { node.removeEventListener('click', click); node.removeEventListener('keydown', key) } }
  }
  const card = (id: string, e: MouseEvent & { currentTarget: HTMLElement }) => {
    const r = e.currentTarget.getBoundingClientRect()
    ui.openUserCard(id, r.left, r.bottom + 6, e.currentTarget)
  }
  // "Mention" on a person's card puts them in the composer.
  $effect(() => {
    const id = ui.mentionRequest
    if (!id) return
    ui.mentionRequest = null
    text = text && !/\s$/.test(text) ? `${text} ${id} ` : `${text}${id} `
    tick().then(() => { area?.focus(); area?.setSelectionRange(text.length, text.length) })
  })
  let toast = $state('')
  const say = (t: string) => { toast = t; setTimeout(() => (toast = ''), 3200) }
  async function copyLink(m: Msg) {
    try {
      await navigator.clipboard.writeText(chat.permalink(chat.activeRoom!, m.id))
      toast = 'Link copied'
    } catch {
      toast = 'Could not copy the link'
    }
    setTimeout(() => (toast = ''), 1800)
  }
  // ---- Attachments: they wait in a tray (with a preview and progress) until you send ----
  interface Pending { id: number; file: File; preview?: string; progress: number; error?: string }
  let tray = $state<Pending[]>([])
  let nextId = 0
  let uploading = $state(false)
  let maxUpload = 0 // the server's limit in bytes, 0 until known
  async function addFiles(files: Iterable<File>) {
    if (!maxUpload) maxUpload = await chat.maxUploadSize()
    for (const file of files) {
      if (maxUpload && file.size > maxUpload) { notice = `${file.name} is ${mb(file.size)}, and this server accepts files up to ${mb(maxUpload)}.`; continue }
      tray.push({ id: nextId++, file, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined, progress: 0 })
    }
    tick().then(() => area?.focus())
  }
  const mb = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} kB`)
  function removePending(id: number) {
    const p = tray.find((t) => t.id === id)
    if (p?.preview) URL.revokeObjectURL(p.preview)
    tray = tray.filter((t) => t.id !== id)
  }
  /** Send the tray's files one after another. A failure stops there and leaves it, marked, to retry or remove. */
  async function sendTray(): Promise<boolean> {
    uploading = true
    try {
      for (const p of [...tray]) {
        p.error = undefined
        try {
          await chat.upload(p.file, (l, t) => (p.progress = t ? l / t : 0))
        } catch (e) {
          p.error = friendlyError(e)
          return false
        }
        removePending(p.id)
      }
      return true
    } finally {
      uploading = false
    }
  }
  function paste(e: ClipboardEvent) {
    const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    e.preventDefault()
    addFiles(files)
  }
  function pick(e: Event) {
    const input = e.target as HTMLInputElement
    if (input.files?.length) addFiles([...input.files])
    input.value = ''
  }
  // A drag over the room shows where it will land.
  let dragDepth = $state(0)
  const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files')
  function drop(e: DragEvent) {
    e.preventDefault()
    dragDepth = 0
    if (e.dataTransfer?.files.length) addFiles([...e.dataTransfer.files])
  }

  // ---- Voice messages ----
  const micOk = canRecord()
  let recording = $state(false)
  let voiceProgress = $state<number | null>(null) // while a recording is being sent
  async function sendRecorded(r: Recorded) {
    recording = false
    voiceProgress = 0
    try {
      await chat.sendVoice(r, (l, t) => (voiceProgress = t ? l / t : 0))
    } catch (e) {
      notice = `The voice message was not sent: ${friendlyError(e)}`
    } finally {
      voiceProgress = null
    }
  }

  // ---- Formatting: Markdown markers around the selection ----
  function applyEdit(r: Edit) {
    text = r.text
    tick().then(() => { area?.focus(); area?.setSelectionRange(r.start, r.end); caret = r.end })
  }
  const mark = (m: string) => area && applyEdit(wrap(text, area.selectionStart, area.selectionEnd, m))
  const fmtQuote = () => area && applyEdit(quoteLines(text, area.selectionStart, area.selectionEnd))
</script>

{#snippet delivery(m: Msg)}
  {#if m.state === 'failed'}
    <span class="tick st-failed" role="group" aria-label="This message was not sent">
      <Icon name="alert" size={14} /><span class="note">Not sent</span>
      <button onclick={() => chat.retrySend(m.id)}>Retry</button><button onclick={() => chat.discardUnsent(m.id)}>Delete</button>
    </span>
  {:else if m.state}
    {@const word = ({ sending: 'Sending', sent: 'Sent', seen: 'Seen' })[m.state]}
    <!-- keyed so each change of state plays its small animation -->
    {#key m.state}
      <span class="tick st-{m.state}" title={m.state === 'sending' ? 'Sending…' : `${word} ${fmt(m.ts)}`}>
        {#if m.state === 'sending'}<span class="spin" aria-hidden="true"></span>{:else}<Icon name={m.state === 'seen' ? 'checks' : 'check'} size={15} />{/if}
        <span class="sr">{word}</span>
      </span>
    {/key}
  {/if}
{/snippet}

<main class="main" ondragover={(e) => e.preventDefault()} ondragenter={(e) => hasFiles(e) && dragDepth++} ondragleave={() => (dragDepth = Math.max(0, dragDepth - 1))} ondrop={drop}>
  {#if dragDepth > 0 && chat.active}<div class="dropzone" aria-hidden="true"><span><Icon name="clip" size={22} /> Drop to attach</span></div>{/if}
  {#if !chat.active && chat.routeMissing}
    <div class="empty"><Icon name="lock" size={40} /><h1>You are not in this room</h1><p class="mono">{chat.routeMissing}</p>
      <button class="btn" onclick={() => chat.joinRoom(chat.routeMissing!).catch((e) => (notice = String(e.message ?? e)))}>Join room</button>
      {#if notice}<p class="err" role="alert">{notice}</p>{/if}
    </div>
  {:else if !chat.active}
    <div class="empty"><Icon name="hash" size={40} /><h1>Select a conversation</h1><p>Choose a room on the left, or press <kbd class="mono">Ctrl K</kbd> to jump.</p></div>
  {:else}
    <header>
      <button class="icon-btn back" onclick={() => chat.closeRoom()} aria-label="Back to rooms"><Icon name="back" /></button>
      <Avatar name={chat.active.name} size={32} round={chat.active.isDM} src={chat.active.avatar} presence={chat.active.dmUser ? (chat.presenceOf(chat.active.dmUser) ?? 'offline') : undefined} />
      <div class="title"><h1>{chat.active.name}{#if chat.isQuiet(chat.active.id)}<span class="muted" title="Quiet reading: people are not shown that you read this room"><Icon name="eyeOff" size={14} /><span class="sr">Quiet reading</span></span>{/if}{#if chat.active.notifs === 'mute'}<span class="muted" title="Notifications are muted"><Icon name="bellOff" size={14} /><span class="sr">Muted</span></span>{/if}</h1>{#if chat.active.dmUser}<span class="topic">{({ online: 'Online', unavailable: 'Away', offline: 'Offline' })[chat.presenceOf(chat.active.dmUser) ?? 'offline']}</span>{:else if chat.active.topic}<span class="topic">{chat.active.topic}</span>{:else}<span class="topic">{chat.active.memberCount} {chat.active.memberCount === 1 ? 'member' : 'members'}</span>{/if}</div>
      {#if chat.active.encrypted}<span class="enc" title="End-to-end encrypted"><Icon name="lock" size={13} /> Encrypted</span>{/if}
<JumpMenu />
 <button class="icon-btn" class:on={ui.roomSearch} onclick={() => { ui.roomSearch = !ui.roomSearch; if (ui.roomSearch) chat.closeThread() }} aria-label="Search in this room" aria-pressed={ui.roomSearch} title="Search in this room (Ctrl+Shift+F)"><Icon name="search" /></button>
      <button class="icon-btn" aria-label="Room menu" aria-haspopup="menu" onclick={(e) => { const b = e.currentTarget.getBoundingClientRect(); ui.openRoomMenu(chat.active!.id, b.right - 220, b.bottom + 4, e.currentTarget) }}><Icon name="more" /></button>
      <button class="icon-btn" class:on={ui.details} onclick={() => (ui.details = !ui.details)} aria-label="Room details" aria-pressed={ui.details}><Icon name="info" /></button>
    </header>

    {#if chat.pinned.length}
      <div class="pinbar">
        <button class="pin-main" onclick={() => { const p = chat.pinned.at(-1)!; chat.focusEvent = p.id }} title="Jump to pinned message">
          <Icon name="pin" size={14} /><b>{chat.pinned.at(-1)!.sender}</b><span>{chat.pinned.at(-1)!.body}</span>
        </button>
        {#if chat.pinned.length > 1}<button class="pin-count" aria-expanded={pins} onclick={() => (pins = !pins)}>{chat.pinned.length} pinned</button>{/if}
        {#if pins}
          <ul class="pinlist" aria-label="Pinned messages">
            {#each [...chat.pinned].reverse() as p (p.id)}
              <li><button onclick={() => { chat.focusEvent = p.id; pins = false }}><b>{p.sender}</b><span>{p.body}</span></button>{#if chat.canPin}<button class="icon-btn" onclick={() => chat.togglePin(p.id)} aria-label="Unpin message from {p.sender}"><Icon name="x" size={14} /></button>{/if}</li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
    {#if away}<button class="latest" onclick={() => { stick = true; scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' }) }}><Icon name="chevron" size={14} /> Jump to latest</button>{/if}
    <div class="scroll" bind:this={scroller} {onscroll} onloadcapture={() => stick && scroller?.scrollTo({ top: scroller.scrollHeight })}>
      {#if !chat.messages.length && !chat.ready}<Skeleton variant="timeline" />{/if}
      {#if chat.loadingOlder}<div class="note">Loading earlier messages…</div>{/if}
      {#if chat.olderAvailable}
        <div class="sentinel" bind:this={topEl} role="status">{chat.loadingOlder ? 'Loading earlier messages…' : ''}</div>
      {:else if rows.length}
        <p class="start">This is the beginning of the conversation.</p>
      {/if}
      <div class="rows" bind:this={rowsEl}>
      {#each rows as { m, newDay, cont } (m.id)}
        {#if newDay}<div class="day" role="separator"><span>{dayLabel(m.ts)}</span></div>{/if}
        <article class:cont class:pending={m.pending} class:active={picker === m.id || seenFor === m.id} class:mention={m.mentionsMe} data-id={m.id}>
          <div class="gutter">
            {#if !cont}<!-- a mouse shortcut: the sender's name beside it is the accessible way to open the same card --><button class="avbtn" onclick={(e) => card(m.sender, e)} tabindex="-1" aria-hidden="true"><Avatar name={m.senderName} size={36} round src={m.senderAvatar} presence={m.mine ? undefined : chat.presenceOf(m.sender)} /></button>{:else}<time>{fmt(m.ts)}</time>{/if}
          </div>
          <div class="body">
            {#if !cont}<div class="head"><button class="who" onclick={(e) => card(m.sender, e)} aria-haspopup="dialog"><b>{m.senderName}</b></button><time>{fmt(m.ts)}</time>{#if m.pinned}<span class="pinned" title="Pinned"><Icon name="pin" size={12} /> Pinned</span>{/if}</div>{/if}
            {#if m.replyTo}<div class="quote"><Icon name="reply" size={12} /> <b>{byId(m.replyTo)?.senderName ?? ''}</b> {plainMentions(byId(m.replyTo)?.body ?? 'earlier message', chat.nameOf)}</div>{/if}
            {#if m.attachment}<FileCard {...m.attachment} sender={m.senderName} ts={m.ts} />{#if m.attachment.caption}<div class="text caption">{@html render(m.attachment.caption, { name: chat.nameOf, me: chat.userId })}</div>{/if}{:else if m.audio}<AudioPlayer mxc={m.audio.mxc} file={m.audio.file} duration={m.audio.duration} waveform={m.audio.waveform} voice={m.audio.voice} name={m.audio.name} />{:else if m.poll}<PollCard {m} />{:else if m.location}<a class="loc" href={mapLink(m.location.lat, m.location.lon)} target="_blank" rel="noopener noreferrer"><Icon name="pin" size={16} /><span><b>{m.location.label}</b><small>Open in a map</small></span></a>{:else if m.imageMxc}<Photo mxc={m.imageMxc} file={m.imageFile} alt={m.body} onopen={(opener) => (ui.viewer = { id: m.id, opener })} />{:else}<div class="line"><div class="text" class:utd={m.undecryptable} class:emote={m.emote} use:pills>{#if m.emote}<span class="who-emote">* {m.senderName}</span>{" "}{/if}{@html render(m.body, { name: chat.nameOf, me: chat.userId, pills: m.pills })}{#if m.edited}<span class="edited"> (edited)</span>{/if}</div>{#if m.mine}{@render delivery(m)}{/if}</div>{/if}
            {#if m.body && !m.attachment && !m.imageMxc && !m.audio && !m.poll && !m.location && !m.undecryptable}<LinkPreview body={m.body} encrypted={!!chat.active?.encrypted} />{/if}
            {#if m.threadReplies}<button class="thread-link" onclick={() => chat.openThread(m.id)}><Icon name="thread" size={13} /> {m.threadReplies} {m.threadReplies === 1 ? 'reply' : 'replies'}</button>{/if}
            {#if m.seenBy?.length}
              {@const who = m.seenBy}
              {@const names = who.map((s) => s.name).join(', ')}
              {@const dm = !!chat.active?.isDM}
              <div class="seen" title="Seen by {names}">
                <button class="seen-btn" aria-expanded={seenFor === m.id} aria-label="Seen by {names}. Show who and when" onclick={(e) => { seenUp = !!scroller && e.currentTarget.getBoundingClientRect().bottom + 260 > scroller.getBoundingClientRect().bottom; seenFor = seenFor === m.id ? null : m.id }}>
                  <span class="stack">{#each who.slice(0, 4) as s (s.id)}<Avatar name={s.name} size={16} round src={s.avatar} />{/each}</span>
                  {#if dm && who[0].ts}<span class="when">Seen {fmt(who[0].ts)}</span>{:else if who.length > 4}<span class="when">+{who.length - 4}</span>{:else if dm}<span class="when">Seen</span>{/if}
                </button>
                {#if seenFor === m.id}
                  <ul class="seen-list" class:up={seenUp} aria-label="Seen by">
                    {#each who as s (s.id)}<li><Avatar name={s.name} size={20} round src={s.avatar} /><span class="who">{s.name}</span>{#if s.ts}<time>{fmt(s.ts)}</time>{/if}</li>{/each}
                  </ul>
                {/if}
              </div>
            {/if}
            {#if Object.keys(m.reactions).length}
              <div class="reacts">{#each Object.entries(m.reactions) as [k, n] (k)}
                {@const who = m.reactors[k] ?? []}
                {@const mine = who.some((u) => u.id === chat.userId)}
                {@const names = who.map((u) => (u.id === chat.userId ? 'You' : u.name)).join(', ')}
                <button class:mine data-who={names} onclick={() => chat.react(m.id, k)} aria-pressed={mine} aria-label="{k} {n}: {names}. {mine ? 'Remove your reaction' : 'Add your reaction'}"><span>{k}</span> {n}</button>
              {/each}</div>
            {/if}
          </div>
          <div class="tools">
            {#each QUICK as e (e)}<button class="icon-btn quick" onclick={() => chat.react(m.id, e)} aria-label="React {e}">{e}</button>{/each}
            <span class="pw"><button class="icon-btn" onclick={() => (picker = picker === m.id ? null : m.id)} aria-label="More reactions"><Icon name="smile" size={16} /></button>
              {#if picker === m.id}<EmojiPicker onpick={(e) => chat.react(m.id, e)} onclose={() => (picker = null)} />{/if}</span>
            <button class="icon-btn" onclick={() => { replyTo = m; editing = null }} aria-label="Reply"><Icon name="reply" size={16} /></button>
            {#if chat.canPin}<button class="icon-btn" onclick={() => chat.togglePin(m.id)} aria-label={m.pinned ? 'Unpin message' : 'Pin message'} aria-pressed={m.pinned}><Icon name="pin" size={16} /></button>{/if}
            <button class="icon-btn" onclick={() => copyLink(m)} aria-label="Copy link to message"><Icon name="link" size={16} /></button>
            <button class="icon-btn" onclick={() => chat.openThread(m.id)} aria-label="Reply in thread"><Icon name="thread" size={16} /></button>
            {#if m.mine && !m.undecryptable}<button class="icon-btn" onclick={() => { editing = m; replyTo = null; setComposer(m.body) }} aria-label="Edit"><Icon name="edit" size={16} /></button>{/if}
            {#if m.mine}<button class="icon-btn" onclick={() => chat.deleteMessage(m.id)} aria-label="Delete message"><Icon name="trash" size={16} /></button>{/if}
            <MessageMore {m} />
          </div>
        </article>
      {/each}
      </div>
    </div>

    {#if toast}<div class="toast" role="status">{toast}</div>{/if}
    <div class="typing" aria-live="polite">{#if chat.typing.length}<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>{chat.typing.length > 2 ? 'Several people are' : `${chat.typing.join(' and ')} ${chat.typing.length > 1 ? 'are' : 'is'}`} typing{/if}</div>
    <footer>
      {#if notice}<div class="ctx err" role="alert">{notice}</div>{/if}
      <div class="composer">
        {#if replyTo}<div class="ctx"><Icon name="reply" size={14} /> Replying to <b>{replyTo.senderName}</b><span class="clip">{plainMentions(replyTo.body, chat.nameOf)}</span><button class="icon-btn" onclick={() => (replyTo = null)} aria-label="Cancel reply"><Icon name="x" size={14} /></button></div>{/if}
        {#if editing}<div class="ctx"><Icon name="edit" size={14} /> Editing message<button class="icon-btn" onclick={() => { editing = null; text = ''; picked = {} }} aria-label="Cancel edit"><Icon name="x" size={14} /></button></div>{/if}
        {#if suggestions.length}
          <ul class="mentions" id="mention-list" role="listbox" aria-label={emojiQuery !== null && inviteQuery === null ? 'Emoji suggestions' : 'Mention suggestions'}>
            {#each suggestions as u, i (u.id)}
              <li role="option" aria-selected={i === sel} class:on={i === sel} onmousedown={(e) => { e.preventDefault(); complete(u) }}>{#if u.emoji}<span class="emo" aria-hidden="true">{u.emoji}</span><span>:{u.name}:</span>{:else}<Avatar name={u.name} size={22} round src={u.avatar} presence={chat.presenceOf(u.id)} /><span>{#each highlight(u.name, query ?? '') as p, i (i)}{#if p.hit}<mark>{p.text}</mark>{:else}{p.text}{/if}{/each}</span><small>{u.id}</small>{/if}</li>
            {/each}
          </ul>
        {/if}
        {#if tray.length}
          <ul class="tray" aria-label="Files to send">
            {#each tray as p (p.id)}
              <li class:bad={!!p.error}>
                {#if p.preview}<img src={p.preview} alt="" />{:else}<span class="ico" aria-hidden="true"><Icon name="clip" size={18} /></span>{/if}
                <span class="meta"><b>{p.file.name}</b><small>{p.error ?? (uploading && p.progress > 0 ? `${Math.round(p.progress * 100)}%` : mb(p.file.size))}</small></span>
                {#if uploading && !p.error}<span class="bar" role="progressbar" aria-label="Uploading {p.file.name}" aria-valuenow={Math.round(p.progress * 100)} aria-valuemin="0" aria-valuemax="100"><i style="width:{Math.round(p.progress * 100)}%"></i></span>{/if}
                <button class="icon-btn" onclick={() => removePending(p.id)} aria-label="Remove {p.file.name}" disabled={uploading && !p.error}><Icon name="x" size={14} /></button>
              </li>
            {/each}
          </ul>
        {/if}
        {#if !recording && voiceProgress === null}
          <div class="fmt" role="toolbar" aria-label="Formatting">
            <button class="icon-btn" onmousedown={(e) => e.preventDefault()} onclick={() => mark('**')} aria-label="Bold" title="Bold (Ctrl+B)"><b>B</b></button>
            <button class="icon-btn" onmousedown={(e) => e.preventDefault()} onclick={() => mark('*')} aria-label="Italic" title="Italic (Ctrl+I)"><i>I</i></button>
            <button class="icon-btn" onmousedown={(e) => e.preventDefault()} onclick={() => mark('~~')} aria-label="Strikethrough" title="Strikethrough (Ctrl+Shift+X)"><s>S</s></button>
            <button class="icon-btn mono" onmousedown={(e) => e.preventDefault()} onclick={() => mark('`')} aria-label="Code" title="Code (Ctrl+E)">&lt;/&gt;</button>
            <button class="icon-btn" onmousedown={(e) => e.preventDefault()} onclick={fmtQuote} aria-label="Quote" title="Quote">❝</button>
          </div>
        {/if}
        <div class="input">
          {#if recording}
            <VoiceRecorder onsend={sendRecorded} oncancel={() => (recording = false)} onerror={(why) => { recording = false; notice = why }} />
          {:else if voiceProgress !== null}
            <div class="sendingvoice" role="status"><span class="spin" aria-hidden="true"></span> Sending voice message… {Math.round(voiceProgress * 100)}%</div>
          {:else}
          <ComposerMore onfiles={() => fileInput?.click()} />
          <input type="file" multiple hidden bind:this={fileInput} onchange={pick} />
          <div class="field"><div class="mirror" aria-hidden="true" bind:this={mirror}>{#each pieces as p, i (i)}{#if p.pill}<span class="pill">{p.t}</span>{:else}{p.t}{/if}{/each}</div>
          <textarea rows="1" bind:this={area} bind:value={text} onscroll={syncScroll} onkeydown={keydown} onpaste={paste} oninput={() => (caret = area?.selectionStart ?? 0)} onclick={() => (caret = area?.selectionStart ?? 0)} role="combobox" aria-expanded={suggestions.length > 0} aria-controls="mention-list" aria-autocomplete="list" placeholder="Message {chat.active.name}" aria-label="Message"></textarea></div>
          <span class="pw"><button class="icon-btn" onclick={() => (picker = picker === 'composer' ? null : 'composer')} aria-label="Insert emoji"><Icon name="smile" /></button>
            {#if picker === 'composer'}<EmojiPicker onpick={(e) => (text += e)} onclose={() => (picker = null)} />{/if}</span>
          {#if !text.trim() && !tray.length && micOk && !editing}
            <button class="send mic" onclick={() => (recording = true)} aria-label="Record a voice message" title="Record a voice message"><Icon name="mic" size={18} /></button>
          {:else}
            <button class="send" onclick={submit} disabled={(!text.trim() && !tray.length) || uploading} aria-label="Send message"><Icon name="send" size={17} /></button>
          {/if}
          {/if}
        </div>
      </div>
      <div class="hint">Enter to send · Shift+Enter for a new line · ↑ edits your last message · Ctrl+B / I for bold and italic · :emoji: · /invite @user</div>
    </footer>
  {/if}
</main>

<style>
  .loc { display: inline-flex; align-items: center; gap: 10px; margin-top: 4px; padding: 8px 12px; border-radius: 10px; background: var(--tile); border-left: 3px solid var(--accent); color: var(--text); text-decoration: none; } .loc span { display: grid; } .loc small { color: var(--muted); }
  main { position: relative; display: flex; flex-direction: column; min-width: 0; height: 100%; background: var(--bg); }
  .empty { margin: auto; padding: 24px; text-align: center; color: var(--muted); display: grid; justify-items: center; gap: 4px; } .empty h1 { margin: 10px 0 0; font-size: 20px; color: var(--text); } .empty p { margin: 0; }
  header { display: flex; align-items: center; gap: 12px; height: 56px; padding: 0 16px; border-bottom: 1px solid var(--line); flex: none; }
  .back { display: none; } @media (max-width: 720px) { .back { display: grid; } }
  .title { min-width: 0; display: grid; line-height: 1.25; } h1 { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: -.01em; } .topic { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .enc { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--ok); padding: 3px 9px; border-radius: 999px; background: color-mix(in srgb, var(--ok) 14%, transparent); }
  .scroll { position: relative; flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 8px 0 4px; }
  .note { text-align: center; color: var(--muted); font-size: 12px; padding: 8px; }
  .day { display: flex; align-items: center; gap: 12px; margin: 16px 20px 6px; color: var(--muted); font-size: 12px; font-weight: 600; } .day::before, .day::after { content: ''; flex: 1; height: 1px; background: var(--line); }
  /* Off-screen messages skip layout and paint, which keeps long rooms fast. */
.sentinel { min-height: 24px; margin: 4px 0; text-align: center; color: var(--muted); font-size: 12px; }
  .start { margin: 8px 0 4px; text-align: center; color: var(--muted); font-size: 12px; }
  .latest { position: absolute; left: 50%; bottom: 96px; transform: translateX(-50%); z-index: 5; display: inline-flex; gap: 6px; align-items: center; padding: 7px 14px; border-radius: 999px; border: 1px solid var(--line); background: var(--panel); color: var(--text); font: inherit; font-size: 12px; box-shadow: 0 6px 20px rgb(0 0 0 / .25); cursor: pointer; } .latest :global(svg) { transform: rotate(90deg); }
  article { position: relative; display: flex; gap: 12px; padding: 2px 20px; margin-top: 10px; content-visibility: auto; contain-intrinsic-size: auto 44px; } article.cont { margin-top: 0; } article.mention { background: color-mix(in srgb, var(--accent) 10%, transparent); box-shadow: inset 3px 0 0 var(--accent); } article.pending { opacity: .55; } article:hover { background: color-mix(in srgb, var(--tile) 55%, transparent); }
  /* The time on a continuation row is positioned out of the flow and only faded in: showing it must never change the row's height, or every message below it jumps. */
  .gutter { position: relative; flex: none; width: 36px; padding-top: 2px; } .gutter time { position: absolute; top: 2px; left: -8px; right: -8px; opacity: 0; pointer-events: none; white-space: nowrap; font-size: 10px; color: var(--muted); text-align: center; line-height: 21px; } article:hover .gutter time, article:focus-within .gutter time { opacity: 1; }
  .body { min-width: 0; flex: 1; }
  .head { display: flex; align-items: baseline; gap: 8px; } .head b { font-weight: 650; } .head time { color: var(--muted); font-size: 11px; }
  .text { white-space: pre-wrap; overflow-wrap: anywhere; max-width: 75ch; } .text.utd { color: var(--muted); font-style: italic; } .edited { color: var(--muted); font-size: 11px; }
  .emote { font-style: italic; } .who-emote { font-weight: 600; margin-right: .35em; }
  .who { padding: 0; font: inherit; color: inherit; border-radius: 4px; } .who:hover b { text-decoration: underline; } .avbtn { padding: 0; border-radius: 50%; display: block; }
  .text :global(.mention) { padding: 0 5px; border-radius: 5px; background: color-mix(in srgb, var(--accent) 16%, transparent); color: color-mix(in srgb, var(--accent) 55%, var(--text)); font-weight: 600; white-space: nowrap; }
  .text :global(.mention i) { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; vertical-align: 0; box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--bg) 70%, transparent); }
  .text :global(.mention) { cursor: pointer; }
  .text :global(.mention:hover) { background: color-mix(in srgb, var(--accent) 28%, transparent); }
  .text :global(.mention.me) { background: var(--accent); color: var(--accent-ink); } .text :global(.mention.me i) { box-shadow: 0 0 0 1.5px var(--accent-ink); }
  .mentions mark { background: transparent; color: var(--accent); font-weight: 700; }
  .text :global(code) { background: var(--tile); padding: 1px 5px; border-radius: 4px; font-family: var(--mono); font-size: 12.5px; } .text :global(pre) { margin: 6px 0; padding: 10px 12px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow-x: auto; } .text :global(pre code) { padding: 0; background: none; }
  .text :global(blockquote) { margin: 2px 0; padding-left: 12px; border-left: 3px solid var(--line); color: var(--muted); } .text :global(a) { color: var(--accent); text-underline-offset: 3px; }
  .quote { display: flex; gap: 6px; align-items: center; color: var(--muted); font-size: 12px; margin: 2px 0 3px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; padding-left: 8px; border-left: 2px solid var(--accent); }
  .thread-link { display: inline-flex; align-items: center; gap: 6px; margin-top: 4px; padding: 2px 8px; border-radius: 6px; color: var(--accent); font-size: 12px; font-weight: 600; } .thread-link:hover { background: var(--tile); }
  .pinbar { position: relative; display: flex; align-items: center; gap: 8px; padding: 6px 16px; border-bottom: 1px solid var(--line); background: var(--panel); font-size: 12px; }
  .pin-main { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1; border: 0; background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; } .pin-main span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }
  .pin-count { border: 1px solid var(--line); border-radius: 999px; background: none; color: var(--muted); font: inherit; padding: 2px 10px; cursor: pointer; }
  .pinlist { position: absolute; z-index: 6; top: 100%; left: 12px; right: 12px; margin: 4px 0 0; padding: 4px; list-style: none; max-height: 260px; overflow-y: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow); } .pinlist li { display: flex; align-items: center; gap: 4px; } .pinlist li > button:first-child { flex: 1; min-width: 0; display: flex; gap: 8px; border: 0; background: none; color: var(--text); font: inherit; text-align: left; padding: 6px 8px; border-radius: 7px; cursor: pointer; } .pinlist li > button:first-child:hover { background: var(--tile); } .pinlist span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }
  .pinned { display: inline-flex; align-items: center; gap: 3px; color: var(--muted); font-size: 11px; }
  .seen { position: relative; display: flex; justify-content: flex-end; margin-top: 3px; padding-right: 4px; font-size: 11px; color: var(--muted); }
  .seen-btn { display: inline-flex; align-items: center; gap: 6px; padding: 2px 4px; border-radius: 999px; color: inherit; } .seen-btn:hover { background: var(--tile); }
  .stack { display: inline-flex; } .stack :global(.wrap) { margin-left: -5px; box-shadow: 0 0 0 2px var(--bg); border-radius: 50%; animation: pop .18s ease-out; } .stack :global(.wrap:first-child) { margin-left: 0; }
  @keyframes pop { from { transform: scale(.4); opacity: 0; } to { transform: none; opacity: 1; } } @media (prefers-reduced-motion: reduce) { .stack :global(.wrap) { animation: none; } }
  .seen-list { position: absolute; z-index: 9; right: 0; top: calc(100% + 4px); min-width: 200px; max-height: 240px; overflow-y: auto; margin: 0; padding: 6px; list-style: none; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow); font-size: 13px; color: var(--text); }
  .seen-list.up { top: auto; bottom: calc(100% + 4px); }
  .seen-list li { display: flex; align-items: center; gap: 8px; padding: 4px 6px; } .seen-list .who { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .seen-list time { color: var(--muted); font-size: 11px; }
  .reacts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 5px; } .reacts button { display: inline-flex; flex: none; gap: 5px; align-items: center; white-space: nowrap; line-height: 20px; min-height: 24px; padding: 1px 9px; font-variant-numeric: tabular-nums; border-radius: 999px; background: var(--tile); border: 1px solid var(--line); font-size: 12px; font-weight: 600; } .reacts button span { font-size: 14px; line-height: 20px; } .reacts button:hover { border-color: var(--accent); } .reacts button { position: relative; } .reacts button.mine { background: color-mix(in srgb, var(--accent) 18%, var(--tile)); border-color: var(--accent); }
  .reacts button::after { content: attr(data-who); position: absolute; left: 0; bottom: calc(100% + 6px); max-width: min(240px, 72vw); width: max-content; padding: 5px 9px; border-radius: 7px; background: var(--text); color: var(--bg); font-size: 12px; font-weight: 500; white-space: normal; line-height: 1.35; display: none; pointer-events: none; z-index: 7; } .reacts button:hover::after, .reacts button:focus-visible::after { display: block; } @media (prefers-reduced-motion: reduce) { .reacts button::after { transition: none; } }
  .tools { display: none; position: absolute; top: -16px; right: 20px; z-index: 2; gap: 0; padding: 2px; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow); }
  /* content-visibility clips overflow; the toolbar and emoji picker hang outside the row, so lift it while the row is in use. */
  article:hover, article:focus-within, article.active { content-visibility: visible; }
  article:hover .tools, article:focus-within .tools, article.active .tools { display: flex; }
  /* Each action shows its name under the toolbar on hover or keyboard focus. The text is the button's own accessible name. */
  .tools .icon-btn { position: relative; }
  /* On a phone the toolbar must fit the screen: keep the two commonest quick reactions, the rest is behind the smiley. */
  @media (max-width: 720px) { .tools { right: 8px; max-width: calc(100vw - 16px); } .tools .quick:nth-of-type(n+3) { display: none; } }
  .tools .icon-btn::after { content: attr(aria-label); position: absolute; top: calc(100% + 8px); right: 0; width: max-content; max-width: 220px; padding: 4px 9px; border-radius: 7px; background: var(--text); color: var(--bg); font: 500 12px/1.3 var(--sans); white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity .12s .35s; z-index: 8; }
  .tools .icon-btn:hover::after, .tools .icon-btn:focus-visible::after { opacity: 1; }
  @media (prefers-reduced-motion: reduce) { .tools .icon-btn::after { transition: none; } } .tools .icon-btn { width: 30px; height: 28px; font-size: 15px; } .pw { position: relative; }
  .line { display: flex; align-items: flex-end; gap: 8px; } .line .text { flex: 1; min-width: 0; }
  .muted { display: inline-flex; margin-left: 8px; color: var(--muted); vertical-align: -1px; }
  .tick { display: inline-flex; align-items: center; gap: 6px; flex: none; margin-bottom: 3px; color: var(--muted); }
  .tick.st-sent, .tick.st-seen { animation: tickpop .22s ease-out; } .tick.st-seen { color: var(--accent); }
  @keyframes tickpop { from { transform: scale(.6); opacity: .3; } to { transform: none; opacity: 1; } }
  .spin { width: 12px; height: 12px; border-radius: 50%; border: 2px solid currentColor; border-top-color: transparent; animation: spin .8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .tick.st-sent, .tick.st-seen { animation: none; } .spin { animation: none; border-top-color: currentColor; opacity: .6; } }
  .tick.st-failed { color: var(--danger); font-size: 12px; } .tick.st-failed .note { font-weight: 600; } .tick.st-failed button { padding: 1px 6px; border-radius: 6px; color: inherit; text-decoration: underline; font-size: 12px; } .tick.st-failed button:hover { background: color-mix(in srgb, var(--danger) 14%, transparent); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .dots { display: inline-flex; gap: 3px; margin-right: 6px; vertical-align: 1px; } .dots i { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); animation: blip 1.2s infinite; } .dots i:nth-child(2) { animation-delay: .2s; } .dots i:nth-child(3) { animation-delay: .4s; } @keyframes blip { 0%, 60%, 100% { opacity: .25; } 30% { opacity: 1; } } @media (prefers-reduced-motion: reduce) { .dots i { animation: none; } }
  .toast { position: absolute; left: 50%; bottom: 96px; transform: translateX(-50%); padding: 8px 14px; border-radius: 8px; background: var(--text); color: var(--bg); font-size: 13px; z-index: 6; box-shadow: var(--shadow); }
  .typing { height: 22px; padding: 0 20px; font-size: 12px; color: var(--muted); flex: none; }
  footer { padding: 0 16px 10px; flex: none; }
  .composer { background: var(--tile); border: 1px solid var(--line); border-radius: 12px; } .composer:focus-within { border-color: var(--accent); }
  .ctx { display: flex; align-items: center; gap: 6px; padding: 6px 8px 6px 12px; font-size: 12px; color: var(--muted); border-bottom: 1px solid var(--line); } .ctx .clip { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .ctx button { margin-left: auto; } .err { color: var(--danger); border: 0; }
  .input { display: flex; align-items: flex-end; gap: 2px; padding: 6px; }
  .tray { list-style: none; margin: 0; padding: 8px 8px 0; display: flex; flex-wrap: wrap; gap: 8px; }
  .tray li { position: relative; display: flex; align-items: center; gap: 8px; max-width: 240px; padding: 5px 6px 5px 5px; border-radius: 10px; background: var(--tile); border: 1px solid var(--line); overflow: hidden; } .tray li.bad { border-color: var(--danger); }
  .tray img { width: 38px; height: 38px; border-radius: 7px; object-fit: cover; flex: none; } .tray .ico { width: 38px; height: 38px; border-radius: 7px; display: grid; place-items: center; background: var(--line); color: var(--muted); flex: none; }
  .tray .meta { display: grid; min-width: 0; font-size: 12px; } .tray .meta b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; } .tray .meta small { color: var(--muted); } .tray li.bad small { color: var(--danger); }
  .tray .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: var(--line); } .tray .bar i { display: block; height: 100%; background: var(--accent); transition: width .15s; }
  /* Formatting buttons appear while the box has focus */
  .fmt { display: none; gap: 2px; padding: 4px 8px 0; } .composer:focus-within .fmt { display: flex; } .fmt .icon-btn { width: 28px; height: 26px; font-size: 13px; color: var(--muted); border-radius: 6px; } .fmt .icon-btn:hover { background: var(--tile); color: var(--text); }
  .dropzone { position: absolute; inset: 0; z-index: 20; display: grid; place-items: center; background: color-mix(in srgb, var(--bg) 82%, transparent); border: 2px dashed var(--accent); border-radius: 12px; margin: 8px; pointer-events: none; } .dropzone span { display: inline-flex; gap: 10px; align-items: center; font-weight: 650; font-size: 16px; }
  .emo { font-size: 20px; width: 22px; text-align: center; }
  .send.mic { background: var(--tile); color: var(--text); } .send.mic:hover { background: var(--accent); color: var(--accent-ink); }
  .sendingvoice { flex: 1; display: flex; align-items: center; gap: 10px; padding: 8px; color: var(--muted); font-size: 13px; }
  .spin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid currentColor; border-top-color: transparent; animation: spin .8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spin { animation: none; } .tray .bar i { transition: none; } }
.mentions { list-style: none; margin: 0 0 6px; padding: 4px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); box-shadow: 0 8px 24px rgb(0 0 0 / .25); } .mentions li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 7px; color: var(--text); cursor: pointer; } .mentions li.on { background: var(--tile); } .mentions small { margin-left: auto; color: var(--muted); font-size: 11px; }
  /* The mirror sits behind the text box with the same text and metrics; only its backgrounds (the pills) show. */
  .field { position: relative; flex: 1; min-width: 0; display: flex; }
  .mirror, textarea { font: inherit; line-height: inherit; letter-spacing: inherit; padding: 7px 6px; white-space: pre-wrap; overflow-wrap: break-word; word-break: normal; box-sizing: border-box; border: 0; }
  .mirror { position: absolute; inset: 0; color: transparent; pointer-events: none; overflow: hidden; }
  .pill { background: color-mix(in srgb, var(--accent) 24%, transparent); border-radius: 5px; box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--accent) 24%, transparent); }
  textarea { position: relative; flex: 1; min-width: 0; resize: none; max-height: 180px; background: none; field-sizing: content; } textarea:focus { border: 0; }
  .send { width: 34px; height: 34px; border-radius: 8px; display: grid; place-items: center; background: var(--accent); color: var(--accent-ink); } .send:disabled { background: transparent; color: var(--muted); opacity: .6; }
  .hint { margin-top: 6px; font-size: 11px; color: var(--muted); text-align: center; } @media (max-width: 720px) { .hint { display: none; } }
</style>
