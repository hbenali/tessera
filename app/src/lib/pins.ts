/** Pinned-event list helpers (m.room.pinned_events). Newest pin last, no duplicates. */
export function toggled(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list.filter((x) => x !== id), id]
}
