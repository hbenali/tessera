import { clearDrafts } from './drafts'
import { mentionsUser, plainMentions } from './mentions'
import { toggled } from './pins'
import * as sdk from 'matrix-js-sdk'
import { security } from './security.svelte'
import { discover } from './discover'
import { setThumbLoader } from './media'
import { format, parse, type Route } from './route'
import { PUSH_APP_ID, currentSubscription, storePushSession, subscribe, unsubscribe, type PushConfig } from './push'

const SESSION_KEY = 'tessera.session'

/** Strip SDK noise ("MatrixError: [403] ... (url)") so people see the server's own message. */
export const friendlyError = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).replace(/^\w*Error:\s*(\[\d+\]\s*)?/, '').replace(/\s*\(https?:[^)]*\)\s*$/, '') || 'Something went wrong'

export interface Session {
  baseUrl: string
  accessToken: string
  userId: string
  deviceId: string
}

export interface Msg {
  id: string
  sender: string
  senderName: string
  body: string
  ts: number
  mine: boolean
  pending: boolean
  edited: boolean
  replyTo?: string
  reactions: Record<string, number>
  /** Who reacted with each emoji; eventId lets me take my own reaction back. */
  reactors: Record<string, { id: string; name: string; eventId?: string }[]>
  imageMxc?: string
  undecryptable?: boolean
  decrypting?: boolean
  threadReplies: number
  mentionsMe: boolean
  pinned: boolean
  /** People whose read position is at this message, most recent first. */
  seenBy?: { id: string; name: string; avatar?: string; ts?: number }[]
  /** Delivery of my own messages: sending, failed, sent to the server, or read by someone. */
  state?: 'sending' | 'failed' | 'sent' | 'seen'
  senderAvatar?: string
}

export interface RoomItem {
  id: string
  name: string
  unread: number
  highlight: number
  lastTs: number
  isSpace: boolean
  parents: string[]
  isDM: boolean
  encrypted: boolean
  invited: boolean
  preview: string
  topic: string
  memberCount: number
  avatar?: string
  /** The other person in a direct chat. */
  dmUser?: string
  /** Notification level for this room, from my push rules. */
  notifs: 'all' | 'mentions' | 'mute'
  favourite: boolean
  /** Someone else is typing here right now. */
  typing: boolean
}

export type Presence = 'online' | 'unavailable' | 'offline'
const PRESENCE_KEY = 'tessera.presence'
const readPresence = (): Presence => {
  try {
    const v = localStorage.getItem(PRESENCE_KEY)
    return v === 'unavailable' || v === 'offline' ? v : 'online'
  } catch {
    return 'online'
  }
}

export interface MessageHit {
  roomId: string
  roomName: string
  eventId: string
  sender: string
  snippet: string
  ts: number
}

export interface Member {
  id: string
  name: string
  avatar?: string
}

class Chat {
  client: sdk.MatrixClient | null = null
  userId = $state('')
  ready = $state(false)
  error = $state('')
  rooms = $state<RoomItem[]>([])
  activeSpace = $state<string | null>(null)
  activeRoom = $state<string | null>(null)
  /** A room named in the URL that this account has not joined; the timeline offers to join it. */
  routeMissing = $state<string | null>(null)
  private routed = false
  messages = $state<Msg[]>([])
  typing = $state<string[]>([])
  /** Presence of people we have seen, kept reactive because the SDK's User objects are not. */
  presence = $state<Record<string, Presence>>({})
  myStatus = $state<Presence>(readPresence())
  /** Background (web push) notifications are on for this browser and account. */
  pushOn = $state(false)
  me = $state<{ name: string; avatar?: string }>({ name: '' })
  loadingOlder = $state(false)
  focusEvent = $state<string | null>(null)
  pinnedIds = $state<string[]>([])
  olderAvailable = $state(false)
  pinned = $state<{ id: string; sender: string; body: string }[]>([])
  canPin = $state(false)
  private pinToken = 0
  threadRoot = $state<string | null>(null)
  threadMessages = $state<Msg[]>([])
  members = $state<Member[]>([])

