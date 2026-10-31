// Matrix polls (m.poll.*): reading a poll and counting its votes. SDK-free.
export interface PollAnswer { id: string; text: string }
export interface PollStart { question: string; answers: PollAnswer[]; maxSelections: number; disclosed: boolean }
export interface PollResponse { sender: string; ts: number; selections: string[] }

const text = (v: unknown): string => {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return text(v.find((x) => x?.mimetype === 'text/plain') ?? v[0])
  if (v && typeof v === 'object') return text((v as Record<string, unknown>).body ?? (v as Record<string, unknown>)['org.matrix.msc1767.text'] ?? (v as Record<string, unknown>)['m.text'])
  return ''
}

export function parsePollStart(content: Record<string, unknown>): PollStart | undefined {
  const p = (content['m.poll'] ?? content['org.matrix.msc3381.poll.start']) as Record<string, unknown> | undefined
  if (!p) return undefined
  const q = p.question as Record<string, unknown> | undefined
  const answers = (Array.isArray(p.answers) ? p.answers : [])
    .map((a: Record<string, unknown>) => ({ id: String(a?.id ?? ''), text: text(a?.['m.text'] ?? a?.['org.matrix.msc1767.text'] ?? a?.body) }))
    .filter((a) => a.id && a.text)
    .slice(0, 20)
  const question = text(q?.['m.text'] ?? q?.['org.matrix.msc1767.text'] ?? q?.body)
  if (!question || answers.length < 2) return undefined
  const max = Number(p.max_selections)
  return { question, answers, maxSelections: Number.isInteger(max) && max >= 1 ? Math.min(max, answers.length) : 1, disclosed: !String(p.kind ?? '').includes('undisclosed') }
}

export function pollContent(question: string, answers: string[], disclosed: boolean, max: number) {
  const ids = answers.map((_, i) => `a${i + 1}`)
  return {
    body: `${question}\n${answers.map((a, i) => `${i + 1}. ${a}`).join('\n')}`,
    'm.text': [{ mimetype: 'text/plain', body: `${question}\n${answers.map((a, i) => `${i + 1}. ${a}`).join('\n')}` }],
    'm.poll': {
      kind: disclosed ? 'm.poll.disclosed' : 'm.poll.undisclosed',
      max_selections: Math.max(1, Math.min(max, answers.length)),
      question: { 'm.text': [{ mimetype: 'text/plain', body: question }] },
      answers: answers.map((a, i) => ({ id: ids[i], 'm.text': [{ mimetype: 'text/plain', body: a }] })),
    },
  }
}

export interface Tally {
  counts: Record<string, number>
  voters: number
  mine: string[]
  ended: boolean
  /** Results may be shown: disclosed polls always, undisclosed ones once ended. */
  visible: boolean
}

/**
 * Count the latest valid vote of each person. A vote counts if it came before the poll ended; unknown answers are dropped
 * and only the first `maxSelections` are kept. A vote with no valid answer takes the person's vote back.
 */
export function tally(poll: PollStart, responses: PollResponse[], endTs: number | undefined, me: string): Tally {
  const valid = new Set(poll.answers.map((a) => a.id))
  const latest = new Map<string, PollResponse>()
  for (const r of responses) {
    if (endTs !== undefined && r.ts > endTs) continue
    const prev = latest.get(r.sender)
    if (!prev || r.ts >= prev.ts) latest.set(r.sender, r)
  }
  const counts: Record<string, number> = Object.fromEntries(poll.answers.map((a) => [a.id, 0]))
  let voters = 0
  let mine: string[] = []
  for (const r of latest.values()) {
    const picked = [...new Set(r.selections.filter((s) => valid.has(s)))].slice(0, poll.maxSelections)
    if (r.sender === me) mine = picked
    if (!picked.length) continue
    voters++
    for (const s of picked) counts[s]++
  }
  const ended = endTs !== undefined
  return { counts, voters, mine, ended, visible: poll.disclosed || ended }
}

/** The selections after clicking an answer: single-choice replaces, multi-choice toggles up to the limit. */
export function toggleSelection(current: string[], answer: string, max: number): string[] {
  if (max === 1) return current.length === 1 && current[0] === answer ? [] : [answer]
  if (current.includes(answer)) return current.filter((a) => a !== answer)
  return current.length >= max ? current : [...current, answer]
}
