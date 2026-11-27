import { afterEach, describe, expect, it } from 'vitest'

import { i18n, setI18nLocale } from '@/i18n'
import { downloadsText, hasPopularity, popularityShare, releaseDateText } from '../releasePopularity'

const t = (key: string, values?: Record<string, unknown>) => i18n.global.t(key, values ?? {})

afterEach(async () => {
  await setI18nLocale('en')
})

describe('popularityShare', () => {
  /** The same table as server/src/modules/book-request/indexers/release-popularity.test.ts. */
  it.each([
    [null, null, null],
    [0, null, 0],
    [1, null, 0.1686],
    [10, null, 0.5833],
    [60, null, 1],
    [254, null, 1],
    [null, 12, 0.3011],
    [null, 200, 0.6226],
    [null, 5000, 1],
    [null, 10207, 1],
    [10, 200, 0.5833],
    [1, 5000, 0.1686],
    [30, 12, 0.8353],
  ])('seeders %s and downloads %s give share %s, as the server ranks them', (seeders, grabs, share) => {
    const actual = popularityShare({ seeders, grabs })
    expect(actual === null ? null : Math.round(actual * 10_000) / 10_000).toBe(share)
  })

  it('reads an absent downloads count as unknown, never as zero', () => {
    expect(popularityShare({ seeders: null })).toBeNull()
    expect(hasPopularity({ seeders: null })).toBe(false)
    expect(hasPopularity({ seeders: null, grabs: 0 })).toBe(true)
  })
})

describe('downloadsText', () => {
  it('says nothing where the source stated no count', () => {
    expect(downloadsText({ seeders: null, grabs: null }, t)).toBeNull()
    expect(downloadsText({ seeders: 4 }, t)).toBeNull()
  })

  it('groups thousands and picks the plural in English', () => {
    expect(downloadsText({ seeders: null, grabs: 10207 }, t)).toBe('10,207 downloads')
    expect(downloadsText({ seeders: null, grabs: 1 }, t)).toBe('1 download')
  })

  it('groups thousands the French way', async () => {
    await setI18nLocale('fr')

    expect(downloadsText({ seeders: null, grabs: 10207 }, t)).toBe('10 207 téléchargements')
    expect(t('bookRequests.releases.seederCountPlural', { count: 1254 })).toBe('1 254 seeders')
  })

  it('groups thousands in the seeder count too', () => {
    expect(t('bookRequests.releases.seederCountPlural', { count: 1254 })).toBe('1,254 seeders')
  })
})

describe('releaseDateText', () => {
  it('shows only the year where the source knows only the year', () => {
    const text = releaseDateText({ publishedAt: '2011-01-01T00:00:00Z', publishedPrecision: 'year' }, t)

    expect(text).toEqual({ short: 'Published 2011', long: 'Published 2011' })
  })

  it('keeps a full date as the date it was added', () => {
    const text = releaseDateText({ publishedAt: '2024-05-03T10:00:00Z', publishedPrecision: null }, t)

    expect(text?.short).toMatch(/2024/)
    expect(text?.long).toBe(`Added ${text?.short}`)
  })

  it('says nothing without a date', () => {
    expect(releaseDateText({ publishedAt: null }, t)).toBeNull()
  })
})
