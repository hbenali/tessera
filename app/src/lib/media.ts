/** SDK-free bridge so avatars can load authenticated media without importing the Matrix SDK. */
export type Thumb = (mxc: string, size: number, method?: 'crop' | 'scale') => Promise<string>

let fetcher: Thumb | null = null

export const setThumbLoader = (f: Thumb) => { fetcher = f }

/** The original file behind an mxc:// URL, fetched with the access token. */
export type Original = (mxc: string) => Promise<Blob>
let original: Original | null = null
export const setOriginalLoader = (f: Original) => { original = f }
export const originalOf: Original = (mxc) => (original ? original(mxc) : Promise.reject(new Error('not signed in')))

export const thumb: Thumb = (mxc, size, method) =>
  fetcher ? fetcher(mxc, size, method) : Promise.reject(new Error('not signed in'))
