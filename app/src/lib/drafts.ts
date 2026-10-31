/**
 * Unsent text per room, kept so switching rooms (and, for unencrypted rooms, reloading) does not lose it.
 * Drafts of encrypted rooms stay in memory only: writing them to localStorage would leave plain text of an
 * end-to-end encrypted conversation on disk. SDK-free.
 */
const KEY = 'tessera.drafts'
const memory = new Map<string, string>()

function read(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} }
}

function write(all: Record<string, string>) {
  try { localStorage.setItem(KEY, JSON.stringify(all)) } catch { /* storage may be blocked */ }
}

/** Every draft that is waiting, by room (memory first, then storage). */
export const allDrafts = (): Record<string, string> => ({ ...read(), ...Object.fromEntries(memory) })

export const getDraft = (room: string): string => memory.get(room) ?? read()[room] ?? ''

export function setDraft(room: string, text: string, persist = true) {
  if (text.trim()) memory.set(room, text)
  else memory.delete(room)
  const all = read()
  if (persist && text.trim()) all[room] = text
  else if (room in all) delete all[room]
  else return
  write(all)
}

/** Forget every draft (on sign-out). */
export function clearDrafts() {
  memory.clear()
  try { localStorage.removeItem(KEY) } catch { /* storage may be blocked */ }
}
