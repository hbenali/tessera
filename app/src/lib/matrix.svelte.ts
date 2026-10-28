import { clearDrafts } from './drafts'
import { inviteTarget } from './commands'
import { safeFileName } from './files'
import { mentionPills, mentionsUser, plainMentions, type MentionPill } from './mentions'
import { toggled } from './pins'
import * as sdk from 'matrix-js-sdk'
import { security } from './security.svelte'
import { discover } from './discover'
import { setOriginalLoader, setThumbLoader } from './media'
import { decryptAttachment, encryptAttachment, isEncryptedFile, type EncryptedFile } from './attachments'
import { beep, unlockAudio } from './sound'
import { format, parse, type Route } from './route'
import { PUSH_APP_ID, currentSubscription, storePushSession, storeWorkerDnd, subscribe, unsubscribe, type PushConfig } from './push'
import { DEFAULT_REPLY, DEFAULT_SCHEDULE, inSchedule, parseAutoReply, parseSchedule, replyText, scheduleEnd, type AutoReply, type Schedule } from './dnd'

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
  /** Set when the image is encrypted: how to decrypt it. */
  imageFile?: EncryptedFile
  /** An audio message or a voice recording. */
  /** A file (or video) to download: shown as a card. */
  attachment?: { mxc: string; file?: EncryptedFile; name: string; size?: number; mimetype?: string; caption?: string }
  audio?: { mxc: string; file?: EncryptedFile; duration?: number; waveform?: number[]; voice: boolean; name: string }
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
  /** "/me" messages are shown as an action: * Name does something. */
  emote?: boolean
  /** People mentioned by name in the text (messages from other clients), to draw as pills. */
  pills?: MentionPill[]
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
  /** The sender's Matrix id, for filtering by person. */
  senderId?: string
  snippet: string
  ts: number
  /** What kind of message it is, and whether it has a web link or mentions me: used by the advanced filters. */
  kind?: 'text' | 'image' | 'file'
  link?: boolean
  mentionsMe?: boolean
}

