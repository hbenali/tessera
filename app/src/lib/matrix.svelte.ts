import * as sdk from 'matrix-js-sdk'

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
    const client = sdk.createClient({
      baseUrl: s.baseUrl,
      accessToken: s.accessToken,
      userId: s.userId,
      deviceId: s.deviceId,
    })
    this.client = client
    client.on(sdk.ClientEvent.Sync, (state) => {
      if (state === 'PREPARED' || state === 'SYNCING') {
        this.ready = true
        this.refreshRooms()
        this.refreshMessages()
      } else if (state === 'ERROR') {
        this.error = 'Connection lost, retrying…'
      }
    })
    client.on(sdk.RoomEvent.Timeline, () => {
      this.refreshRooms()
      this.refreshMessages()
    })
    client.on(sdk.RoomEvent.Receipt, () => this.refreshRooms())
    client.on(sdk.RoomMemberEvent.Typing, () => this.refreshTyping())
    client.on(sdk.RoomEvent.LocalEchoUpdated, () => this.refreshMessages())
    client.on(sdk.RoomStateEvent.Events, () => this.refreshRooms())
    await client.startClient({ initialSyncLimit: 30, lazyLoadMembers: true })
  }

  async logout() {
    try {
      await this.client?.logout(true)
    } catch {
      /* token may already be invalid */
    }
    this.client?.stopClient()
    localStorage.removeItem(SESSION_KEY)
    location.reload()
  }

  private dmRoomIds(): Set<string> {
    const direct = this.client?.getAccountData('m.direct' as never)?.getContent() ?? {}
    return new Set(Object.values(direct).flat() as string[])
  }

  refreshRooms() {
    const c = this.client
    if (!c) return
    const dms = this.dmRoomIds()
    const items: RoomItem[] = []
    for (const room of c.getRooms()) {
      if (room.getMyMembership() !== 'join') continue
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

  refreshMessages() {
    const c = this.client
    const room = this.activeRoom ? c?.getRoom(this.activeRoom) : null
    if (!c || !room) return
    const events = room.getLiveTimeline().getEvents()
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
      if (ev.getType() !== 'm.room.message' || ev.isRedacted()) continue
      const content = ev.getContent()
      if (content['m.relates_to']?.rel_type === 'm.replace') continue
      const id = ev.getId() ?? ev.getTxnId() ?? String(ev.getTs())
      const sender = ev.getSender() ?? ''
      let imageUrl: string | undefined
      if (content.msgtype === 'm.image' && content.url) {
        imageUrl = c.mxcUrlToHttp(content.url, 480, 360, 'scale', false, true, true) ?? undefined
      }
      out.push({
        id,
        sender,
        senderName: room.getMember(sender)?.name ?? sender,
        body: edits.get(id) ?? content.body ?? '',
        ts: ev.getTs(),
        mine: sender === this.userId,
        pending: ev.status != null,
        edited: edits.has(id),
        replyTo: content['m.relates_to']?.['m.in_reply_to']?.event_id,
        reactions: reactions.get(id) ?? {},
        imageUrl,
      })
    }
    this.messages = out
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

  async createRoom(name: string) {
    const r = await this.client!.createRoom({ name, preset: sdk.Preset.PrivateChat })
    this.openRoom(r.room_id)
  }

  async joinRoom(alias: string) {
    const r = await this.client!.joinRoom(alias)
    this.openRoom(r.roomId)
  }
}

export const chat = new Chat()
