import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { BookCard, GoodreadsItemDetail, GoodreadsShelfRow, MetadataCandidate } from '@bookorbit/types'
import { i18n } from '@/i18n'

vi.mock('@/features/auth/composables/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true, isSuperuser: ref(true), isDemoRestrictedAccount: ref(false) }),
}))
vi.mock('@/features/book-requests/composables/useRequestDestinationDefault', () => ({
  useRequestLanguageDefault: () => ({ load: vi.fn<() => Promise<boolean>>(async () => true), resolveLanguage: () => null }),
}))
vi.mock('@/features/book/composables/useMetadataSearch', () => ({
  useMetadataSearch: () => ({
    results: ref([]),
    isStreaming: ref(false),
    loadProviders: vi.fn<() => Promise<void>>(async () => undefined),
    search: vi.fn<() => Promise<void>>(async () => undefined),
  }),
}))
vi.mock('../../api/goodreads.api', () => ({
  fetchGoodreadsItem: vi.fn<() => Promise<unknown>>(),
  lookupGoodreadsBook: vi.fn<() => Promise<unknown>>(),
  requestGoodreadsBook: vi.fn<() => Promise<unknown>>(),
}))

import { fetchGoodreadsItem, lookupGoodreadsBook, requestGoodreadsBook } from '../../api/goodreads.api'
import GoodreadsDetailView from '../GoodreadsDetailView.vue'

const t = i18n.global.t

function row(key: string, title: string, overrides: Partial<GoodreadsShelfRow> = {}): GoodreadsShelfRow {
  return {
    key,
    goodreadsId: key,
    title,
    authors: ['Steven Erikson'],
    rating: 4,
    isbn13: null,
    coverUrl: null,
    readAt: '2026-10-01T00:00:00.000Z',
    shelves: ['read'],
    bookIds: [],
    source: 'me',
    firstSeenAt: '2026-11-25T00:00:00.000Z',
    isNew: false,
    request: null,
    requests: {},
    ...overrides,
  }
}

const ownedCard: BookCard = { ...({} as BookCard), id: 7, files: [{ id: 70, format: 'epub', role: 'primary', sizeBytes: 1000 }] }

const fixture: GoodreadsItemDetail = {
  item: row('55401', 'Deadhouse Gates (Malazan Book of the Fallen, #2)', {
    request: { id: 5, status: 'pending' },
    requests: { ebook: { id: 5, status: 'pending' } },
  }),
  related: [row('55399', 'Gardens of the Moon (Malazan Book of the Fallen, #1)', { bookIds: [7] }), row('900', 'The Lees of Laughter’s End')],
  cards: [ownedCard],
}

const candidate: MetadataCandidate = {
  provider: 'goodreads',
  providerId: '55401',
  title: 'Deadhouse Gates',
  authors: ['Steven Erikson'],
  description: '<p>Synopsis <b>text</b></p>',
  publisher: 'Tor',
  publishedYear: 2000,
  pageCount: 604,
  genres: ['Fantasy'],
  seriesName: 'Malazan Book of the Fallen',
  seriesIndex: '2',
}

async function mountAt(path: string) {
  const Empty = defineComponent({ render: () => null })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/goodreads', name: 'goodreads', component: Empty },
      { path: '/goodreads/book/:source/:key', name: 'goodreads-book', component: Empty },
      { path: '/book/:bookId', name: 'book-detail', component: Empty },
      { path: '/requests/:id', name: 'book-request-detail', component: Empty },
    ],
  })
  await router.push(path)
  const wrapper = mount(GoodreadsDetailView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('GoodreadsDetailView', () => {
  beforeEach(() => {
    vi.mocked(fetchGoodreadsItem).mockReset().mockResolvedValue(fixture)
    vi.mocked(lookupGoodreadsBook).mockReset().mockResolvedValue(candidate)
    vi.mocked(requestGoodreadsBook).mockReset().mockResolvedValue({ id: 6, status: 'pending' })
  })

  it('reads the book by the source and key in its address, so a reload lands on it', async () => {
    await mountAt('/goodreads/book/me/55401')
    expect(fetchGoodreadsItem).toHaveBeenCalledWith('me', '55401')
    expect(lookupGoodreadsBook).toHaveBeenCalledWith('55401')
  })

  it('renders the library details layout from the fixture', async () => {
    const { wrapper } = await mountAt('/goodreads/book/me/55401')

    expect(wrapper.find('[data-testid="goodreads-detail-cover"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="goodreads-detail-title"]').text()).toBe('Deadhouse Gates')
    expect(wrapper.find('[data-testid="goodreads-detail-series"]').text()).toBe('Malazan Book of the Fallen #2')
    expect(wrapper.find('[data-testid="goodreads-detail-genres"]').text()).toContain('Fantasy')
    expect(wrapper.find('[data-testid="goodreads-detail-synopsis"]').text()).toContain('Synopsis text')
    expect(wrapper.find('[data-testid="goodreads-detail-reading"]').exists()).toBe(true)
    const facts = wrapper.find('[data-testid="goodreads-detail-facts"]').text()
    for (const value of ['Tor', '2000', '604', '55401']) expect(facts).toContain(value)

    const ebook = wrapper.find('[data-testid="goodreads-detail-request-state-ebook"] a')
    expect(ebook.attributes('href')).toBe('/requests/5')
    expect(wrapper.find('[data-testid="goodreads-detail-request-state-audiobook"]').text()).toContain(t('goodreads.detail.notRequested'))
    expect(wrapper.find('[data-testid="goodreads-detail-request-ebook"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="goodreads-detail-request-audiobook"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="goodreads-detail-goodreads"]').attributes('href')).toBe('https://www.goodreads.com/book/show/55401')
  })

  it('lists the rest of the series first, an owned one linking to its library copy', async () => {
    const { wrapper } = await mountAt('/goodreads/book/me/55401')
    const items = wrapper.findAll('[data-testid="goodreads-related-item"]')

    expect(items).toHaveLength(1)
    expect(items[0]!.attributes('href')).toBe('/book/7?tab=details')
    await wrapper.find('[data-testid="goodreads-related-tab-author"]').trigger('click')
    const byAuthor = wrapper.findAll('[data-testid="goodreads-related-item"]')
    expect(byAuthor).toHaveLength(2)
    expect(byAuthor[1]!.attributes('href')).toBe('/goodreads/book/me/900')
  })

  it('requests a missing format and reloads the book', async () => {
    const { wrapper } = await mountAt('/goodreads/book/me/55401')
    await wrapper.find('[data-testid="goodreads-detail-request-audiobook"]').trigger('click')
    await flushPromises()

    expect(requestGoodreadsBook).toHaveBeenCalledWith(fixture.item, null, 'audiobook')
    expect(fetchGoodreadsItem).toHaveBeenCalledTimes(2)
  })

  it('reads the next book when the address changes on the same page', async () => {
    const { router } = await mountAt('/goodreads/book/me/55401')
    await router.push('/goodreads/book/me/55399')
    await flushPromises()

    expect(fetchGoodreadsItem).toHaveBeenLastCalledWith('me', '55399')
  })

  it('says so when the book left the shelves', async () => {
    vi.mocked(fetchGoodreadsItem).mockRejectedValue(new Error('404'))
    const { wrapper } = await mountAt('/goodreads/book/me/gone')

    expect(wrapper.find('[data-testid="goodreads-detail-missing"]').text()).toBe(t('goodreads.detail.notFound'))
  })
})
