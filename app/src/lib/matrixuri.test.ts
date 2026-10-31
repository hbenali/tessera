import { describe, expect, it } from 'vitest'
import { parseMatrixUri } from './matrixuri'

describe('parseMatrixUri', () => {
  it('reads a room alias, a room id, and an event in a room', () => {
    expect(parseMatrixUri('matrix:r/room:example.org')).toEqual({ kind: 'room', ref: '#room:example.org', event: undefined, via: [] })
    expect(parseMatrixUri('matrix:roomid/abc123:example.org?via=a.org&via=b.org')).toEqual({ kind: 'room', ref: '!abc123:example.org', event: undefined, via: ['a.org', 'b.org'] })
    expect(parseMatrixUri('matrix:roomid/abc:example.org/e/Xyz_-12')).toMatchObject({ ref: '!abc:example.org', event: '$Xyz_-12' })
  })
  it('reads a person, and the web+matrix form, and the // form', () => {
    expect(parseMatrixUri('matrix:u/ann:example.org')).toEqual({ kind: 'user', id: '@ann:example.org' })
    expect(parseMatrixUri('web+matrix:u/ann:example.org:8448')).toEqual({ kind: 'user', id: '@ann:example.org:8448' })
    expect(parseMatrixUri('matrix://example.org/r/room:example.org')).toMatchObject({ ref: '#room:example.org' })
    expect(parseMatrixUri('matrix:r/caf%C3%A9:example.org')).toMatchObject({ ref: '#café:example.org' })
  })
  it('refuses anything malformed, so a link can only open a screen', () => {
    for (const bad of ['', 'https://matrix.to/#/#a:b', 'matrix:x/a:b', 'matrix:r/noserver', 'matrix:r/a:b c', 'matrix:r/a:b/e', 'matrix:r/a:b/x/y', 'matrix:u/<script>:evil.org', 'matrix:u/ann:ex ample.org', 'matrix:r/a:b/e/%24bad%24', 'matrix:r/%E0%A4%A:b', 'matrix:u/a:b/extra']) expect(parseMatrixUri(bad), bad).toBeNull()
    expect(parseMatrixUri('matrix:r/' + 'a'.repeat(700) + ':b.org')).toBeNull()
  })
  it('drops a via that is not a server name', () => {
    expect(parseMatrixUri('matrix:r/a:b.org?via=ok.org&via=bad%20host&via=javascript:x')).toMatchObject({ via: ['ok.org'] })
  })
})
