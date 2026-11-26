import { describe, expect, it } from 'vitest'
import type { BookCard, BookFileRef } from '@bookorbit/types'

import { classifyCard, openableEntries, ownedFormats, pickCopies, readerLocation, rowCards } from '../copies'

let nextFileId = 1

function file(format: string, overrides: Partial<BookFileRef> = {}): BookFileRef {
  return { id: nextFileId++, format, role: 'content', sizeBytes: 1000, ...overrides }
}

function card(id: number, files: BookFileRef[], overrides: Partial<BookCard> = {}): BookCard {
  return {
    id,
    libraryId: 1,
    status: 'present',
    coverAspectRatio: '2/3',
    title: 'A Court of Wings and Ruin',
    authors: ['Sarah J. Maas'],
    seriesName: null,
    seriesIndex: null,
    files,
    publishedDate: null,
    publishedYear: null,
    language: 'en',
    genres: [],
    rating: null,
    readingProgress: null,
    readStatus: null,
    addedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    coverVersion: '1',
    metadataScore: null,
    hasCover: true,
    hasMetadataLocks: false,
    lockedFields: [],
    subtitle: null,
    publisher: null,
    pageCount: null,
    isbn13: null,
    narrators: [],
    tags: [],
    customMetadata: [],
    ...overrides,
  }
}

function byId(cards: BookCard[]): Map<number, BookCard> {
  return new Map(cards.map((entry) => [entry.id, entry]))
}

const narrated = { available: true, durationSeconds: 3600 }

describe('goodreads copies', () => {
  it('opens an ebook copy first and keeps the audiobook for the audio switch (A Court of Wings and Ruin)', () => {
    const cards = [card(2444, [file('m4b', { role: 'primary' })]), card(2611, [file('epub', { role: 'primary' })]), card(4124, [file('epub')])]
    const copies = pickCopies(rowCards({ bookIds: [2444, 2611, 4124] }, byId(cards)))
    expect(copies.primary?.id).toBe(2611)
    expect(copies.ebook?.id).toBe(2611)
    expect(copies.audio?.id).toBe(2444)
    expect(copies.others.map((entry) => entry.id)).toEqual([4124])
    expect(ownedFormats(cards)).toEqual({ ebook: true, audio: true })
  })

  it('prefers a whole audiobook over a split part', () => {
    const part = card(10, [file('mp3')], { title: 'Wind and Truth (Part 2 of 3)' })
    const whole = card(11, [file('m4b')], { title: 'Wind and Truth' })
    expect(pickCopies([part, whole]).audio?.id).toBe(11)
    expect(pickCopies([part]).audio?.id).toBe(10)
  })

  it('prefers a narrated EPUB over a plain one', () => {
    const plain = card(20, [file('epub')])
    const overlay = card(21, [file('epub', { mediaOverlay: narrated })])
    expect(pickCopies([plain, overlay]).ebook?.id).toBe(21)
  })

  it('never takes a narrated EPUB without audio tracks as the audio copy', () => {
    const overlay = card(30, [file('epub', { mediaOverlay: narrated })])
    const audiobook = card(31, [file('m4b')])
    expect(classifyCard(overlay)).toBe('both')
    expect(pickCopies([overlay]).audio).toBeNull()
    expect(pickCopies([overlay, audiobook])).toMatchObject({ ebook: { id: 30 }, audio: { id: 31 } })
    expect(ownedFormats([overlay])).toEqual({ ebook: true, audio: false })
  })

  it('ignores covers and supplements when classifying a copy', () => {
    const sidecars = card(40, [file('jpg', { role: 'cover' }), file('json', { role: 'supplement' })])
    expect(classifyCard(sidecars)).toBe('other')
    expect(classifyCard(card(41, [file('jpg', { role: 'cover' }), file('m4b')]))).toBe('audio')
    expect(classifyCard(card(42, [file('epub'), file('m4b')]))).toBe('both')
    expect(pickCopies([sidecars])).toMatchObject({ ebook: null, audio: null, primary: { id: 40 } })
  })

  it('skips ids with no card, and has no primary when every id is missing', () => {
    const cards = byId([card(2, [file('epub')])])
    expect(rowCards({ bookIds: [1, 2, 3] }, cards).map((entry) => entry.id)).toEqual([2])
    expect(pickCopies(rowCards({ bookIds: [7, 8] }, cards))).toEqual({ ebook: null, audio: null, primary: null, others: [] })
  })

  it('links to the reader with the file format, and a peek adds the mode', () => {
    const audiobook = file('m4b')
    expect(readerLocation({ id: 2444 }, audiobook)).toEqual({
      name: 'reader',
      params: { bookId: 2444, fileId: audiobook.id },
      query: { format: 'm4b' },
    })
    expect(readerLocation({ id: 2444 }, audiobook, 'peek')).toMatchObject({ query: { format: 'm4b', mode: 'peek' } })
    expect(readerLocation({ id: 2444 }, audiobook, undefined, { at: '61000' })).toEqual({
      name: 'reader',
      params: { bookId: 2444, fileId: audiobook.id },
      query: { format: 'm4b', at: '61000' },
    })
  })

  it('lists one openable entry per edition and opens a multi-track audiobook from its first track', () => {
    const track1 = file('mp3')
    const track2 = file('mp3')
    const epub = file('epub', { role: 'primary' })
    const entries = openableEntries(card(50, [file('jpg', { role: 'cover' }), track1, track2, epub, file('txt')]))
    expect(entries.map((entry) => [entry.key, entry.file.id])).toEqual([
      ['epub', epub.id],
      ['mp3', track1.id],
    ])
  })
})
