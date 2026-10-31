// Notification keywords, kept as standard "content" push rules so other clients honour them too. SDK-free.
export const KW_PREFIX = 'tessera.kw.'

export const normalizeKeyword = (w: string): string => w.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 50)

export const keywordRuleId = (w: string): string => KW_PREFIX + encodeURIComponent(normalizeKeyword(w))

export const keywordActions = () => ['notify', { set_tweak: 'highlight' }, { set_tweak: 'sound', value: 'default' }]

interface Rule { rule_id: string; pattern?: string; enabled?: boolean }

/** The keywords in a list of content push rules, in the order they were added. */
export const readKeywords = (rules: Rule[] | undefined): string[] =>
  (rules ?? []).filter((r) => r.rule_id.startsWith(KW_PREFIX) && r.enabled !== false && r.pattern).map((r) => r.pattern as string)

/** Why a word cannot be added, or undefined when it can. */
export function keywordProblem(w: string, existing: string[]): string | undefined {
  const k = normalizeKeyword(w)
  if (!k) return 'Type a word or phrase'
  if (k.length < 2) return 'Use at least 2 characters'
  if (/[*?]/.test(k)) return 'Wildcards are not supported'
  if (existing.includes(k)) return 'That keyword is already on the list'
  if (existing.length >= 30) return 'That is enough keywords (30)'
  return undefined
}
