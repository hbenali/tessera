import { describe, expect, it } from 'vitest'
import { keywordProblem, keywordRuleId, normalizeKeyword, readKeywords } from './keywords'

describe('keywords', () => {
  it('normalises and builds a stable rule id', () => {
    expect(normalizeKeyword('  Deploy   Now ')).toBe('deploy now')
    expect(keywordRuleId('Deploy Now')).toBe('tessera.kw.deploy%20now')
  })
  it('reads only our rules that are on', () => {
    expect(readKeywords([{ rule_id: 'tessera.kw.a', pattern: 'a' }, { rule_id: '.m.rule.x', pattern: 'x' }, { rule_id: 'tessera.kw.b', pattern: 'b', enabled: false }, { rule_id: 'tessera.kw.c', pattern: 'c', enabled: true }])).toEqual(['a', 'c'])
    expect(readKeywords(undefined)).toEqual([])
  })
  it('explains why a word is refused', () => {
    expect(keywordProblem('  ', [])).toBeTruthy()
    expect(keywordProblem('a', [])).toMatch(/2 characters/)
    expect(keywordProblem('dep*', [])).toMatch(/Wildcards/)
    expect(keywordProblem('Deploy', ['deploy'])).toMatch(/already/)
    expect(keywordProblem('deploy', [])).toBeUndefined()
  })
})
