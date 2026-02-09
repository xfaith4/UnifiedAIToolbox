import { describe, expect, it } from 'vitest'
import { globToRegExp } from '../glob'

describe('globToRegExp', () => {
  it('matches extension wildcard patterns', () => {
    const re = globToRegExp('next.config.*')
    expect(re.test('next.config.js')).toBe(true)
    expect(re.test('next.config.mjs')).toBe(true)
    expect(re.test('next.config')).toBe(false)
  })

  it('does not let * cross directory boundaries', () => {
    const re = globToRegExp('src/*.ts')
    expect(re.test('src/main.ts')).toBe(true)
    expect(re.test('src/nested/main.ts')).toBe(false)
  })

  it('allows **/ to match zero or more directories', () => {
    const re = globToRegExp('src/**/page.tsx')
    expect(re.test('src/page.tsx')).toBe(true)
    expect(re.test('src/app/page.tsx')).toBe(true)
    expect(re.test('src/app/deep/page.tsx')).toBe(true)
  })
})

