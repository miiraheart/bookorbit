import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { BookCard, BookDetail, BookFileRef, GoodreadsShelfRow } from '@bookorbit/types'
import { i18n } from '@/i18n'
import GoodreadsOwnedSheet from '../GoodreadsOwnedSheet.vue'
import { installGoodreadsMessages } from '../../i18n'

const fetchDetail = vi.fn<(bookId: number) => Promise<void>>()
const detail = ref<BookDetail | null>(null)

vi.mock('@/features/book/composables/useBookDetail', () => ({
  useBookDetail: () => ({ detail, loading: ref(false), error: ref(null), fetch: fetchDetail }),
}))
vi.mock('@/features/library/composables/useLibraries', () => ({
  useLibraries: () => ({
    libraries: ref([
      { id: 1, name: 'Audiobooks' },
      { id: 2, name: 'Ebooks' },
    ]),
  }),
}))
vi.mock('@/features/auth/composables/usePermissions', async () => {
  const { computed } = await import('vue')
  return { usePermissions: () => ({ hasPermission: () => true, isDemoRestrictedAccount: computed(() => false) }) }
})
vi.mock('@/features/read-along-pairs/api/read-along-pairs.api', () => ({
  fetchCandidates: vi.fn<() => Promise<unknown>>(async () => ({ pair: null, pairState: null, candidates: [], dismissedEbookBookIds: [], dismissed: [] })),
}))
vi.mock('../../api/bookmarks.api', () => ({
  fetchEbookBookmarks: vi.fn<() => Promise<unknown[]>>(async () => []),
  fetchAudioBookmarks: vi.fn<() => Promise<unknown[]>>(async () => []),
}))
vi.mock('@/features/book/components/detail/tabs/HighlightsTab.vue', () => ({
  __esModule: true,
  default: { props: ['book'], template: '<div data-testid="stub-highlights">{{ book.id }}</div>' },
}))
vi.mock('@/features/book/components/detail/tabs/FilesTab.vue', () => ({
  __esModule: true,
  default: { props: ['book'], emits: ['refetch'], template: '<div data-testid="stub-files">{{ book.id }}</div>' },
}))
vi.mock('@/features/book/components/detail/tabs/ReadingLogTab.vue', () => ({
  __esModule: true,
  default: { props: ['book'], template: '<div data-testid="stub-reading-log" />' },
}))
vi.mock('@/features/book/components/detail/tabs/ChaptersTab.vue', () => ({
  __esModule: true,
  default: { props: ['book'], template: '<div data-testid="stub-chapters" />' },
}))

installGoodreadsMessages()
const t = i18n.global.t
const Empty = defineComponent({ render: () => null })
const passThrough = { template: '<div><slot /></div>' }

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'goodreads', component: Empty },
      { path: '/read/:bookId/:fileId', name: 'reader', component: Empty },
      { path: '/book/:bookId', name: 'book-detail', component: Empty },
    ],
  })
}

function file(id: number, format: string, overrides: Partial<BookFileRef> = {}): BookFileRef {
  return { id, format, role: 'primary', sizeBytes: 1000, ...overrides }
}

function card(id: number, libraryId: number, files: BookFileRef[]): BookCard {
  return {
    id,
    libraryId,
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
    hasCover: false,
    hasMetadataLocks: false,
    lockedFields: [],
    subtitle: null,
    publisher: null,
    pageCount: null,
    isbn13: null,
    narrators: [],
    tags: [],
    customMetadata: [],
  }
}

const row = {
  key: 'acowar',
  goodreadsId: '23766634',
  title: 'A Court of Wings and Ruin',
  authors: ['Sarah J. Maas'],
  coverUrl: null,
  bookIds: [2444, 2611],
} as unknown as GoodreadsShelfRow

function asDetail(source: BookCard): BookDetail {
  return { ...source, libraryId: source.libraryId!, libraryName: 'Library' } as unknown as BookDetail
}

async function mountSheet(cards: BookCard[], bookId: number) {
  detail.value = asDetail(cards.find((entry) => entry.id === bookId)!)
  const router = makeRouter()
  const wrapper = mount(GoodreadsOwnedSheet, {
    props: { row, cards, bookId, open: true },
    global: {
      plugins: [router],
      stubs: { Sheet: passThrough, SheetContent: passThrough, SheetHeader: passThrough, SheetTitle: passThrough, SheetDescription: passThrough },
    },
  })
  await flushPromises()
  return wrapper
}