/** Facts about a message used to filter search results. */
export function hitFacts(content: Record<string, unknown>, me: string, myName?: string | null): Pick<MessageHit, 'kind' | 'link' | 'mentionsMe'> {
  const type = content.msgtype
  return {
    kind: type === 'm.image' ? 'image' : type === 'm.file' || type === 'm.video' || type === 'm.audio' ? 'file' : 'text',
    link: typeof content.body === 'string' && /https?:\/\//i.test(content.body),
    mentionsMe: mentionsUser(content, me, myName ?? undefined),
  }
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
    setOriginalLoader((m, f, k) => this.original(m, f, k))
    security.refresh()
    client.on(sdk.MatrixEventEvent.Decrypted, (ev) => {
      this.refreshMessages()
      this.maybeNotify(ev)
      this.maybeAutoReply(ev)
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
      if (!toStart && data?.liveEvent && ev.getType() === 'm.room.message') {
        this.maybeNotify(ev)
        this.maybeAutoReply(ev)
      }
    })
    client.on(sdk.RoomEvent.Receipt, () => { this.refreshRooms(); this.scheduleRefresh() })
    client.on(sdk.ThreadEvent.Update as never, (() => this.scheduleRefresh()) as never)
    client.on(sdk.ThreadEvent.NewReply as never, (() => this.scheduleRefresh()) as never)
    client.on('Thread.new' as never, (() => this.scheduleRefresh()) as never)
    // Push rules and tags change from other devices too, and the list shows both.
    client.on(sdk.ClientEvent.AccountData, (ev) => {
      if (ev.getType() === 'm.push_rules') this.refreshRooms()
      if (ev.getType() === Chat.QUIET) this.loadQuiet()
      if (ev.getType() === Chat.PRIVACY) this.loadPrivacy()
      if (ev.getType() === Chat.DND) this.loadDnd()
      if (ev.getType() === Chat.SCHEDULE) this.loadSchedule()
      if (ev.getType() === Chat.AUTO_REPLY) this.loadAutoReply()
    })
    client.on(sdk.RoomEvent.Tags, () => this.refreshRooms())
    client.on(sdk.RoomMemberEvent.Typing, () => { this.refreshTyping(); this.refreshRooms() })
    client.on(sdk.UserEvent.Presence, (_e, u) => { this.presence[u.userId] = u.presence as Presence })
    client.on(sdk.RoomEvent.LocalEchoUpdated, () => this.refreshMessages())
    client.on(sdk.RoomStateEvent.Events, () => this.refreshRooms())
    await client.startClient({ initialSyncLimit: 30, lazyLoadMembers: true, threadSupport: true })
    this.loadProfile()
    this.setStatus(this.myStatus)
    unlockAudio()
    this.refreshPush()
    this.loadQuiet()
    this.loadPrivacy()
    this.loadDnd()
    this.loadSchedule()
    this.loadAutoReply()
    setInterval(() => this.clock++, 30_000)
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
    const what = c.msgtype === 'm.image' ? 'Photo' : c.msgtype === 'm.audio' ? (c['org.matrix.msc3245.voice'] ? 'Voice message' : 'Audio') : c.msgtype === 'm.file' ? 'File' : plainMentions(c.body ?? '', (id) => room.getMember(id)?.name)
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

  /**
   * Do not disturb. While on, there are no desktop notifications here. If background push is on, Matrix's master
   * push rule (.m.rule.master) is also switched on, because that is the only way to stop the homeserver pushing; the
   * cost is that the server then does not count new messages as unread. Without background push nothing server-side
   * changes, so unread counts stay right. `until` is a time in ms, or null for "until I turn it off". `master`
   * records that this feature switched the rule on, so ending it never turns off a master rule I set myself.
   */
  dnd = $state<{ until: number | null; master: boolean } | null>(null)
  private static DND = 'ovh.hbenali.tessera.dnd'
  private dndTimer: ReturnType<typeof setTimeout> | undefined
  /** Recurring quiet hours, evaluated here and (for background push) by the service worker. */
  schedule = $state<Schedule>({ ...DEFAULT_SCHEDULE })
  private static SCHEDULE = 'ovh.hbenali.tessera.dnd_schedule'
  /** Bumped every so often so the getters below, which read the clock, are re-read. */
  private clock = $state(0)
  get manualDnd() {
    this.clock
    return !!this.dnd && (this.dnd.until === null || this.dnd.until > Date.now())
  }
  get quietNow() {
    this.clock
    return inSchedule(this.schedule, new Date())
  }
  get dndActive() {
    return this.manualDnd || this.quietNow
  }

  /**
   * Automatic reply while do-not-disturb or quiet hours are on. Matrix has no server-side auto-responder, so this runs
   * only while Tessera is open in some browser. It answers a mention (and optionally a direct message) with an m.notice,
   * the type bots use, which nobody's auto-reply answers, so two people cannot start a loop.
   */
  autoReply = $state<AutoReply>({ ...DEFAULT_REPLY })
  private static AUTO_REPLY = 'ovh.hbenali.tessera.dnd_reply'
  private static AUTO_FLAG = 'ovh.hbenali.tessera.auto_reply'
  private replySent: number[] = []

  private loadAutoReply() {
    this.autoReply = parseAutoReply(this.client?.getAccountData(Chat.AUTO_REPLY as never)?.getContent())
  }

  async setAutoReply(patch: Partial<AutoReply>) {
    this.autoReply = parseAutoReply({ ...this.autoReply, ...patch })
    await this.client!.setAccountData(Chat.AUTO_REPLY as never, { ...this.autoReply } as never)
  }

  /** When the current do-not-disturb ends, if it has an end. */
  private dndEnd(): Date | null {
    const manual = this.manualDnd && this.dnd?.until ? new Date(this.dnd.until) : null
    const scheduled = this.quietNow ? scheduleEnd(this.schedule, new Date()) : null
    if (manual && scheduled) return manual > scheduled ? manual : scheduled
    return manual ?? scheduled
  }

  private maybeAutoReply(ev: sdk.MatrixEvent) {
    const c = this.client
    const id = ev.getId()
    const roomId = ev.getRoomId()
    if (!c || !this.ready || !id || !roomId || !this.autoReply.enabled || !this.dndActive) return
    const sender = ev.getSender()
    const content = ev.getContent()
    if (!sender || sender === this.userId || ev.getType() !== 'm.room.message') return
    if (content.msgtype === 'm.notice' || content[Chat.AUTO_FLAG]) return // another auto-reply: never answer, or we could loop
    if (ev.getTs() < Date.now() - 60_000) return // history, not live
    const room = c.getRoom(roomId)
    if (!room || room.getMyMembership() !== 'join') return
    const mentioned = mentionsUser(content, this.userId, c.getUser(this.userId)?.displayName)
    if (!mentioned && !(this.autoReply.dms && this.dmRoomIds().has(roomId))) return
    if (this.autoReplied.has(id)) return
    // At most one reply per room every six hours; the timeline check also covers a reload or another open device.
    const since = Date.now() - 6 * 3600_000
    if (room.getLiveTimeline().getEvents().some((e) => e.getSender() === this.userId && e.getTs() > since && e.getContent()[Chat.AUTO_FLAG])) return
    // And no more than 20 in an hour overall, so a flood of mentions cannot make this a flood of replies.
    this.replySent = this.replySent.filter((t) => t > Date.now() - 3600_000)
    if (this.replySent.length >= 20) return
    this.replySent.push(Date.now())
    this.autoReplied.add(id)
    c.sendMessage(roomId, {
      msgtype: 'm.notice',
      body: replyText(this.autoReply.message, this.dndEnd()),
      'm.relates_to': { 'm.in_reply_to': { event_id: id } },
      'm.mentions': { user_ids: [sender] },
      [Chat.AUTO_FLAG]: true,
    } as never).catch(() => {})
  }
  private autoReplied = new Set<string>()

  private loadSchedule() {
    this.schedule = parseSchedule(this.client?.getAccountData(Chat.SCHEDULE as never)?.getContent())
    this.syncWorkerDnd()
  }

  async setSchedule(patch: Partial<Schedule>) {
    this.schedule = parseSchedule({ ...this.schedule, ...patch })
    await this.client!.setAccountData(Chat.SCHEDULE as never, { ...this.schedule } as never)
    this.syncWorkerDnd()
  }

  /** Give the service worker the do-not-disturb settings, only while background push is on. */
  private syncWorkerDnd() {
    if (!this.pushOn) return
    // A plain copy: IndexedDB cannot store the reactive proxy objects that $state makes.
    storeWorkerDnd({ manualUntil: this.dnd ? this.dnd.until : undefined, schedule: $state.snapshot(this.schedule) }).catch(() => {})
  }

  private masterOn() {
    return !!this.client?.pushRules?.global?.override?.some((r) => r.rule_id === '.m.rule.master' && r.enabled)
  }

  private loadDnd() {
    const c = this.client?.getAccountData(Chat.DND as never)?.getContent() as { until?: unknown; master?: unknown } | undefined
    clearTimeout(this.dndTimer)
    if (!c || (c.until !== null && typeof c.until !== 'number')) {
      this.dnd = null
      return
    }
    this.dnd = { until: c.until as number | null, master: c.master === true }
    if (this.dnd.until === null) return
    if (this.dnd.until <= Date.now()) {
      this.endDnd().catch(() => {})
    } else {
      // setTimeout cannot wait longer than about 24 days; check again then.
      this.dndTimer = setTimeout(() => this.loadDnd(), Math.min(this.dnd.until - Date.now(), 2 ** 31 - 1))
    }
  }

  /** Turn do-not-disturb on until a time, or indefinitely with null. */
  async setDnd(until: number | null) {
    const c = this.client!
    let master = this.dnd?.master === true // keep ownership when only changing the end time
    if (this.pushOn && !this.masterOn()) {
      await c.setPushRuleEnabled('global', sdk.PushRuleKind.Override, '.m.rule.master', true)
      master = true
    }
    this.dnd = { until, master }
    this.syncWorkerDnd()
    await c.setAccountData(Chat.DND as never, { ...this.dnd } as never)
    this.loadDnd()
  }

  async endDnd() {
    const c = this.client!
    const owned = this.dnd?.master
    this.dnd = null
    clearTimeout(this.dndTimer)
    this.syncWorkerDnd()
    await c.setAccountData(Chat.DND as never, {} as never)
    if (owned && this.masterOn()) await c.setPushRuleEnabled('global', sdk.PushRuleKind.Override, '.m.rule.master', false)
  }

  /** What I let other people see about me, for every room. Stored as account data so it follows me between devices. */
  privacy = $state({ typing: true, receipts: true })
  private static PRIVACY = 'ovh.hbenali.tessera.privacy'

  private loadPrivacy() {
    const c = this.client?.getAccountData(Chat.PRIVACY as never)?.getContent() as { typing?: unknown; receipts?: unknown } | undefined
    this.privacy = { typing: c?.typing !== false, receipts: c?.receipts !== false }
  }

  async setPrivacy(patch: Partial<{ typing: boolean; receipts: boolean }>) {
    this.privacy = { ...this.privacy, ...patch }
    await this.client!.setAccountData(Chat.PRIVACY as never, { ...this.privacy } as never)
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
    if (this.isQuiet(roomId) || !this.privacy.receipts) {
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
    const editContent = new Map<string, Record<string, unknown>>()
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
        editContent.set(rel.event_id as string, ev.getContent()['m.new_content'])
      }
    }
    // Reactions that arrive in the first sync window while their message is older never sit next to it in the list above,
    // so also ask the SDK, which attaches every reaction to its message whatever order things were loaded in.
    const counted = new Set([...reactors.values()].flatMap((r) => Object.values(r).flat().map((u) => u.eventId)))
    for (const ev of events) {
      const id = ev.getId()
      if (!id) continue
      const sorted = room.relations.getChildEventsForEvent(id, sdk.RelationType.Annotation, 'm.reaction')?.getSortedAnnotationsByKey()
      for (const [key, set] of sorted ?? []) {
        for (const re of set) {
          const rid = re.getId()
          if (re.isRedacted() || (rid && counted.has(rid))) continue
          if (rid) counted.add(rid)
          const r = reactions.get(id) ?? {}
          r[key] = (r[key] ?? 0) + 1
          reactions.set(id, r)
          const who = reactors.get(id) ?? {}
          const from = re.getSender() ?? ''
          ;(who[key] ??= []).push({ id: from, name: room.getMember(from)?.name ?? from, eventId: rid ?? undefined })
          reactors.set(id, who)
        }
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
      // A plain attachment has `url`; one in an encrypted room has `file` (url plus key).
      const file = isEncryptedFile(content.file) ? content.file : undefined
      const mediaMxc: string | undefined = typeof content.url === 'string' ? content.url : file?.url
      const imageMxc: string | undefined = content.msgtype === 'm.image' ? mediaMxc : undefined
      const filename = typeof content.filename === 'string' ? content.filename : undefined
      const attachment: Msg['attachment'] =
        (content.msgtype === 'm.file' || content.msgtype === 'm.video') && mediaMxc
          ? {
              mxc: mediaMxc,
              file,
              name: safeFileName(filename ?? (typeof content.body === 'string' ? content.body : undefined)),
              size: Number.isFinite(content.info?.size) ? content.info.size : undefined,
              mimetype: typeof content.info?.mimetype === 'string' ? content.info.mimetype : undefined,
              // Since Matrix 1.10 the body can be a caption for a file that has its own `filename`.
              caption: filename && typeof content.body === 'string' && content.body.trim() && content.body !== filename ? content.body : undefined,
            }
          : undefined
      const rawWave = content['org.matrix.msc1767.audio']?.waveform
      const audio: Msg['audio'] =
        content.msgtype === 'm.audio' && mediaMxc
          ? {
              mxc: mediaMxc,
              file,
              duration: Number.isFinite(content.info?.duration) ? content.info.duration : Number.isFinite(content['org.matrix.msc1767.audio']?.duration) ? content['org.matrix.msc1767.audio'].duration : undefined,
              waveform: Array.isArray(rawWave) ? rawWave.filter((n: unknown): n is number => typeof n === 'number').slice(0, 512) : undefined,
              voice: !!content['org.matrix.msc3245.voice'],
              name: typeof content.body === 'string' ? content.body : 'Audio',
            }
          : undefined
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
        imageFile: imageMxc ? file : undefined,
        attachment,
        audio,
        threadReplies: ev.isThreadRoot ? (ev.getThread()?.length ?? 0) : 0,
        senderAvatar: room.getMember(sender)?.getMxcAvatarUrl() ?? undefined,
        emote: content.msgtype === 'm.emote',
        pills: bad || encrypted ? undefined : mentionPills(editContent.get(id) ?? content, (uid) => room.getMember(uid)?.name),
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

  async send(body: string, replyTo?: string, msgtype: 'm.text' | 'm.emote' = 'm.text') {
    if (!this.activeRoom || !body.trim()) return
    const content: Record<string, unknown> = { msgtype, body }
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

  private pendingEvent(id: string) {
    const room = this.activeRoom ? this.client?.getRoom(this.activeRoom) : null
    // Local echoes live in the timeline itself in this mode (getPendingEvents is only for the detached mode).
    const ev = room?.getLiveTimeline().getEvents().find((e) => e.status !== null && (e.getId() ?? e.getTxnId()) === id)
    return room && ev ? { room, ev } : null
  }

  /** Send a message that failed again. */
  async retrySend(id: string) {
    const p = this.pendingEvent(id)
    if (p) await this.client!.resendEvent(p.ev, p.room)
    this.refreshMessages()
  }

  /** Give up on a message that failed to send. */
  discardUnsent(id: string) {
    const p = this.pendingEvent(id)
    if (p) this.client!.cancelPendingEvent(p.ev)
    this.refreshMessages()
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

  /**
   * Upload a file. In an encrypted room it is encrypted first, so the homeserver stores only ciphertext, and the key goes in
   * the (encrypted) message as `file`; elsewhere it is a plain `url`. `progress` reports bytes sent.
   */
  /** The largest file the homeserver accepts, in bytes; 0 if it does not say. */
  async maxUploadSize(): Promise<number> {
    try {
      return (await this.client!.getMediaConfig())['m.upload.size'] ?? 0
    } catch {
      return 0
    }
  }

  async uploadMedia(blob: Blob, name: string, mimetype: string, progress?: (loaded: number, total: number) => void): Promise<{ url: string } | { file: EncryptedFile }> {
    const c = this.client!
    const handler = progress ? { progressHandler: (p: { loaded: number; total: number }) => progress(p.loaded, p.total) } : {}
    if (this.activeRoom && c.isRoomEncrypted(this.activeRoom)) {
      const { ciphertext, file } = await encryptAttachment(await blob.arrayBuffer())
      const { content_uri } = await c.uploadContent(new Blob([ciphertext], { type: 'application/octet-stream' }), { name: 'encrypted', type: 'application/octet-stream', ...handler })
      return { file: { ...file, url: content_uri, mimetype } }
    }
    const { content_uri } = await c.uploadContent(blob, { name, type: mimetype, ...handler })
    return { url: content_uri }
  }

  async upload(file: File, progress?: (loaded: number, total: number) => void) {
    if (!this.activeRoom) return
    const media = await this.uploadMedia(file, file.name, file.type || 'application/octet-stream', progress)
    const isImg = file.type.startsWith('image/')
    await this.client!.sendMessage(this.activeRoom, {
      msgtype: isImg ? 'm.image' : 'm.file',
      body: file.name,
      ...media,
      info: { mimetype: file.type, size: file.size },
    } as never)
  }

  /** Send a recorded voice message (MSC3245 voice, with the MSC1767 audio details other clients read for the waveform). */
  async sendVoice(rec: { blob: Blob; duration: number; waveform: number[]; mimetype: string }, progress?: (loaded: number, total: number) => void) {
    if (!this.activeRoom) return
    const media = await this.uploadMedia(rec.blob, 'voice-message', rec.mimetype, progress)
    await this.client!.sendMessage(this.activeRoom, {
      msgtype: 'm.audio',
      body: 'Voice message',
      ...media,
      info: { mimetype: rec.mimetype, size: rec.blob.size, duration: Math.round(rec.duration) },
      'org.matrix.msc3245.voice': {},
      'org.matrix.msc1767.audio': { duration: Math.round(rec.duration), waveform: rec.waveform },
    } as never)
  }

  setTyping(on: boolean) {
    if (!this.privacy.typing) return // typing notifications are switched off
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
    if (this.dndActive) return
    const c = this.client
    const id = ev.getId()
    if (!c || !this.ready || !id || this.notified.has(id)) return
    if (ev.getSender() === this.userId || ev.getType() !== 'm.room.message') return
    if (ev.getTs() < Date.now() - 60_000) return // history, not live
    if (!document.hidden && ev.getRoomId() === this.activeRoom) return
    // The push rules decide, so a muted room stays silent and a mentions-only room only sounds for a mention.
    const actions = c.getPushActionsForEvent(ev)
    if (!actions?.notify) return
    this.notified.add(id)
    beep(actions.tweaks?.highlight ? 'mention' : 'message', { room: ev.getRoomId() ?? undefined })
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
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

  private profiles = new Map<string, Promise<{ name: string; avatar?: string }>>()
  /** Name and avatar of anyone, from the homeserver, for people who are not in the open room. Cached. */
  profileOf(id: string): Promise<{ name: string; avatar?: string }> {
    let p = this.profiles.get(id)
    if (!p) {
      p = this.client!.getProfileInfo(id).then((r) => ({ name: r.displayname || id, avatar: r.avatar_url }))
      p.catch(() => this.profiles.delete(id))
      this.profiles.set(id, p)
    }
    return p
  }

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
      if (this.pushOn) {
        await this.storeSession()
        this.syncWorkerDnd()
      }
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
    this.syncWorkerDnd()
  }

  async disablePush() {
    const sub = await currentSubscription().catch(() => null)
    if (sub) await this.client?.setPusher({ kind: null, app_id: PUSH_APP_ID, pushkey: sub.p256dh } as never).catch(() => {})
    await unsubscribe().catch(() => {})
    await storePushSession(null).catch(() => {})
    await storeWorkerDnd(null).catch(() => {})
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

  private originals = new Map<string, Promise<Blob>>()

  /** The full-size file, for the image viewer, audio and downloads. Kept for the session so paging back and forth is instant. */
  original(mxc: string, file?: EncryptedFile, keep = true): Promise<Blob> {
    let hit = this.originals.get(mxc)
    if (!hit) {
      const c = this.client!
      const url = c.mxcUrlToHttp(mxc, undefined, undefined, undefined, false, true, true)
      hit = url
        ? fetch(url, { headers: { Authorization: `Bearer ${c.getAccessToken()}` } }).then((r) => {
            if (!r.ok) throw new Error(String(r.status))
            // In an encrypted room the server holds ciphertext: check it against its hash and decrypt it here.
            return file ? r.arrayBuffer().then((buf) => decryptAttachment(buf, file)).then((plain) => new Blob([plain], { type: file.mimetype ?? 'application/octet-stream' })) : r.blob()
          })
        : Promise.reject(new Error('no url'))
      hit.catch(() => this.originals.delete(mxc))
      // A download is not kept: a large file would otherwise sit in memory for the rest of the session.
      if (keep) this.originals.set(mxc, hit)
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

  async searchUsers(term: string): Promise<{ id: string; name: string; avatar?: string }[]> {
    const r = await this.client!.searchUserDirectory({ term, limit: 8 })
    return r.results.filter((u) => u.user_id !== this.userId).map((u) => ({ id: u.user_id, name: u.display_name || u.user_id, avatar: u.avatar_url }))
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
  searchMessages(term: string, limit = 20, onlyRoom?: string): MessageHit[] {
    const q = term.trim().toLowerCase()
    const c = this.client
    if (q.length < 2 || !c) return []
    const hits: MessageHit[] = []
    for (const room of c.getRooms()) {
      if (room.getMyMembership() !== 'join' || (onlyRoom && room.roomId !== onlyRoom)) continue
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
          senderId: ev.getSender() ?? undefined,
          snippet: (i > 30 ? '…' : '') + body.slice(Math.max(0, i - 30), i + 70),
          ts: ev.getTs(),
          ...hitFacts(content, this.userId, c.getUser(this.userId)?.displayName),
        })
      }
    }
    return hits.sort((a, b) => b.ts - a.ts).slice(0, limit)
  }

  /** Search the homeserver's index. It cannot see inside encrypted rooms, which searchMessages covers on this device. */
  async searchServer(term: string, limit = 20): Promise<MessageHit[]> {
    return (await this.serverSearch(term, limit)).hits
  }

  /** One room's search: the homeserver's index plus a token for the next page. Not available for encrypted rooms. */
  searchRoom(roomId: string, term: string, nextBatch?: string, opts: { sender?: string; media?: boolean } = {}, limit = 25) {
    return this.serverSearch(term, limit, roomId, nextBatch, opts)
  }

  private async serverSearch(term: string, limit: number, roomId?: string, nextBatch?: string, opts: { sender?: string; media?: boolean } = {}): Promise<{ hits: MessageHit[]; next?: string }> {
    const q = term.trim()
    const c = this.client
    if (q.length < 2 || !c) return { hits: [] }
    const r = await c.search({
      next_batch: nextBatch,
      body: {
        search_categories: {
          room_events: {
            search_term: q,
            keys: ['content.body'],
            order_by: 'recent',
            filter: { limit, ...(roomId ? { rooms: [roomId] } : {}), ...(opts.sender ? { senders: [opts.sender] } : {}), ...(opts.media ? { contains_url: true } : {}) },
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
        senderId: e.sender,
        snippet: (i > 30 ? '…' : '') + body.slice(Math.max(0, i - 30), i + 70),
        ts: e.origin_server_ts,
        ...hitFacts(content as Record<string, unknown>, this.userId, c.getUser(this.userId)?.displayName),
      })
    }
    return { hits: out, next: r.search_categories?.room_events?.next_batch }
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

  /** /invite: work out who is meant (a full id, or a name found in the user directory), check, invite, and say who. */
  async invitePerson(arg: string): Promise<string> {
    const room = this.activeRoom ? this.client?.getRoom(this.activeRoom) : null
    if (!room) throw new Error('Open a room first')
    const t = inviteTarget(arg)
    if (!t) throw new Error('Say who to invite: /invite @person')
    let who: { id: string; name: string }
    if ('id' in t) who = { id: t.id, name: this.nameOf(t.id) ?? t.id }
    else {
      const found = await this.searchUsers(t.search)
      const lower = t.search.toLowerCase()
      const exact = found.filter((u) => u.name.toLowerCase() === lower || u.id.toLowerCase().startsWith(`@${lower}:`))
      const pool = exact.length ? exact : found
      if (!pool.length) throw new Error(`No one found for "${t.search}". Try their full Matrix id, like @name:server.`)
      if (pool.length > 1) throw new Error(`More than one person matches "${t.search}": ${pool.slice(0, 4).map((u) => `${u.name} (${u.id})`).join(', ')}. Use the full Matrix id.`)
      who = pool[0]
    }
    const state = room.getMember(who.id)?.membership
    if (state === 'join') throw new Error(`${who.name} is already in this room`)
    if (state === 'invite') throw new Error(`${who.name} has already been invited`)
    await this.client!.invite(room.roomId, who.id)
    return who.name
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
