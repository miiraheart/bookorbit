import { describe, expect, it } from 'vitest'
import type { BookCard, BookFileRef, GoodreadsShelfRow } from '@bookorbit/types'
import { goodreadsRowLocation, seriesRows, titleSeries, titleWithoutSeries } from '../related'

function row(key: string, title: string, bookIds: number[] = []): GoodreadsShelfRow {
  return {
    key,
    goodreadsId: key,
    title,
    authors: ['Pierce Brown'],
    rating: null,
    isbn13: null,
    coverUrl: null,
    readAt: null,
    shelves: ['read'],
    bookIds,
    source: 'me',
    firstSeenAt: '2026-11-25T00:00:00.000Z',
    isNew: false,
    request: null,
    requests: {},
  }
}

function card(id: number, format: string): BookCard {
  const file: BookFileRef = { id: id * 10, format, role: 'primary', sizeBytes: 1000 }
  return { ...({} as BookCard), id, files: [file] }
}

describe('titleSeries', () => {
  it('reads the series Goodreads appends to a title', () => {
    expect(titleSeries('Dark Age (Red Rising Saga, #5)')).toEqual({ name: 'Red Rising Saga', index: 5 })
    expect(titleSeries('Edgedancer (The Stormlight Archive, #2.5)')).toEqual({ name: 'The Stormlight Archive', index: 2.5 })
    expect(titleSeries('The Vanishing Half')).toBeNull()
    expect(titleWithoutSeries('Dark Age (Red Rising Saga, #5)')).toBe('Dark Age')
    expect(titleWithoutSeries('The Vanishing Half')).toBe('The Vanishing Half')
  })
})

describe('seriesRows', () => {
  it('keeps the rows of the named series in series order, whatever the accents and case', () => {
    const related = [row('c', 'Light Bringer (Red Rising Saga, #6)'), row('x', 'Sons of Ares'), row('a', 'Golden Son (Red Rising Saga, #2)')]
    expect(seriesRows(related, 'red rising saga').map((entry) => entry.key)).toEqual(['a', 'c'])
    expect(seriesRows(related, null)).toEqual([])
  })
})

describe('goodreadsRowLocation', () => {
  it('opens the library details of the shown copy when one is visible, else the Goodreads page', () => {
    const cards = new Map([
      [2444, card(2444, 'm4b')],
      [2611, card(2611, 'epub')],
    ])
    expect(goodreadsRowLocation(row('a', 'A', [2444, 2611]), cards)).toEqual({
      name: 'book-detail',
      params: { bookId: 2611 },
      query: { tab: 'details' },
    })
    expect(goodreadsRowLocation(row('b', 'B', [999]), cards)).toEqual({ name: 'goodreads-book', params: { source: 'me', key: 'b' } })
  })
})
