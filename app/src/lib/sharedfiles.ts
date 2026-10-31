// Files shared into Tessera from another app wait in IndexedDB: the service worker puts them there (it receives the POST),
// the app takes them when you choose a room. The names match sw.js.
const DB = 'tessera-share'
const STORE = 'files'

const open = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { autoIncrement: true })
    r.onerror = () => reject(r.error)
    r.onsuccess = () => resolve(r.result)
  })

interface Stored { name: string; type: string; blob: Blob }

/** Take the waiting files out (and forget them). */
export async function takeShared(): Promise<File[]> {
  try {
    const db = await open()
    const rows = await new Promise<Stored[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const all = store.getAll()
      all.onsuccess = () => { store.clear(); resolve(all.result as Stored[]) }
      all.onerror = () => reject(all.error)
    })
    db.close()
    return rows.filter((r) => r?.blob instanceof Blob).map((r) => new File([r.blob], r.name || 'shared-file', { type: r.type || r.blob.type }))
  } catch {
    return []
  }
}

/** Forget the waiting files without using them. */
export async function clearShared(): Promise<void> {
  try {
    const db = await open()
    await new Promise<void>((resolve) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).clear(); tx.oncomplete = () => resolve(); tx.onerror = () => resolve() })
    db.close()
  } catch { /* nothing waiting */ }
}
