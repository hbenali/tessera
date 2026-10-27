/** SDK-free bridge so avatars can load authenticated media without importing the Matrix SDK. */
export type Thumb = (mxc: string, size: number, method?: 'crop' | 'scale') => Promise<string>

let fetcher: Thumb | null = null

export const setThumbLoader = (f: Thumb) => { fetcher = f }

export const thumb: Thumb = (mxc, size, method) =>
  fetcher ? fetcher(mxc, size, method) : Promise.reject(new Error('not signed in'))
