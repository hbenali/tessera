/** Recurring quiet hours for Do not disturb. Pure, so it is easy to test. public/sw.js carries a copy of inSchedule. */
export interface Schedule {
  enabled: boolean
  /** Days a window may start on: 0 is Sunday. */
  days: number[]
  /** Local times, "HH:MM". A window that ends before it starts runs overnight into the next day. */
  from: string
  to: string
}

export const DEFAULT_SCHEDULE: Schedule = { enabled: false, days: [0, 1, 2, 3, 4], from: '22:00', to: '08:00' }

const minutes = (hhmm: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN
}

/** Is `when` inside a quiet window? Equal start and end mean the whole day. */
export function inSchedule(s: Schedule, when: Date): boolean {
  if (!s.enabled || !s.days.length) return false
  const from = minutes(s.from)
  const to = minutes(s.to)
  if (Number.isNaN(from) || Number.isNaN(to)) return false
  const now = when.getHours() * 60 + when.getMinutes()
  const today = when.getDay()
  const yesterday = (today + 6) % 7
  if (from === to) return s.days.includes(today)
  if (from < to) return s.days.includes(today) && now >= from && now < to
  // Overnight: the evening part belongs to the day it started on, the morning part to the day before.
  return (s.days.includes(today) && now >= from) || (s.days.includes(yesterday) && now < to)
}

/** Read a stored schedule defensively: it comes from account data another client could have written. */
export function parseSchedule(raw: unknown): Schedule {
  const r = (raw ?? {}) as Partial<Schedule>
  const ok = (t: unknown, d: string) => (typeof t === 'string' && !Number.isNaN(minutes(t)) ? t : d)
  return {
    enabled: r.enabled === true,
    days: Array.isArray(r.days) ? [...new Set(r.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))] : DEFAULT_SCHEDULE.days,
    from: ok(r.from, DEFAULT_SCHEDULE.from),
    to: ok(r.to, DEFAULT_SCHEDULE.to),
  }
}

/** When the quiet window that contains `when` ends, or null if `when` is not in one. A whole-day window ends at midnight. */
export function scheduleEnd(s: Schedule, when: Date): Date | null {
  if (!inSchedule(s, when)) return null
  const [h, m] = s.to.split(':').map(Number)
  const end = new Date(when)
  if (s.from === s.to) {
    end.setHours(24, 0, 0, 0)
    return end
  }
  end.setHours(h, m, 0, 0)
  if (end <= when) end.setDate(end.getDate() + 1) // an overnight window ends tomorrow morning
  return end
}

export interface AutoReply {
  enabled: boolean
  message: string
  /** Also answer direct messages, not only mentions. */
  dms: boolean
}

export const DEFAULT_REPLY: AutoReply = {
  enabled: false,
  message: "I'm busy right now and will reply when I'm available.",
  dms: false,
}

export const MAX_REPLY = 500

export function parseAutoReply(raw: unknown): AutoReply {
  const r = (raw ?? {}) as Partial<AutoReply>
  const message = typeof r.message === 'string' && r.message.trim() ? r.message.trim().slice(0, MAX_REPLY) : DEFAULT_REPLY.message
  return { enabled: r.enabled === true, message, dms: r.dms === true }
}

/** The text sent: `{until}` becomes the time do-not-disturb ends ("14:30", or "Mon 08:00" on another day), or "later". */
export function replyText(template: string, end: Date | null, now = new Date()): string {
  const when = end
    ? end.toLocaleString([], end.toDateString() === now.toDateString() ? { hour: '2-digit', minute: '2-digit' } : { weekday: 'short', hour: '2-digit', minute: '2-digit' })
    : 'later'
  return template.replaceAll('{until}', when)
}
