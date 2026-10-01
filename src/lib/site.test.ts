import { describe, expect, it } from 'vitest'
import { indexable } from './site'

describe('site', () => {
  it('lets search engines index production only', () => {
    expect(indexable('production')).toBe(true)
    expect(indexable('preview')).toBe(false)
    expect(indexable('development')).toBe(false)
    expect(indexable(undefined)).toBe(false)
  })
})
