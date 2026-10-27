import * as sdk from 'matrix-js-sdk'
import { security } from './security.svelte'

const SESSION_KEY = 'tessera.session'

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
  imageUrl?: string
  undecryptable?: boolean
  decrypting?: boolean
  threadReplies: number
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
}

class Chat {
  client: sdk.MatrixClient | null = null
  userId = $state('')
  ready = $state(false)
  error = $state('')
  rooms = $state<RoomItem[]>([])
  activeSpace = $state<string | null>(null)
  activeRoom = $state<string | null>(null)
  messages = $state<Msg[]>([])
  typing = $state<string[]>([])
  loadingOlder = $state(false)
  focusEvent = $state<string | null>(null)
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

  /** Resolve a bare domain ("example.org") to a homeserver URL via .well-known. */
  async discover(server: string): Promise<string> {
    const s = server.trim().replace(/\/+$/, '')
    // A full URL is used as typed; only a bare domain goes through .well-known.
    if (/^https?:\/\//.test(s)) return s
    try {
      const r = await Promise.race([
        sdk.AutoDiscovery.findClientConfig(s),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
      ])
      const url = r['m.homeserver']?.base_url
      if (url) return url
    } catch {
      /* fall through to the domain itself */
    }
    return `https://${s}`
  }

  /** What the homeserver offers: password login and/or single sign-on providers. */
  async loginOptions(server: string): Promise<{ password: boolean; sso: { id: string; name: string }[]; baseUrl: string }> {
    const baseUrl = await this.discover(server)
    const flows = (await sdk.createClient({ baseUrl }).loginFlows()).flows
    const sso = flows.find((f) => f.type === 'm.login.sso') as { identity_providers?: { id: string; name: string }[] } | undefined
    return {
      baseUrl,
      password: flows.some((f) => f.type === 'm.login.password'),
      sso: sso ? (sso.identity_providers?.length ? sso.identity_providers : [{ id: '', name: 'Single sign-on' }]) : [],
    }
  }

  /** Redirect to the identity provider; we come back with ?loginToken=. */
  startSso(baseUrl: string, idpId: string) {
    sessionStorage.setItem('tessera.sso.baseUrl', baseUrl)
    const back = location.origin + location.pathname
    location.href = sdk.createClient({ baseUrl }).getSsoLoginUrl(back, 'sso', idpId || undefined)
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
      const baseUrl = await this.discover(server)
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
      this.error = e instanceof Error ? e.message : String(e)
    }
  }

  async start(s: Session) {
    this.userId = s.userId
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
    })
    this.client = client
    await store.startup()
    await client.initRustCrypto({ cryptoDatabasePrefix: `tessera-crypto-${s.userId}` })
    security.attach(client)
    security.refresh()
    client.on(sdk.MatrixEventEvent.Decrypted, (ev) => {
      this.refreshMessages()
      this.maybeNotify(ev)
    })
    client.on(sdk.ClientEvent.Sync, (state) => {
      if (state === 'PREPARED' || state === 'SYNCING') {
        this.ready = true
        this.refreshRooms()
        this.refreshMessages()
      } else if (state === 'ERROR') {
        this.error = 'Connection lost, retrying…'
      }
    })
    client.on(sdk.RoomEvent.Timeline, (ev, _room, toStart, _removed, data) => {
      this.refreshRooms()
      this.refreshMessages()
      if (!toStart && data?.liveEvent && ev.getType() === 'm.room.message') this.maybeNotify(ev)
    })
    client.on(sdk.RoomEvent.Receipt, () => this.refreshRooms())
    client.on(sdk.ThreadEvent.Update as never, (() => this.scheduleRefresh()) as never)
    client.on(sdk.ThreadEvent.NewReply as never, (() => this.scheduleRefresh()) as never)
    client.on('Thread.new' as never, (() => this.scheduleRefresh()) as never)
    client.on(sdk.RoomMemberEvent.Typing, () => this.refreshTyping())
    client.on(sdk.RoomEvent.LocalEchoUpdated, () => this.refreshMessages())
    client.on(sdk.RoomStateEvent.Events, () => this.refreshRooms())
    await client.startClient({ initialSyncLimit: 30, lazyLoadMembers: true, threadSupport: true })
  }

  async logout() {
    try {
      await this.client?.logout(true)
    } catch {
      /* token may already be invalid */
    }
    this.client?.stopClient()
    await this.client?.clearStores().catch(() => {})
    localStorage.removeItem(SESSION_KEY)
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
    const what = c.msgtype === 'm.image' ? 'Photo' : c.msgtype === 'm.file' ? 'File' : (c.body ?? '')
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

  async openRoom(id: string) {
    this.activeRoom = id
    this.closeThread()
    this.messages = []
    this.refreshMessages()
    this.refreshTyping()
    const room = this.client?.getRoom(id)
    if (room) {
      const last = room.getLiveTimeline().getEvents().at(-1)
      if (last) await this.client!.sendReadReceipt(last).catch(() => {})
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
    const edits = new Map<string, string>()
    for (const ev of events) {
      const rel = ev.getContent()['m.relates_to']
      if (ev.getType() === 'm.reaction' && rel?.event_id && rel.key) {
        const r = reactions.get(rel.event_id) ?? {}
        r[rel.key] = (r[rel.key] ?? 0) + 1
        reactions.set(rel.event_id, r)
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
      let imageUrl: string | undefined
      if (content.msgtype === 'm.image' && content.url) {
        imageUrl = c.mxcUrlToHttp(content.url, 480, 360, 'scale', false, true, true) ?? undefined
      }
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
        imageUrl,
        threadReplies: ev.isThreadRoot ? (ev.getThread()?.length ?? 0) : 0,
      })
    }
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
    this.messages = this.build(room.getLiveTimeline().getEvents(), room)
    this.members = room
      .getJoinedMembers()
      .map((m) => ({ id: m.userId, name: m.name }))
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

  async loadOlder() {
    const room = this.activeRoom ? this.client?.getRoom(this.activeRoom) : null
    if (!room || this.loadingOlder) return
    this.loadingOlder = true
    try {
      await this.client!.scrollback(room, 30)
    } finally {
      this.loadingOlder = false
    }
  }

  async send(body: string, replyTo?: string) {
    if (!this.activeRoom || !body.trim()) return
    const content: Record<string, unknown> = { msgtype: 'm.text', body }
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

  async react(id: string, key: string) {
    if (!this.activeRoom) return
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
    const body = ev.getContent().msgtype === 'm.text' ? ev.getContent().body : 'Sent an attachment'
    const n = new Notification(room?.name ?? 'Tessera', { body: `${room?.getMember(ev.getSender() ?? '')?.name ?? ''}: ${body}`, tag: ev.getRoomId() ?? undefined })
    n.onclick = () => { window.focus(); if (ev.getRoomId()) this.openRoom(ev.getRoomId()!) }
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

  async openMessage(hit: MessageHit) {
    await this.openRoom(hit.roomId)
    this.focusEvent = hit.eventId
  }

  async leaveRoom(id: string) {
    await this.client!.leave(id)
    if (this.activeRoom === id) this.activeRoom = null
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
