import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { BookCard, BookFileRef, GoodreadsShelfPage, GoodreadsShelfRow, GoodreadsSort } from '@bookorbit/types'

const mockApi = vi.hoisted(() => vi.fn<(url: string, init?: RequestInit) => Promise<Response>>())

vi.mock('@/lib/api', () => ({ api: mockApi }))
vi.mock('@/features/scanner/composables/useScanProgress', () => ({ getSocket: () => ({ on: vi.fn<() => void>(), off: vi.fn<() => void>() }) }))
vi.mock('@/features/auth/composables/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true, isSuperuser: ref(true), isDemoRestrictedAccount: ref(false) }),
}))
vi.mock('@/features/library/composables/useLibraries', () => ({
  useLibraries: () => ({ libraries: ref([{ id: 1, accessLevel: 'owner' }]), refreshLibraries: vi.fn<() => Promise<void>>() }),
}))
vi.mock('../../api/goodreads.api', () => ({
  fetchGoodreadsOverview: vi.fn<() => Promise<unknown>>(),
  fetchGoodreadsShelf: vi.fn<() => Promise<unknown>>(),
}))

import { fetchGoodreadsShelf } from '../../api/goodreads.api'
import { useGoodreadsLibrary } from '../useGoodreadsLibrary'
import { useGoodreadsShelves } from '../useGoodreadsShelves'

const mockShelf = vi.mocked(fetchGoodreadsShelf)

function file(id: number, format: string): BookFileRef {
  return { id, format, role: 'primary', sizeBytes: 1000 }
}

function card(id: number, files: BookFileRef[]): BookCard {
  return { id, libraryId: 1, title: `Copy ${id}`, authors: [], files, coverAspectRatio: '2/3' } as unknown as BookCard
}

function row(key: string, bookIds: number[]): GoodreadsShelfRow {
  return {
    key,
    goodreadsId: key,
    title: `Book ${key}`,
    authors: [],
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

const audio = card(2444, [file(1, 'm4b')])
const ebook = card(2611, [file(2, 'epub')])
const other = card(4124, [file(3, 'epub')])

async function setup() {
  const selectedKeys = ref<Set<string>>(new Set())
  const reload = vi.fn<() => void>()
  let state!: ReturnType<typeof useGoodreadsShelves>
  let library!: ReturnType<typeof useGoodreadsLibrary>
  const Harness = defineComponent({
    setup() {
      state = useGoodreadsShelves(ref('me'), ref('read'), ref<GoodreadsSort>('newest'), ref(''))
      library = useGoodreadsLibrary({ books: state.books, rows: state.rows, cardsById: state.cardsById, selectedKeys, reload })
      return () => null
    },
  })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Harness }] })
  mount(Harness, { global: { plugins: [router] } })
  const page: GoodreadsShelfPage = {
    total: 3,
    items: [row('acowar', [2444, 2611, 4124]), row('single', [4124]), row('wanted', [])],
    cards: [audio, ebook, other],
  }
  mockShelf.mockResolvedValueOnce(page)
  await state.loadRows(false)
  return { state, library, selectedKeys, reload }
}

describe('useGoodreadsLibrary', () => {
  beforeEach(() => {
    mockShelf.mockReset()
    mockApi.mockReset()
    mockApi.mockResolvedValue(new Response('{}', { status: 200 }))
  })

  it('shows the ebook copy of a row first', async () => {
    const { state, library } = await setup()
    expect(library.shownCard(state.rows.value[0]!)?.id).toBe(2611)
    expect(library.shownCard(state.rows.value[2]!)).toBeNull()
  })

  it('opens the library quick view on the copy shown', async () => {
    const { library } = await setup()
    library.handleBookAction(ebook, 'quick-view')

    expect(library.quickViewBookId).toBe(2611)
    expect(library.quickViewOpen).toBe(true)
  })

  it('adds one copy to a collection and marks its row selected', async () => {
    const { library, selectedKeys } = await setup()
    library.handleBookAction(ebook, 'add-to-collection')

    expect(library.addToCollectionOpen).toBe(true)
    expect([...library.selectedIds]).toEqual([2611])
    expect([...selectedKeys.value]).toEqual(['acowar'])
    expect(library.selectionMode).toBe(true)
  })

  it('drops a deleted copy from its row and from the card map', async () => {
    const { state, library } = await setup()
    library.handleBookAction(ebook, 'delete')
    expect(library.deleteBookId).toBe(2611)
    await library.confirmDelete()
    await flushPromises()

    expect(mockApi).toHaveBeenCalledWith('/api/v1/books', expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ bookIds: [2611] }) }))
    expect(state.rows.value[0]!.bookIds).toEqual([2444, 4124])
    expect(state.cardsById.value.has(2611)).toBe(false)
    expect(library.shownCard(state.rows.value[0]!)?.id).toBe(4124)
  })

  it('feeds the selected rows into the library selection as the copies they show', async () => {
    const { state, library, selectedKeys } = await setup()
    selectedKeys.value = new Set(['acowar', 'single', 'wanted'])

    expect([...library.selectedIds].sort()).toEqual([2611, 4124])
    expect(library.selectionMode).toBe(true)

    library.setShown('acowar', 2444)
    expect([...library.selectedIds].sort()).toEqual([2444, 4124])
    expect(library.shownCard(state.rows.value[0]!)?.id).toBe(2444)
  })

  it('keeps not owned rows selected when the library selection ends by itself', async () => {
    const { library, selectedKeys } = await setup()
    selectedKeys.value = new Set(['acowar', 'wanted'])
    library.exitSelectionMode()

    expect([...selectedKeys.value]).toEqual(['wanted'])
    expect(library.selectionMode).toBe(false)
  })

  it('opens the copies sheet on the copy shown, and follows the row when copies leave', async () => {
    const { state, library } = await setup()
    library.setShown('acowar', 2444)
    library.openOwnedSheet(state.rows.value[0]!)

    expect(library.ownedSheetOpen).toBe(true)
    expect(library.ownedSheetBookId).toBe(2444)
    expect(library.ownedSheetCards.map((entry) => entry.id)).toEqual([2444, 2611, 4124])

    library.setOwnedSheetBook(4124)
    expect(library.ownedSheetBookId).toBe(4124)
    state.books.value = state.books.value.filter((entry) => entry.id !== 4124)
    expect(library.ownedSheetBookId).toBe(2611)

    library.setOwnedSheetOpen(false)
    expect(library.ownedSheetOpen).toBe(false)
    expect(library.ownedSheetRow).toBeNull()
  })

  it('never opens the copies sheet for a row without copies', async () => {
    const { state, library } = await setup()
    library.openOwnedSheet(state.rows.value[2]!)
    expect(library.ownedSheetOpen).toBe(false)
  })

  it('clears every row from the selection bar exit', async () => {
    const { library, selectedKeys } = await setup()
    selectedKeys.value = new Set(['acowar', 'wanted'])
    library.exitSelection()

    expect(selectedKeys.value.size).toBe(0)
    expect(library.selectedIds.size).toBe(0)
  })
})
