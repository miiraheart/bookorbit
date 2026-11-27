import { describe, expect, it } from 'vitest'
import type { ReleaseCandidateItem } from '@bookorbit/types'
import { pickReadAlongPair, rankAudiobookReleases, rankEbookReleases, readAlongLanguage } from '../readAlongPick'

let guid = 0

function release(overrides: Partial<ReleaseCandidateItem> = {}): ReleaseCandidateItem {
  guid += 1
  return {
    indexerId: 1,
    indexerName: 'MyAnonaMouse',
    guid: `g${guid}`,
    title: 'Fifty Shades of Grey',
    infoUrl: null,
    sizeBytes: 300_000_000,
    seeders: 10,
    leechers: 0,
    grabs: null,
    format: 'm4b',
    formats: ['m4b'],
    language: 'en',
    fileCount: 1,
    freeleech: false,
    vipOnly: false,
    alreadyGrabbed: false,
    publishedAt: null,
    audio: null,
    score: 80,
    tier: null,
    tierName: null,
    profileMismatch: null,
    reasons: [{ code: 'authorMatch', points: 50 }],
    ...overrides,
  }
}

function ebook(overrides: Partial<ReleaseCandidateItem> = {}): ReleaseCandidateItem {
  return release({ format: 'epub', formats: ['epub'], sizeBytes: 2_000_000, ...overrides })
}

const aa = { indexerId: 2, indexerName: "Anna's Archive", seeders: null, leechers: null }
const titles = (list: ReleaseCandidateItem[]) => list.map((entry) => entry.title)

describe('rankAudiobookReleases', () => {
  it('drops abridged, dramatized, summary, omnibus and part-of releases but keeps an unabridged one', () => {
    const kept = release({ title: 'Fifty Shades of Grey (Unabridged)' })
    const ranked = rankAudiobookReleases([
      release({ title: 'Fifty Shades of Grey (Abridged)' }),
      release({ title: 'Fifty Shades of Grey: A Full Cast Dramatization' }),
      release({ title: 'Summary of Fifty Shades of Grey' }),
      release({ title: 'Fifty Shades of Grey Box Set' }),
      release({ title: 'Fifty Shades of Grey, Part 1 of 3' }),
      kept,
    ])
    expect(ranked.ranked).toEqual([kept])
    expect(ranked.pick).toBe(kept)
  })

  it('says so when every matching audiobook is flagged', () => {
    const ranked = rankAudiobookReleases([release({ title: 'Fifty Shades of Grey (Abridged)' })])
    expect(ranked).toEqual({ pick: null, ranked: [], missing: 'flagged' })
  })

  it('drops another book, zero seeders and an implausible size, and keeps a low ISBN match', () => {
    const isbn = release({ title: 'FSOG', reasons: [{ code: 'isbnMatch', points: 61 }] })
    const ranked = rankAudiobookReleases([
      release({ title: 'Fifty Shades Darker', reasons: [{ code: 'authorMatch', points: 35 }] }),
      release({ seeders: 0 }),
      release({
        reasons: [
          { code: 'authorMatch', points: 50 },
          { code: 'suspiciousSize', points: -25 },
        ],
      }),
      release({ reasons: [] }),
      isbn,
    ])
    expect(ranked.ranked).toEqual([isbn])
  })

  it('orders by seeders, then downloads, then score, with unknown counts last', () => {
    const a = release({ title: 'a', seeders: 5, grabs: 900, score: 99 })
    const b = release({ title: 'b', seeders: 40, grabs: null, score: 60 })
    const c = release({ title: 'c', seeders: 40, grabs: 10, score: 60 })
    const d = release({ title: 'd', seeders: 40, grabs: 10, score: 70 })
    const e = release({ title: 'e', ...aa, grabs: 5000 })
    const f = release({ title: 'f', ...aa, grabs: undefined, score: 95 })
    expect(titles(rankAudiobookReleases([f, e, a, b, c, d]).ranked)).toEqual(['d', 'c', 'b', 'a', 'e', 'f'])
  })

  it('reports an empty search as no release', () => {
    expect(rankAudiobookReleases([])).toEqual({ pick: null, ranked: [], missing: 'noRelease' })
  })

  it('reports a list of other books as no match', () => {
    expect(rankAudiobookReleases([release({ reasons: [{ code: 'titleMatch', points: 14 }] })]).missing).toBe('noMatch')
  })
})

