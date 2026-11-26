import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { BookCard, BookFileRef, GoodreadsOverview, GoodreadsShelfRow } from '@bookorbit/types'

vi.mock('@/lib/api', () => ({ api: vi.fn<() => Promise<Response>>(async () => new Response('{}', { status: 200 })) }))
vi.mock('@/features/scanner/composables/useScanProgress', () => ({ getSocket: () => ({ on: vi.fn<() => void>(), off: vi.fn<() => void>() }) }))
vi.mock('@/features/auth/composables/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true, isSuperuser: ref(true), isDemoRestrictedAccount: ref(false) }),
}))
vi.mock('@/features/library/composables/useLibraries', () => ({
  useLibraries: () => ({ libraries: ref([{ id: 1, accessLevel: 'owner' }]), refreshLibraries: vi.fn<() => Promise<void>>() }),
}))
vi.mock('@/features/book-requests/composables/useRequestDestinationDefault', () => ({
  useRequestLanguageDefault: () => ({ load: vi.fn<() => Promise<boolean>>(async () => true), resolveLanguage: () => null }),
}))
vi.mock('../../api/goodreads.api', () => ({ fetchGoodreadsOverview: vi.fn<() => Promise<unknown>>(), fetchGoodreadsShelf: vi.fn<() => Promise<unknown>>() }))

import { fetchGoodreadsOverview, fetchGoodreadsShelf } from '../../api/goodreads.api'
import GoodreadsView from '../GoodreadsView.vue'

const SYNCED = '2026-11-25T00:00:00.000Z'

const overview: GoodreadsOverview = {
  lastSyncedAt: SYNCED,
  syncRequestedAt: null,
  total: 3,
  sources: [
    {
      id: 'me',
      kind: 'user',
      ref: null,
      name: 'My shelves',
      own: true,
      addedAt: SYNCED,
      lastSyncedAt: SYNCED,
      previousSyncedAt: null,
      lastError: null,
      total: 3,
      newCount: 0,
      shelves: [{ name: 'read', count: 3, newCount: 0 }],
    },
  ],
}

function file(id: number, format: string): BookFileRef {
  return { id, format, role: 'primary', sizeBytes: 1000 }
}

function card(id: number, files: BookFileRef[]): BookCard {
  return {
    ...({} as BookCard),
    id,
    libraryId: 1,
    status: 'present',
    coverAspectRatio: '2/3',
    title: 'A Court of Wings and Ruin',
    authors: ['Sarah J. Maas'],
    files,
    genres: [],
    lockedFields: [],
    narrators: [],
    customMetadata: [],
    tags: [],
    hasCover: false,
  }
}

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
    firstSeenAt: SYNCED,
    isNew: false,
    request: null,
    requests: {},
  }
}

const DialogsStub = defineComponent({
  name: 'GoodreadsBookDialogs',
  props: { library: { type: Object, required: true } },
  template: '<div data-testid="dialogs-stub" :data-selected="library.selectedCount" :data-mode="String(library.selectionMode)" />',
})

async function mountView() {
  const Empty = defineComponent({ render: () => null })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'goodreads', component: Empty },
      { path: '/read/:bookId/:fileId', name: 'reader', component: Empty },
      { path: '/book/:bookId', name: 'book-detail', component: Empty },
      { path: '/authors', name: 'authors', component: Empty },
      { path: '/authors/:authorId', name: 'author-detail', component: Empty },
      { path: '/series/:seriesId', name: 'series-detail', component: Empty },
      { path: '/requests/:id', name: 'book-request-detail', component: Empty },
    ],
  })
  await router.push('/')
  const wrapper = mount(GoodreadsView, {
    global: { plugins: [router], stubs: { GoodreadsBookDialogs: DialogsStub, GoodreadsBookSheet: true } },
  })
  await flushPromises()
  return wrapper
}

describe('GoodreadsView', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(fetchGoodreadsOverview).mockResolvedValue(overview)
    vi.mocked(fetchGoodreadsShelf).mockResolvedValue({
      total: 3,
      items: [row('acowar', [2444, 2611]), row('wanted', []), row('gone', [999])],
      cards: [card(2444, [file(1, 'm4b')]), card(2611, [file(2, 'epub')])],
    })
  })

  it('renders the toolbar, owned cards, remote cards and the unavailable fallback', async () => {
    const wrapper = await mountView()

    for (const id of ['goodreads-sources', 'goodreads-tab-read', 'goodreads-sort', 'goodreads-view-grid', 'goodreads-bulk-toolbar']) {
      expect(wrapper.find(`[data-testid="${id}"]`).exists()).toBe(true)
    }
    expect(wrapper.findAll('[data-testid="goodreads-card"]')).toHaveLength(3)
    expect(wrapper.findAll('[data-testid="goodreads-owned"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-testid="goodreads-unavailable"]')).toHaveLength(1)
    expect(wrapper.find('[data-testid="goodreads-grid"]').attributes('style')).toContain('minmax(min(100%,')
  })

  it('puts a selected owned row into the library selection', async () => {
    const wrapper = await mountView()
    await wrapper.find('[data-testid="goodreads-owned"] [data-testid="goodreads-row-select"]').trigger('change')

    const dialogs = wrapper.find('[data-testid="dialogs-stub"]')
    expect(dialogs.attributes('data-selected')).toBe('1')
    expect(dialogs.attributes('data-mode')).toBe('true')
  })

  it('shows every row in the list view', async () => {
    const wrapper = await mountView()
    await wrapper.find('[data-testid="goodreads-view-list"]').trigger('click')

    expect(wrapper.findAll('[data-testid="goodreads-row"]')).toHaveLength(3)
    expect(wrapper.findAll('[data-testid="goodreads-owned"]')).toHaveLength(1)
  })
})
