import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { GOODREADS_CARD_CAP, type BookCard, type GoodreadsShelfPage, type GoodreadsShelfRow, type GoodreadsSort } from '@bookorbit/types'

vi.mock('../../api/goodreads.api', () => ({
  fetchGoodreadsOverview: vi.fn<() => Promise<unknown>>(),
  fetchGoodreadsShelf: vi.fn<() => Promise<unknown>>(),
}))

import { fetchGoodreadsShelf } from '../../api/goodreads.api'
import { useGoodreadsShelves } from '../useGoodreadsShelves'

const mockShelf = vi.mocked(fetchGoodreadsShelf)

function row(key: string, bookIds: number[]): GoodreadsShelfRow {
  return {
    key,
    goodreadsId: key,
    title: `Book ${key}`,
    authors: ['Author'],
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

function card(id: number, title = `Copy ${id}`): BookCard {
  return { id, title } as BookCard
}

function page(items: GoodreadsShelfRow[], cards: BookCard[], total = 10): GoodreadsShelfPage {
  return { total, items, cards }
}

function setup() {
  const source = ref<string | null>('me')
  const shelf = ref<string | null>('read')
  const sort = ref<GoodreadsSort>('newest')
  const search = ref('')
  return { source, shelf, ...useGoodreadsShelves(source, shelf, sort, search) }
}

describe('useGoodreadsShelves cards', () => {
  beforeEach(() => {
    mockShelf.mockReset()
  })

  it('keeps the cards of earlier pages when more rows are shown', async () => {
    const shelves = setup()
    mockShelf.mockResolvedValueOnce(page([row('a', [1, 2])], [card(1), card(2)]))
    await shelves.loadRows(false)
    mockShelf.mockResolvedValueOnce(page([row('b', [2, 3])], [card(2, 'Copy 2 again'), card(3)]))
    await shelves.loadRows(true)

    expect([...shelves.cardsById.value.keys()]).toEqual([1, 2, 3])
    expect(shelves.cardsById.value.get(2)?.title).toBe('Copy 2 again')
    expect(shelves.rows.value.map((entry) => entry.key)).toEqual(['a', 'b'])
  })

  it('replaces the cards on a fresh load', async () => {
    const shelves = setup()
    mockShelf.mockResolvedValueOnce(page([row('a', [1])], [card(1)]))
    await shelves.loadRows(false)
    mockShelf.mockResolvedValueOnce(page([row('c', [5])], [card(5)]))
    await shelves.loadRows(false)

    expect([...shelves.cardsById.value.keys()]).toEqual([5])
  })

  it('clears the cards when no shelf is chosen', async () => {
    const shelves = setup()
    mockShelf.mockResolvedValueOnce(page([row('a', [1])], [card(1)]))
    await shelves.loadRows(false)
    shelves.shelf.value = null
    await shelves.loadRows(false)

    expect(shelves.cardsById.value.size).toBe(0)
    expect(shelves.rows.value).toEqual([])
  })

  it('ignores the cards of a page that a newer load replaced', async () => {
    const shelves = setup()
    let finishFirst: (value: GoodreadsShelfPage) => void = () => {}
    mockShelf.mockReturnValueOnce(new Promise((resolve) => (finishFirst = resolve)))
    mockShelf.mockResolvedValueOnce(page([row('new', [9])], [card(9)]))
    const first = shelves.loadRows(false)
    await shelves.loadRows(false)
    finishFirst(page([row('old', [1])], [card(1)]))
    await first

    expect([...shelves.cardsById.value.keys()]).toEqual([9])
  })

  it('drops a removed copy from its row and from the cards', async () => {
    const shelves = setup()
    mockShelf.mockResolvedValueOnce(page([row('a', [1, 2]), row('b', [3])], [card(1), card(2), card(3)]))
    await shelves.loadRows(false)
    shelves.books.value = shelves.books.value.filter((entry) => entry.id !== 2 && entry.id !== 3)

    expect([...shelves.cardsById.value.keys()]).toEqual([1])
    expect(shelves.rows.value.map((entry) => entry.bookIds)).toEqual([[1], []])
  })

  it('replaces an updated card without touching the rows', async () => {
    const shelves = setup()
    mockShelf.mockResolvedValueOnce(page([row('a', [1])], [card(1)]))
    await shelves.loadRows(false)
    const before = shelves.rows.value
    shelves.books.value = [card(1, 'Renamed')]

    expect(shelves.cardsById.value.get(1)?.title).toBe('Renamed')
    expect(shelves.rows.value).toBe(before)
  })

  it('calls a row unavailable only when the server looked its copies up', async () => {
    const shelves = setup()
    const crowded = Array.from({ length: GOODREADS_CARD_CAP }, (_, index) => index + 1)
    mockShelf.mockResolvedValueOnce(page([row('full', crowded), row('hidden', [1]), row('past-cap', [GOODREADS_CARD_CAP + 1])], [card(5)]))
    await shelves.loadRows(false)
    const [full, hidden, pastCap] = shelves.rows.value

    expect(shelves.isUnavailable(full!)).toBe(false)
    expect(shelves.isUnavailable(hidden!)).toBe(true)
    expect(shelves.isUnavailable(pastCap!)).toBe(false)
  })

  it('keeps the looked up copies of earlier pages on Show more', async () => {
    const shelves = setup()
    mockShelf.mockResolvedValueOnce(page([row('a', [1])], []))
    await shelves.loadRows(false)
    mockShelf.mockResolvedValueOnce(page([row('b', [2])], [card(2)]))
    await shelves.loadRows(true)

    expect(shelves.isUnavailable(shelves.rows.value[0]!)).toBe(true)
    expect([...shelves.checkedIds.value]).toEqual([1, 2])
  })
})