const audiobook = () => card(2444, 1, [file(501, 'm4b')])
const ebook = () => card(2611, 2, [file(601, 'epub')])

describe('GoodreadsOwnedSheet', () => {
  beforeEach(() => {
    fetchDetail.mockReset()
  })

  it('reads the epub copy and listens to the m4b copy, with the reader routes', async () => {
    const wrapper = await mountSheet([audiobook(), ebook()], 2611)

    const read = wrapper.get('[data-testid="goodreads-copy-open-2611-epub"]')
    expect(read.text()).toContain(t('goodreads.read'))
    expect(read.attributes('href')).toBe('/read/2611/601?format=epub')
    const listen = wrapper.get('[data-testid="goodreads-copy-open-2444-m4b"]')
    expect(listen.text()).toContain(t('goodreads.listen'))
    expect(listen.attributes('href')).toBe('/read/2444/501?format=m4b')
    expect(wrapper.get('[data-testid="goodreads-copy-peek-2611-epub"]').attributes('href')).toBe('/read/2611/601?format=epub&mode=peek')
    expect(wrapper.get('[data-testid="goodreads-copy-line-2611"]').text()).toContain('Ebooks')
    expect(fetchDetail).toHaveBeenCalledWith(2611)
  })

  it('offers Pair ebook for separate records instead of the note, and no Read along button', async () => {
    const wrapper = await mountSheet([audiobook(), ebook()], 2611)

    expect(wrapper.get('[data-testid="goodreads-pair-ebook"]').text()).toContain(t('goodreads.pairEbook'))
    expect(wrapper.find('[data-testid="goodreads-read-along-note"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="goodreads-read-along"]').exists()).toBe(false)
  })

  it('reads along from the read-along published into the audiobook record of a pair', async () => {
    const narrated = card(2444, 1, [file(501, 'm4b'), file(702, 'epub', { mediaOverlay: { available: true, durationSeconds: 60 } })])
    const wrapper = await mountSheet([narrated, ebook()], 2611)

    expect(wrapper.get('[data-testid="goodreads-read-along"]').attributes('href')).toBe('/read/2444/702?format=epub')
    expect(wrapper.find('[data-testid="goodreads-pair-ebook"]').exists()).toBe(false)
  })

  it('offers Read along for a narrated EPUB', async () => {
    const narrated = card(2484, 2, [file(701, 'epub', { mediaOverlay: { available: true, durationSeconds: 60 } })])
    const wrapper = await mountSheet([narrated], 2484)

    expect(wrapper.get('[data-testid="goodreads-read-along"]').attributes('href')).toBe('/read/2484/701?format=epub')
    expect(wrapper.find('[data-testid="goodreads-read-along-note"]').exists()).toBe(false)
  })

  it('mounts the book page tabs for the picked copy, with Chapters only for audio', async () => {
    const wrapper = await mountSheet([audiobook(), ebook()], 2611)
    expect(wrapper.find('[data-testid="goodreads-owned-tab-chapters"]').exists()).toBe(false)

    await wrapper.get('[data-testid="goodreads-owned-tab-highlights"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="stub-highlights"]').text()).toBe('2611')

    await wrapper.get('[data-testid="goodreads-owned-tab-files"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="stub-files"]').text()).toBe('2611')
  })

  it('asks for another copy from its line, and that copy gets the Chapters tab', async () => {
    const wrapper = await mountSheet([audiobook(), ebook()], 2611)
    await wrapper.get('[data-testid="goodreads-copy-select-2444"]').trigger('click')
    expect(wrapper.emitted('update:bookId')).toEqual([[2444]])

    detail.value = asDetail(audiobook())
    await wrapper.setProps({ bookId: 2444 })
    await flushPromises()
    expect(fetchDetail).toHaveBeenLastCalledWith(2444)
    expect(wrapper.find('[data-testid="goodreads-owned-tab-chapters"]').exists()).toBe(true)
  })
})
