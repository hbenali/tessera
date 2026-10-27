/** Unsent text per room, kept so switching rooms or reloading does not lose it. SDK-free. */
const KEY = 'tessera.drafts'

function read(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} }
}

export const getDraft = (room: string): string => read()[room] ?? ''

export function setDraft(room: string, text: string) {
  try {
    const all = read()
    if (text.trim()) all[room] = text
    else delete all[room]
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch { /* storage may be blocked */ }
}