  loadSession(): Session | null {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null')
    } catch {
      return null
    }
  }

  /** Finish an SSO redirect if the URL carries a login token. Returns true when handled. */
  async finishSso(): Promise<boolean> {
    const url = new URL(location.href)
    const token = url.searchParams.get('loginToken')
    const baseUrl = sessionStorage.getItem('tessera.sso.baseUrl')
    if (!token || !baseUrl) return false
    url.searchParams.delete('loginToken')
    history.replaceState(null, '', url.pathname + url.search)
    sessionStorage.removeItem('tessera.sso.baseUrl')
    try {
      const r = await sdk.createClient({ baseUrl }).loginWithToken(token)
      const session: Session = { baseUrl, accessToken: r.access_token, userId: r.user_id, deviceId: r.device_id }
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
      await this.start(session)
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
    }
    return true
  }

  async login(server: string, user: string, password: string) {
    this.error = ''
    try {
      const baseUrl = await discover(server)
      const tmp = sdk.createClient({ baseUrl })
      const r = await tmp.loginWithPassword(user, password)
      const session: Session = {
        baseUrl,
        accessToken: r.access_token,
        userId: r.user_id,
        deviceId: r.device_id,
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
      await this.start(session)
    } catch (e) {
      this.error = friendlyError(e)
    }
  }

  async start(s: Session) {
    this.userId = s.userId
    // A tapped notification asks the open window to show its room. Listen from the very start: the room list can
    // appear from the local cache well before the first sync, and the hash is read again when it completes.
    navigator.serviceWorker?.addEventListener('message', (e) => {
      if (e.data?.type === 'open' && typeof e.data.hash === 'string' && e.data.hash.startsWith('#/room/')) location.hash = e.data.hash
    })
    const store = new sdk.IndexedDBStore({
      indexedDB: window.indexedDB,
      localStorage: window.localStorage,
      dbName: `tessera-sync-${s.userId}`,
    })
    const client = sdk.createClient({
      baseUrl: s.baseUrl,
      accessToken: s.accessToken,
      userId: s.userId,
      deviceId: s.deviceId,
      store,
      cryptoCallbacks: security.callbacks,
      verificationMethods: ['m.sas.v1', 'm.qr_code.scan.v1', 'm.qr_code.show.v1', 'm.reciprocate.v1'],
    })
    this.client = client
    await store.startup()
    await client.initRustCrypto({ cryptoDatabasePrefix: `tessera-crypto-${s.userId}` })
    security.attach(client)
    setThumbLoader((m, s, method) => this.thumb(m, s, method))
    security.refresh()
    client.on(sdk.MatrixEventEvent.Decrypted, (ev) => {
      this.refreshMessages()
      this.maybeNotify(ev)
    })
    window.addEventListener('popstate', () => this.routed && this.applyRoute())
    client.on(sdk.ClientEvent.Sync, (state) => {
      if (state === 'PREPARED' || state === 'SYNCING') {
        this.ready = true
        this.refreshRooms()
        this.refreshMessages()
        if (!this.routed) { this.routed = true; this.applyRoute(true) }
      } else if (state === 'ERROR') {
        this.error = 'Connection lost, retrying…'
      }
    })
    client.on(sdk.RoomEvent.Timeline, (ev, _room, toStart, _removed, data) => {
      this.refreshRooms()
      this.refreshMessages()
      if (!toStart && data?.liveEvent && ev.getType() === 'm.room.message') this.maybeNotify(ev)
    })
    client.on(sdk.RoomEvent.Receipt, () => { this.refreshRooms(); this.scheduleRefresh() })
    client.on(sdk.ThreadEvent.Update as never, (() => this.scheduleRefresh()) as never)
    client.on(sdk.ThreadEvent.NewReply as never, (() => this.scheduleRefresh()) as never)
    client.on('Thread.new' as never, (() => this.scheduleRefresh()) as never)
    // Push rules and tags change from other devices too, and the list shows both.
    client.on(sdk.ClientEvent.AccountData, (ev) => {
      if (ev.getType() === 'm.push_rules') this.refreshRooms()
      if (ev.getType() === Chat.QUIET) this.loadQuiet()
    })
    client.on(sdk.RoomEvent.Tags, () => this.refreshRooms())
    client.on(sdk.RoomMemberEvent.Typing, () => { this.refreshTyping(); this.refreshRooms() })
    client.on(sdk.UserEvent.Presence, (_e, u) => { this.presence[u.userId] = u.presence as Presence })
    client.on(sdk.RoomEvent.LocalEchoUpdated, () => this.refreshMessages())
    client.on(sdk.RoomStateEvent.Events, () => this.refreshRooms())
    await client.startClient({ initialSyncLimit: 30, lazyLoadMembers: true, threadSupport: true })
    this.loadProfile()
    this.setStatus(this.myStatus)
    this.refreshPush()
    this.loadQuiet()
  }

  async logout() {
    await this.disablePush().catch(() => {})
    try {
      await this.client?.logout(true)
    } catch {
      /* token may already be invalid */
    }
    this.client?.stopClient()
    await this.client?.clearStores().catch(() => {})
    localStorage.removeItem(SESSION_KEY)
    clearDrafts()
    location.reload()
  }

  private dmRoomIds(): Set<string> {
    const direct = this.client?.getAccountData('m.direct' as never)?.getContent() ?? {}
    return new Set(Object.values(direct).flat() as string[])
  }

  private previewOf(room: sdk.Room): string {
    const ev = room
      .getLiveTimeline()
      .getEvents()
      .findLast((e) => ['m.room.message', 'm.room.encrypted'].includes(e.getType()) && !e.isRedacted())
    if (!ev) return ''
    const c = ev.getContent()
    if (ev.getType() === 'm.room.encrypted' || c.msgtype === 'm.bad.encrypted') return 'Encrypted message'
    const who = ev.getSender() === this.userId ? 'You' : (room.getMember(ev.getSender() ?? '')?.name ?? '')
    const what = c.msgtype === 'm.image' ? 'Photo' : c.msgtype === 'm.file' ? 'File' : plainMentions(c.body ?? '', (id) => room.getMember(id)?.name)
    return `${who}: ${what}`
  }

  refreshRooms() {
    const c = this.client
    if (!c) return
    const dms = this.dmRoomIds()
    const items: RoomItem[] = []
    for (const room of c.getRooms()) {
      const membership = room.getMyMembership()
      if (membership !== 'join' && membership !== 'invite') continue
      const create = room.currentState.getStateEvents('m.room.create', '')
      const parents = room.currentState
        .getStateEvents('m.space.parent')
        .map((e) => e.getStateKey() as string)
      items.push({
        id: room.roomId,
        name: room.name,
        unread: room.getUnreadNotificationCount(sdk.NotificationCountType.Total) ?? 0,
        highlight: room.getUnreadNotificationCount(sdk.NotificationCountType.Highlight) ?? 0,
        lastTs: room.getLastActiveTimestamp(),
        isSpace: create?.getContent().type === 'm.space',
        parents,
        isDM: dms.has(room.roomId),
        encrypted: c.isRoomEncrypted(room.roomId),
        invited: membership === 'invite',
        preview: this.previewOf(room),
        topic: room.currentState.getStateEvents('m.room.topic', '')?.getContent().topic ?? '',
        memberCount: room.getJoinedMemberCount(),
        dmUser: dms.has(room.roomId) ? this.otherMember(room)?.userId : undefined,
        notifs: this.roomNotifs(room.roomId),
        favourite: !!room.tags['m.favourite'],
        typing: room.getMembers().some((m) => m.typing && m.userId !== this.userId),
        avatar: room.getMxcAvatarUrl() ?? (dms.has(room.roomId) ? this.otherMember(room)?.getMxcAvatarUrl() : undefined) ?? undefined,
      })
    }
    items.sort((a, b) => b.lastTs - a.lastTs)
    // Children of a space are declared on the space via m.space.child
    for (const sp of items.filter((i) => i.isSpace)) {
      const room = c.getRoom(sp.id)!
      for (const ev of room.currentState.getStateEvents('m.space.child')) {
        const child = items.find((i) => i.id === ev.getStateKey())
        if (child && Object.keys(ev.getContent()).length && !child.parents.includes(sp.id))
          child.parents.push(sp.id)
      }
    }
    this.rooms = items
  }

  /** Rooms visible for the current space filter, DMs shown under "Home". */
  get visibleRooms(): RoomItem[] {
    const rooms = this.rooms.filter((r) => !r.isSpace)
    if (this.activeSpace) return rooms.filter((r) => r.parents.includes(this.activeSpace!))
    return rooms
  }

  get spaces(): RoomItem[] {
    return this.rooms.filter((r) => r.isSpace)
  }

  get active(): RoomItem | undefined {
    return this.rooms.find((r) => r.id === this.activeRoom)
  }

  /** Put the open room in the address bar so it can be bookmarked, shared and reached with Back. */
  private pushRoute(r: Route) {
    const h = format(r)
    if (location.hash === h || (!h && !location.hash)) return
    history.pushState(null, '', h || location.pathname + location.search)
  }

  /** The room I had open last time, per account, so the app comes back where I left it. */
  private lastKey = () => `tessera.lastRoom.${this.userId}`
  private rememberRoom(id: string | null) {
    try {
      if (id) localStorage.setItem(this.lastKey(), id)
      else localStorage.removeItem(this.lastKey())
    } catch {
      /* storage blocked: nothing to remember with */
    }
  }
  private lastRoom(): string | null {
    try {
      return localStorage.getItem(this.lastKey())
    } catch {
      return null
    }
  }

  /** Open whatever the address bar names. On a first start with no link, reopen the last room. */
  applyRoute(initial = false) {
    let r = parse(location.hash)
    this.routeMissing = null
    if (!r.room && initial) {
      const last = this.lastRoom()
      if (last && this.client?.getRoom(last)?.getMyMembership() === 'join') {
        r = { room: last }
        history.replaceState(null, '', format(r)) // show it in the address bar without adding a Back step
      }
    }
    if (!r.room) {
      this.activeRoom = null
      return
    }
    const room = r.room.startsWith('#') ? this.client?.getRooms().find((x) => x.getCanonicalAlias() === r.room || x.getAltAliases().includes(r.room!)) : this.client?.getRoom(r.room)
    if (room?.getMyMembership() === 'join') {
      this.openRoom(room.roomId, false).then(() => { if (r.event) this.focusEvent = r.event })
    } else {
      this.activeRoom = null
      this.routeMissing = r.room
    }
  }

  closeRoom() {
    this.rememberRoom(null) // going back to the list on purpose: do not reopen it next time
    this.activeRoom = null
    this.routeMissing = null
    this.pushRoute({})
  }

  /** A link to a room, or to one message in it, that works when pasted into this app's address bar. */
  permalink(roomId: string, eventId?: string): string {
    return location.origin + location.pathname + format({ room: roomId, event: eventId })
  }

  async openRoom(id: string, push = true) {
    this.activeRoom = id
    this.routeMissing = null
    if (push) this.pushRoute({ room: id })
    this.rememberRoom(id)
    this.closeThread()
    this.messages = []
    this.refreshMessages()
    this.refreshTyping()
    const room = this.client?.getRoom(id)
    if (room) {
      const last = room.getLiveTimeline().getEvents().at(-1)
      if (last) await this.sendRead(room.roomId, last)
    }
  }

  /** Rooms where I read quietly: my read state is kept, but other people are not shown that I have read. */
  quietRooms = $state<string[]>([])
  private static QUIET = 'ovh.hbenali.tessera.quiet_rooms'
  isQuiet = (roomId: string) => this.quietRooms.includes(roomId)

  private loadQuiet() {
    const c = this.client?.getAccountData(Chat.QUIET as never)?.getContent() as { rooms?: unknown } | undefined
    this.quietRooms = Array.isArray(c?.rooms) ? c.rooms.filter((r): r is string => typeof r === 'string') : []
  }

  /** Stored as account data, so the choice follows you to your other devices. */
  async setQuiet(roomId: string, on: boolean) {
    const rooms = on ? [...new Set([...this.quietRooms, roomId])] : this.quietRooms.filter((r) => r !== roomId)
    this.quietRooms = rooms
    await this.client!.setAccountData(Chat.QUIET as never, { rooms } as never)
  }

  /**
   * Mark a room read up to an event. A quiet room uses a private receipt (m.read.private): the server still counts
   * the room as read for me and my other devices, but no one else sees "seen". The fully-read marker is private anyway.
   */
  private async sendRead(roomId: string, last: sdk.MatrixEvent) {
    const c = this.client!
    if (this.isQuiet(roomId)) {
      await c.sendReadReceipt(last, sdk.ReceiptType.ReadPrivate).catch(() => {})
      await c.setRoomReadMarkers(roomId, last.getId()!, undefined, last).catch(() => {})
    } else {
      await c.sendReadReceipt(last).catch(() => {})
    }
  }

  refreshTyping() {
    const room = this.activeRoom ? this.client?.getRoom(this.activeRoom) : null
    this.typing = room
      ? room
          .getMembers()
          .filter((m) => m.typing && m.userId !== this.userId)
          .map((m) => m.name)
      : []
  }

  /** Turn raw events (main timeline or a thread) into display messages, folding in edits and reactions. */
  private build(events: sdk.MatrixEvent[], room: sdk.Room): Msg[] {
    const c = this.client!
    const reactions = new Map<string, Record<string, number>>()
    const reactors = new Map<string, Msg['reactors']>()
    const edits = new Map<string, string>()
    for (const ev of events) {
      const rel = ev.getContent()['m.relates_to']
      if (ev.getType() === 'm.reaction' && rel?.event_id && rel.key) {
        const r = reactions.get(rel.event_id) ?? {}
        r[rel.key] = (r[rel.key] ?? 0) + 1
        reactions.set(rel.event_id, r)
        const who = reactors.get(rel.event_id) ?? {}
        const from = ev.getSender() ?? ''
        ;(who[rel.key] ??= []).push({ id: from, name: room.getMember(from)?.name ?? from, eventId: ev.getId() })
        reactors.set(rel.event_id, who)
      } else if (rel?.rel_type === 'm.replace' && ev.getContent()['m.new_content']) {
        edits.set(rel.event_id as string, ev.getContent()['m.new_content'].body)
      }
    }
    const out: Msg[] = []
    for (const ev of events) {
      const encrypted = ev.getType() === 'm.room.encrypted'
      if ((ev.getType() !== 'm.room.message' && !encrypted) || ev.isRedacted()) continue
      const content = ev.getContent()
      if (content['m.relates_to']?.rel_type === 'm.replace') continue
      const id = ev.getId() ?? ev.getTxnId() ?? String(ev.getTs())
      const sender = ev.getSender() ?? ''
      const bad = (encrypted && ev.isDecryptionFailure()) || content.msgtype === 'm.bad.encrypted'
      const imageMxc: string | undefined = content.msgtype === 'm.image' && typeof content.url === 'string' ? content.url : undefined
      out.push({
        id,
        sender,
        senderName: room.getMember(sender)?.name ?? sender,
        body: bad
          ? 'Cannot decrypt this message. It was probably sent before this device had access to the room keys. Verify this session or restore your recovery key in Settings.'
          : encrypted
            ? 'Decrypting…'
            : (edits.get(id) ?? content.body ?? ''),
        undecryptable: bad,
        decrypting: encrypted && !bad,
        ts: ev.getTs(),
        mine: sender === this.userId,
        pending: ev.status != null,
        edited: edits.has(id),
        replyTo: content['m.relates_to']?.['m.in_reply_to']?.event_id,
        reactions: reactions.get(id) ?? {},
        reactors: reactors.get(id) ?? {},
        imageMxc,
        threadReplies: ev.isThreadRoot ? (ev.getThread()?.length ?? 0) : 0,
        senderAvatar: room.getMember(sender)?.getMxcAvatarUrl() ?? undefined,
        pinned: this.pinnedIds.includes(id),
        mentionsMe: sender !== this.userId && mentionsUser(content, this.userId, this.client?.getUser(this.userId)?.displayName),
      })
    }
    const byId = new Map(events.map((e) => [e.getId() ?? e.getTxnId(), e]))
    // Where each other member has read up to, as an index into this event list. A receipt often sits on an event
    // that is not shown (a reaction, a join), so compare positions instead of asking per message.
    const pos = new Map(events.map((e, i) => [e.getId(), i]))
    const readers = room
      .getJoinedMembers()
      .filter((m) => m.userId !== this.userId)
      .map((m) => ({ m, at: pos.get(room.getEventReadUpTo(m.userId) ?? '') ?? -1, ts: room.getReadReceiptForUserId(m.userId)?.data?.ts }))
      .filter((r) => r.at >= 0)
    // Each reader is shown once, on the last shown message at or before their position: that is where they stopped.
    const at = out.map((m) => pos.get(m.id) ?? -1)
    for (const r of readers) {
      let i = out.length - 1
      while (i >= 0 && !(at[i] >= 0 && at[i] <= r.at)) i--
      if (i < 0 || out[i].sender === r.m.userId) continue // sending a message already says you saw it
      ;(out[i].seenBy ??= []).push({ id: r.m.userId, name: r.m.name, avatar: r.m.getMxcAvatarUrl() ?? undefined, ts: r.ts })
    }
    for (const m of out) m.seenBy?.sort((x, y) => (y.ts ?? 0) - (x.ts ?? 0))
    // My message is "seen" once anyone has read at or after it: a receipt on a later event covers the earlier ones.
    const furthest = Math.max(-1, ...readers.map((r) => r.at))
    out.forEach((m) => {
      if (!m.mine) return
      const st = byId.get(m.id)?.status
      m.state = st === 'not_sent' ? 'failed' : m.pending ? 'sending' : (pos.get(m.id) ?? Infinity) <= furthest ? 'seen' : 'sent'
    })
    return out
  }

  private refreshTimer: ReturnType<typeof setTimeout> | undefined
  /** Thread state settles just after its events fire, so refresh a beat later. */
  scheduleRefresh() {
    clearTimeout(this.refreshTimer)
    this.refreshTimer = setTimeout(() => this.refreshMessages(), 120)
  }

  refreshMessages() {
    const room = this.activeRoom ? this.client?.getRoom(this.activeRoom) : null
    if (!this.client || !room) return
    this.pinnedIds = (room.currentState.getStateEvents('m.room.pinned_events', '')?.getContent().pinned as string[] | undefined) ?? []
    this.canPin = room.currentState.maySendStateEvent('m.room.pinned_events', this.userId)
    this.messages = this.build(room.getLiveTimeline().getEvents(), room)
    this.loadPinned(room)
    this.olderAvailable = this.hasOlder()
    this.members = room
      .getJoinedMembers()
      .map((m) => ({ id: m.userId, name: m.name, avatar: m.getMxcAvatarUrl() ?? undefined }))
      .sort((a, b) => a.name.localeCompare(b.name))
    this.refreshThread()
  }

  refreshThread() {
    const room = this.activeRoom ? this.client?.getRoom(this.activeRoom) : null
    const thread = this.threadRoot ? room?.getThread(this.threadRoot) : null
    if (!room || !this.threadRoot) {
      this.threadMessages = []
      return
    }
    // The root is always part of the thread view, even before the server has replies for it.
    const root = room.findEventById(this.threadRoot)
    const events = thread ? thread.events : root ? [root] : []
    this.threadMessages = this.build(events, room)
  }

  openThread(rootId: string) {
    this.threadRoot = rootId
    this.refreshThread()
  }

  closeThread() {
    this.threadRoot = null
    this.threadMessages = []
  }

  async sendInThread(body: string) {
    if (!this.activeRoom || !this.threadRoot || !body.trim()) return
    await this.client!.sendMessage(this.activeRoom, this.threadRoot, { msgtype: 'm.text', body } as never)
    this.scheduleRefresh()
  }

  /** Text of each pinned message, from the loaded timeline or fetched (and decrypted) when it is older. */
  private async loadPinned(room: sdk.Room) {
    const token = ++this.pinToken
    const c = this.client!
    const out: { id: string; sender: string; body: string }[] = []
    for (const id of this.pinnedIds) {
      let ev = room.findEventById(id) ?? null
      if (!ev) {
        try {
          ev = new sdk.MatrixEvent(await c.fetchRoomEvent(room.roomId, id))
          await c.decryptEventIfNeeded(ev)
        } catch { /* not visible to us: show a placeholder */ }
      }
      const body = ev && !ev.isDecryptionFailure() ? ev.getContent().body : undefined
      out.push({ id, sender: ev ? (room.getMember(ev.getSender() ?? '')?.name ?? ev.getSender() ?? '') : '', body: plainMentions(String(body ?? 'Pinned message'), (u) => room.getMember(u)?.name) })
    }
    if (token === this.pinToken) this.pinned = out
  }

  async togglePin(id: string) {
    if (!this.activeRoom) return
    await this.client!.sendStateEvent(this.activeRoom, 'm.room.pinned_events' as never, { pinned: toggled(this.pinnedIds, id) } as never, '')
  }

  /** False once the start of the room's history has been reached. */
  hasOlder(): boolean {
    const room = this.activeRoom ? this.client?.getRoom(this.activeRoom) : null
    return !!room?.getLiveTimeline().getPaginationToken(sdk.Direction.Backward)
  }

  async loadOlder() {
    const room = this.activeRoom ? this.client?.getRoom(this.activeRoom) : null
    if (!room || this.loadingOlder) return
    this.loadingOlder = true
    try {
      await this.client!.scrollback(room, 30)
    } finally {
      this.loadingOlder = false
      this.olderAvailable = this.hasOlder()
    }
  }

  async send(body: string, replyTo?: string) {
    if (!this.activeRoom || !body.trim()) return
    const content: Record<string, unknown> = { msgtype: 'm.text', body }
    // Structured mentions so the right people are notified even if display names change.
    const ids = this.members.map((m) => m.id).filter((id) => id !== this.userId && body.includes(id))
    if (ids.length) content['m.mentions'] = { user_ids: ids }
    if (replyTo) content['m.relates_to'] = { 'm.in_reply_to': { event_id: replyTo } }
    await this.client!.sendMessage(this.activeRoom, content as never)
  }

  async edit(id: string, body: string) {
    if (!this.activeRoom) return
    await this.client!.sendMessage(this.activeRoom, {
      msgtype: 'm.text',
      body: `* ${body}`,
      'm.new_content': { msgtype: 'm.text', body },
      'm.relates_to': { rel_type: 'm.replace', event_id: id },
    } as never)
  }

  /** React with an emoji, or take my own reaction back if I already used it. */
  async react(id: string, key: string) {
    if (!this.activeRoom) return
    const own = [...this.messages, ...this.threadMessages].find((m) => m.id === id)?.reactors[key]?.find((u) => u.id === this.userId)
    if (own?.eventId) {
      await this.client!.redactEvent(this.activeRoom, own.eventId)
      return
    }
    await this.client!.sendEvent(this.activeRoom, 'm.reaction' as never, {
      'm.relates_to': { rel_type: 'm.annotation', event_id: id, key },
    } as never)
  }

  async upload(file: File) {
    if (!this.activeRoom) return
    const { content_uri } = await this.client!.uploadContent(file, { name: file.name })
    const isImg = file.type.startsWith('image/')
    await this.client!.sendMessage(this.activeRoom, {
      msgtype: isImg ? 'm.image' : 'm.file',
      body: file.name,
      url: content_uri,
      info: { mimetype: file.type, size: file.size },
    } as never)
  }

  setTyping(on: boolean) {
    if (this.activeRoom) this.client?.sendTyping(this.activeRoom, on, 5000).catch(() => {})
  }

  async createRoom(name: string, encrypted = true) {
    const r = await this.client!.createRoom({
      name,
      preset: sdk.Preset.PrivateChat,
      initial_state: encrypted
        ? [{ type: 'm.room.encryption', state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } }]
        : [],
    })
    this.openRoom(r.room_id)
  }

  private notified = new Set<string>()

  /** Desktop notification for a live message in a room you are not looking at. */
  private maybeNotify(ev: sdk.MatrixEvent) {
    const c = this.client
    const id = ev.getId()
    if (!c || !this.ready || !id || this.notified.has(id)) return
    if (ev.getSender() === this.userId || ev.getType() !== 'm.room.message') return
    if (ev.getTs() < Date.now() - 60_000) return // history, not live
    if (!document.hidden && ev.getRoomId() === this.activeRoom) return
    if (!c.getPushActionsForEvent(ev)?.notify) return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    this.notified.add(id)
    const room = c.getRoom(ev.getRoomId())
    const body = ev.getContent().msgtype === 'm.text' ? plainMentions(ev.getContent().body, (id) => room?.getMember(id)?.name) : 'Sent an attachment'
    const n = new Notification(room?.name ?? 'Tessera', { body: `${room?.getMember(ev.getSender() ?? '')?.name ?? ''}: ${body}`, tag: ev.getRoomId() ?? undefined })
    n.onclick = () => { window.focus(); if (ev.getRoomId()) this.openRoom(ev.getRoomId()!) }
  }

  /**
   * Per-room notification level as ordinary push rules, so other clients agree:
   * mentions = room rule with no actions; mute = override rule matching the room (beats mention rules).
   */
  /** Mark everything in a room as read, for me and for the unread badge on other devices. */
  async markRead(roomId: string) {
    const room = this.client?.getRoom(roomId)
    const last = room?.getLiveTimeline().getEvents().at(-1)
    if (!room || !last) return
    await this.sendRead(roomId, last)
    this.refreshRooms()
  }

  async setFavourite(roomId: string, on: boolean) {
    if (on) await this.client!.setRoomTag(roomId, 'm.favourite', { order: 0.5 })
    else await this.client!.deleteRoomTag(roomId, 'm.favourite')
  }

  roomNotifs(roomId: string): 'all' | 'mentions' | 'mute' {
    const rules = this.client?.pushRules?.global
    if (rules?.override?.some((r) => r.enabled && r.rule_id === roomId)) return 'mute'
    return rules?.room?.some((r) => r.enabled && r.rule_id === roomId && r.actions.length === 0) ? 'mentions' : 'all'
  }

  private notifQueue: Promise<unknown> = Promise.resolve()

  /** Changes run one after another: each is several requests, and quick clicks must not interleave. */
  setRoomNotifs(roomId: string, level: 'all' | 'mentions' | 'mute'): Promise<void> {
    const run = this.notifQueue.then(() => this.applyRoomNotifs(roomId, level))
    this.notifQueue = run.catch(() => {})
    return run
  }

  private async applyRoomNotifs(roomId: string, level: 'all' | 'mentions' | 'mute') {
    const c = this.client!
    // The cached rules lag behind the server, so PUT/DELETE rather than trusting them.
    const drop = (kind: string) => c.deletePushRule('global', kind as never, roomId).catch(() => {})
    if (level === 'mute') {
      await c.addPushRule('global', 'override' as never, roomId, {
        actions: [],
        conditions: [{ kind: 'event_match', key: 'room_id', pattern: roomId }],
      } as never)
      await drop('room')
    } else if (level === 'mentions') {
      await c.addPushRule('global', 'room' as never, roomId, { actions: [] })
      await drop('override')
    } else {
      await drop('room')
      await drop('override')
    }
    this.refreshRooms()
  }

  presenceOf = (id: string): Presence | undefined => this.presence[id] ?? (this.client?.getUser(id)?.presence as Presence | undefined)

  /** Load my own display name and avatar; the sidebar shows them. */
  async loadProfile() {
    try {
      const p = await this.client!.getProfileInfo(this.userId)
      this.me = { name: p.displayname || this.userId, avatar: p.avatar_url }
    } catch {
      this.me = { name: this.userId }
    }
  }

  async setMyAvatar(file: File) {
    const { content_uri } = await this.client!.uploadContent(file, { name: file.name })
    await this.client!.setAvatarUrl(content_uri)
    await this.loadProfile()
  }

  async setMyName(name: string) {
    await this.client!.setDisplayName(name.trim())
    await this.loadProfile()
  }

  /** Change my status. It is also sent with every sync, otherwise the next sync would put it back to online. */
  async setStatus(p: Presence) {
    this.myStatus = p
    try {
      localStorage.setItem(PRESENCE_KEY, p)
    } catch {
      /* not persisted in private mode */
    }
    const c = this.client
    if (!c) return
    await c.setSyncPresence(p as never).catch(() => {})
    await c.setPresence({ presence: p as never }).catch(() => {})
    this.presence[this.userId] = p
  }

  /** Is a pusher registered on the homeserver for this browser's subscription? Also keeps the service worker's session fresh. */
  async refreshPush() {
    try {
      const sub = await currentSubscription()
      const { pushers } = await this.client!.getPushers()
      this.pushOn = !!sub && pushers.some((p) => p.app_id === PUSH_APP_ID && p.pushkey === sub.p256dh)
      if (this.pushOn) await this.storeSession()
    } catch {
      this.pushOn = false
    }
  }

  private storeSession() {
    return storePushSession({ baseUrl: this.client!.getHomeserverUrl(), accessToken: this.client!.getAccessToken()!, userId: this.userId })
  }

  /** Subscribe this browser and tell the homeserver to send events to the push gateway. Needs notification permission. */
  async enablePush(cfg: PushConfig) {
    if (Notification.permission !== 'granted') throw new Error('Notifications are not allowed in this browser')
    const sub = await subscribe(cfg)
    await this.storeSession()
    await this.client!.setPusher({
      kind: 'http',
      app_id: PUSH_APP_ID,
      app_display_name: 'Tessera',
      device_display_name: 'Tessera in a browser',
      pushkey: sub.p256dh,
      lang: navigator.language || 'en',
      // Only the event id travels through the gateway; the service worker fetches the text itself.
      data: { url: cfg.gateway, format: 'event_id_only', endpoint: sub.endpoint, auth: sub.auth, events_only: true, default_payload: { user_id: this.userId } },
      append: true,
    } as never)
    this.pushOn = true
  }

  async disablePush() {
    const sub = await currentSubscription().catch(() => null)
    if (sub) await this.client?.setPusher({ kind: null, app_id: PUSH_APP_ID, pushkey: sub.p256dh } as never).catch(() => {})
    await unsubscribe().catch(() => {})
    await storePushSession(null).catch(() => {})
    this.pushOn = false
  }

  /** Display name for a user id, if the room or the client knows it. */
  nameOf = (id: string): string | undefined =>
    this.members.find((m) => m.id === id)?.name ?? this.client?.getUser(id)?.displayName ?? undefined

  private otherMember(room: sdk.Room) {
    return room.getJoinedMembers().find((m) => m.userId !== this.userId)
  }

  private media = new Map<string, Promise<string>>()

  /** Thumbnail of an mxc:// image as a blob URL; authenticated media cannot be used in a bare <img src>. */
  thumb(mxc: string, size: number, method: 'crop' | 'scale' = 'crop'): Promise<string> {
    const key = `${mxc}@${size}${method}`
    let hit = this.media.get(key)
    if (!hit) {
      const c = this.client!
      const url = c.mxcUrlToHttp(mxc, size * 2, size * 2, method, false, true, true)
      hit = url
        ? fetch(url, { headers: { Authorization: `Bearer ${c.getAccessToken()}` } }).then((r) => {
            if (!r.ok) throw new Error(String(r.status))
            return r.blob().then((b) => URL.createObjectURL(b))
          })
        : Promise.reject(new Error('no url'))
      hit.catch(() => this.media.delete(key))
      this.media.set(key, hit)
    }
    return hit
  }

  async setRoomAvatar(roomId: string, file: File) {
    const { content_uri } = await this.client!.uploadContent(file, { name: file.name })
    await this.client!.sendStateEvent(roomId, 'm.room.avatar' as never, { url: content_uri } as never, '')
  }

  async setRoomName(roomId: string, name: string) {
    await this.client!.setRoomName(roomId, name.trim())
  }

  async setRoomTopic(roomId: string, topic: string) {
    await this.client!.setRoomTopic(roomId, topic.trim())
  }

  canEditRoom(roomId: string): boolean {
    const room = this.client?.getRoom(roomId)
    return !!room?.currentState.maySendStateEvent('m.room.name', this.userId)
  }

  async deleteMessage(id: string) {
    if (this.activeRoom) await this.client!.redactEvent(this.activeRoom, id)
  }

  async searchUsers(term: string): Promise<{ id: string; name: string }[]> {
    const r = await this.client!.searchUserDirectory({ term, limit: 8 })
    return r.results.filter((u) => u.user_id !== this.userId).map((u) => ({ id: u.user_id, name: u.display_name || u.user_id }))
  }

  /** Open the existing direct chat with a user, or create an encrypted one. */
  async startDM(userId: string) {
    const c = this.client!
    const direct = (c.getAccountData('m.direct' as never)?.getContent() ?? {}) as Record<string, string[]>
    const existing = (direct[userId] ?? []).find((rid) => c.getRoom(rid)?.getMyMembership() === 'join')
    if (existing) return this.openRoom(existing)
    const r = await c.createRoom({
      is_direct: true,
      invite: [userId],
      preset: sdk.Preset.TrustedPrivateChat,
      initial_state: [{ type: 'm.room.encryption', state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } }],
    })
    await c.setAccountData('m.direct' as never, { ...direct, [userId]: [...(direct[userId] ?? []), r.room_id] } as never)
    this.openRoom(r.room_id)
  }

  /** Search messages already loaded on this device. Works in encrypted rooms because it reads decrypted events locally. */
  searchMessages(term: string, limit = 20): MessageHit[] {
    const q = term.trim().toLowerCase()
    const c = this.client
    if (q.length < 2 || !c) return []
    const hits: MessageHit[] = []
    for (const room of c.getRooms()) {
      if (room.getMyMembership() !== 'join') continue
      for (const ev of room.getLiveTimeline().getEvents()) {
        if (ev.getType() !== 'm.room.message' || ev.isRedacted()) continue
        const content = ev.getContent()
        if (content['m.relates_to']?.rel_type === 'm.replace') continue
        const body: string = typeof content.body === 'string' ? content.body : ''
        const i = body.toLowerCase().indexOf(q)
        if (i < 0) continue
        hits.push({
          roomId: room.roomId,
          roomName: room.name,
          eventId: ev.getId() ?? '',
          sender: room.getMember(ev.getSender() ?? '')?.name ?? ev.getSender() ?? '',
          snippet: (i > 30 ? '…' : '') + body.slice(Math.max(0, i - 30), i + 70),
          ts: ev.getTs(),
        })
      }
    }
    return hits.sort((a, b) => b.ts - a.ts).slice(0, limit)
  }

  /** Search the homeserver's index. It cannot see inside encrypted rooms, which searchMessages covers on this device. */
  async searchServer(term: string, limit = 20): Promise<MessageHit[]> {
    const q = term.trim()
    const c = this.client
    if (q.length < 2 || !c) return []
    const r = await c.search({
      body: {
        search_categories: {
          room_events: {
            search_term: q,
            keys: ['content.body'],
            order_by: 'recent',
            filter: { limit },
            event_context: { before_limit: 0, after_limit: 0, include_profile: true },
          },
        },
      },
    } as never)
    const lower = q.toLowerCase()
    const out: MessageHit[] = []
    for (const x of r.search_categories?.room_events?.results ?? []) {
      const e = x.result
      const content = e.content as { body?: unknown; 'm.relates_to'?: { rel_type?: string } }
      if (content['m.relates_to']?.rel_type === 'm.replace' || typeof content.body !== 'string') continue
      const body = content.body
      const i = Math.max(0, body.toLowerCase().indexOf(lower))
      const room = c.getRoom(e.room_id)
      out.push({
        roomId: e.room_id,
        roomName: room?.name ?? e.room_id,
        eventId: e.event_id,
        sender: x.context?.profile_info?.[e.sender]?.displayname ?? room?.getMember(e.sender)?.name ?? e.sender,
        snippet: (i > 30 ? '…' : '') + body.slice(Math.max(0, i - 30), i + 70),
        ts: e.origin_server_ts,
      })
    }
    return out
  }

  async openMessage(hit: MessageHit) {
    await this.openRoom(hit.roomId)
    // A server hit can be older than the loaded window: page back until it appears, within reason.
    const room = this.client?.getRoom(hit.roomId)
    for (let i = 0; room && i < 40 && !room.findEventById(hit.eventId) && this.hasOlder(); i++) await this.loadOlder()
    this.refreshMessages()
    this.focusEvent = hit.eventId
  }

  async leaveRoom(id: string) {
    await this.client!.leave(id)
    if (this.activeRoom === id) this.closeRoom()
    this.refreshRooms()
  }

  async invite(userId: string) {
    if (this.activeRoom) await this.client!.invite(this.activeRoom, userId)
  }

  async acceptInvite(id: string) {
    await this.client!.joinRoom(id)
    this.openRoom(id)
  }

  async declineInvite(id: string) {
    await this.client!.leave(id)
  }

  async joinRoom(alias: string) {
    const r = await this.client!.joinRoom(alias)
    this.openRoom(r.roomId)
  }
}

export const chat = new Chat()
