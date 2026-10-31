// What the installed app is asked to do when it is opened from a shortcut or a link. SDK-free.
export type Action = 'search' | 'new' | 'explore' | 'join'
export type ListView = 'all' | 'unread' | 'mentions' | 'favourites' | 'people' | 'rooms'
export interface Shortcut { action?: Action; view?: ListView; matrix?: string }

const ACTIONS: readonly string[] = ['search', 'new', 'explore', 'join']
const VIEWS: readonly string[] = ['all', 'unread', 'mentions', 'favourites', 'people', 'rooms']

/** Read ?action= and ?view= from a query string; anything unknown is ignored. */
export function readShortcut(search: string): Shortcut {
  const q = new URLSearchParams(search)
  const action = q.get('action')
  const view = q.get('view')
  const matrix = q.get('matrix')
  return { action: action && ACTIONS.includes(action) ? (action as Action) : undefined, view: view && VIEWS.includes(view) ? (view as ListView) : undefined, matrix: matrix && matrix.length <= 600 ? matrix : undefined }
}

export const withoutShortcut = (href: string): string => {
  const u = new URL(href)
  u.searchParams.delete('action')
  u.searchParams.delete('view')
  u.searchParams.delete('matrix')
  return u.pathname + (u.search || '') + u.hash
}
