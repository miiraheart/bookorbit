import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { BookCard, GoodreadsShelfPage, GoodreadsShelfRow, GoodreadsSort } from '@bookorbit/types'

vi.mock('../../api/goodreads.api', () => ({
  fetchGoodreadsOverview: vi.fn(),
  fetchGoodreadsShelf: vi.fn(),
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
})