describe('rankEbookReleases', () => {
  const work = { language: 'en' }

  it('puts a seeded torrent before a direct source, whatever the download count', () => {
    const direct = ebook({ title: 'direct', ...aa, grabs: 10_000, score: 90 })
    const torrent = ebook({ title: 'torrent', seeders: 3, score: 70 })
    expect(titles(rankEbookReleases([direct, torrent], null, work).ranked)).toEqual(['torrent', 'direct'])
  })

  it('falls back to the direct source with the most downloads when no torrent matches', () => {
    const few = ebook({ title: 'few', ...aa, grabs: 195 })
    const many = ebook({ title: 'many', ...aa, grabs: 10_207 })
    const unknown = ebook({ title: 'unknown', ...aa, grabs: null, score: 99 })
    expect(titles(rankEbookReleases([few, unknown, many], null, work).ranked)).toEqual(['many', 'few', 'unknown'])
  })

  it('prefers an EPUB over any other format', () => {
    const mobi = ebook({ title: 'mobi', format: 'mobi', formats: ['mobi'], seeders: 200 })
    const epub = ebook({ title: 'epub', ...aa, grabs: 3 })
    const both = ebook({ title: 'both', format: 'azw3', formats: ['azw3', 'epub'], seeders: 1 })
    expect(titles(rankEbookReleases([mobi, epub, both], null, work).ranked)).toEqual(['both', 'epub', 'mobi'])
  })

  it('takes the language of the picked audiobook over the work language', () => {
    const audio = release({ language: 'French' })
    const english = ebook({ title: 'english', language: 'en' })
    const french = ebook({ title: 'french', language: 'fra' })
    expect(readAlongLanguage(audio, work)).toBe('fr')
    expect(titles(rankEbookReleases([english, french], audio, work).ranked)).toEqual(['french'])
  })

  it('reports a language mismatch when nothing is in the right language', () => {
    expect(rankEbookReleases([ebook({ language: 'de' })], release({ language: 'en' }), work)).toMatchObject({ pick: null, missing: 'language' })
  })

  it('accepts an unstated language only when the work language is known and is the target', () => {
    const unstated = ebook({ language: null })
    expect(rankEbookReleases([unstated], release({ language: 'en' }), work).pick).toBe(unstated)
    expect(rankEbookReleases([unstated], release({ language: 'fr' }), work).pick).toBeNull()
    expect(rankEbookReleases([unstated], release({ language: 'fr' }), { language: null }).pick).toBeNull()
    expect(rankEbookReleases([unstated], null, { language: null }).pick).toBe(unstated)
  })

  it('drops omnibus, summary and abridged ebooks', () => {
    const kept = ebook({ title: 'Fifty Shades of Grey' })
    const ranked = rankEbookReleases(
      [
        ebook({ title: 'Fifty Shades Trilogy' }),
        ebook({ title: 'Summary of Fifty Shades of Grey' }),
        ebook({ title: 'Fifty Shades of Grey abridged' }),
        kept,
      ],
      null,
      work,
    )
    expect(ranked.ranked).toEqual([kept])
  })

  it('drops a split ebook volume', () => {
    const kept = ebook({ title: 'The Stand' })
    const ranked = rankEbookReleases([ebook({ title: 'The Stand (Part 1 of 2)' }), ebook({ title: 'The Stand, Part 2 of 2' }), kept], null, work)
    expect(ranked.ranked).toEqual([kept])
  })

  it('keeps an EPUB from a direct source above a seeded AZW3 torrent, since only an EPUB reads along', () => {
    const azw3 = ebook({ title: 'azw3', format: 'azw3', formats: ['azw3'], seeders: 254 })
    const epub = ebook({ title: 'epub', ...aa, grabs: 200 })
    expect(titles(rankEbookReleases([azw3, epub], null, work).ranked)).toEqual(['epub', 'azw3'])
  })
})

describe('pickReadAlongPair', () => {
  it('matches the ebook to the audiobook it picked', () => {
    const audio = release({ language: 'fr', seeders: 50 })
    const otherAudio = release({ language: 'en', seeders: 2 })
    const frEbook = ebook({ title: 'fr', language: 'fr' })
    const enEbook = ebook({ title: 'en', language: 'en', seeders: 500 })
    const picked = pickReadAlongPair([otherAudio, audio], [enEbook, frEbook], { language: 'en' })
    expect(picked.audio?.pick).toBe(audio)
    expect(picked.ebook?.pick).toBe(frEbook)
  })

  it('skips a half that is not searched, and judges the ebook by the work alone', () => {
    const enEbook = ebook({ language: 'en' })
    const picked = pickReadAlongPair(null, [ebook({ language: 'de' }), enEbook], { language: 'en' })
    expect(picked.audio).toBeNull()
    expect(picked.ebook?.pick).toBe(enEbook)
    expect(pickReadAlongPair([release()], null, { language: 'en' }).ebook).toBeNull()
  })
})
