import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import type { BookCard, BookFileRef, GoodreadsShelfRow } from '@bookorbit/types'
import { useDisplaySettings } from '@/composables/useDisplaySettings'
import { i18n } from '@/i18n'
import BookCoverCard from '@/features/book/components/BookCoverCard.vue'
import BookListRow from '@/features/book/components/BookListRow.vue'
import GoodreadsOwnedItem from '../GoodreadsOwnedItem.vue'
import { installGoodreadsMessages } from '../../i18n'

vi.mock('@/features/auth/composables/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true, isSuperuser: ref(true), isDemoRestrictedAccount: ref(false) }),
}))
vi.mock('@/features/library/composables/useLibraries', () => ({
  useLibraries: () => ({ libraries: ref([{ id: 1, accessLevel: 'owner' }]) }),
}))

installGoodreadsMessages()
const t = i18n.global.t

const Empty = defineComponent({ render: () => null })

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'goodreads', component: Empty },
      { path: '/read/:bookId/:fileId', name: 'reader', component: Empty },
      { path: '/book/:bookId', name: 'book-detail', component: Empty },
      { path: '/authors', name: 'authors', component: Empty },
      { path: '/authors/:authorId', name: 'author-detail', component: Empty },
      { path: '/series/:seriesId', name: 'series-detail', component: Empty },
    ],
  })
}

let nextFileId = 100

function file(format: string): BookFileRef {
  return { id: nextFileId++, format, role: 'primary', sizeBytes: 1000 }
}

function card(id: number, files: BookFileRef[], coverAspectRatio: BookCard['coverAspectRatio'] = '2/3'): BookCard {
  return {
    id,
    libraryId: 1,
    status: 'present',
    coverAspectRatio,
    title: 'A Court of Wings and Ruin',
    authors: ['Sarah J. Maas'],
    seriesId: null,
    seriesName: null,
    seriesIndex: null,
    files,
    publishedDate: null,
    publishedYear: 2017,
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
    customMetadata: [],
    tags: [],
  }
}

function row(bookIds: number[], overrides: Partial<GoodreadsShelfRow> = {}): GoodreadsShelfRow {
  return {
    key: 'acowar',
    goodreadsId: '23766634',
    title: 'A Court of Wings and Ruin',
    authors: ['Sarah J. Maas'],
    rating: 4,
    isbn13: null,
    coverUrl: null,
    readAt: null,
    shelves: ['read'],
    bookIds,
    source: 'me',
    firstSeenAt: '2026-11-25T00:00:00.000Z',
    isNew: true,
    request: null,
    requests: {},
    ...overrides,
  }
}

const passThrough = { template: '<div><slot /></div>' }

function mountItem(props: { cards: BookCard[]; variant?: 'grid' | 'list'; shownId?: number | null }, router = makeRouter()) {
  const wrapper = mount(GoodreadsOwnedItem, {
    props: { row: row(props.cards.map((entry) => entry.id)), variant: props.variant ?? 'grid', ...props },
    global: {
      plugins: [router],
      stubs: {
        DropdownMenu: passThrough,
        DropdownMenuTrigger: passThrough,
        DropdownMenuContent: { template: '<div data-testid="kebab-content"><slot /></div>' },
        DropdownMenuItem: { template: '<div role="menuitem" @click="$emit(\'click\')"><slot /></div>', emits: ['click'] },
        DropdownMenuSub: passThrough,
        DropdownMenuSubTrigger: passThrough,
        DropdownMenuSubContent: passThrough,
        DropdownMenuSeparator: true,
      },
    },
  })
  return { wrapper, router }
}

const audiobook = () => card(2444, [file('m4b')], '1/1')
const ebook = () => card(2611, [file('epub')])

describe('GoodreadsOwnedItem', () => {
  beforeEach(() => {
    nextFileId = 100
  })

  it('renders the real library card on the ebook copy, with quick view and the kebab', () => {
    const { wrapper } = mountItem({ cards: [audiobook(), ebook()] })
    const coverCard = wrapper.findComponent(BookCoverCard)

    expect(coverCard.exists()).toBe(true)
    expect(coverCard.props('book').id).toBe(2611)
    expect(coverCard.props('coverAspectRatio')).toBe('2/3')
    expect(wrapper.find(`button[aria-label="${t('book.actions.quickView')}"]`).exists()).toBe(true)
    expect(wrapper.find(`button[aria-label="${t('book.card.moreActions', { title: 'A Court of Wings and Ruin' })}"]`).exists()).toBe(true)
    const kebab = wrapper.find('[data-testid="kebab-content"]').text()
    for (const key of ['book.actions.read', 'book.actions.addToCollection', 'book.move.action', 'book.actions.setStatus', 'common.delete']) {
      expect(kebab).toContain(t(key))
    }
    expect(wrapper.find('[data-testid="goodreads-new-badge"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="goodreads-rating"]').attributes('aria-label')).toBe(t('goodreads.rating', { rating: 4 }))
  })

  it('opens the EPUB reader from the card centre button', async () => {
    useDisplaySettings().thumbnailClickAction.value = 'reader'
    const { wrapper, router } = mountItem({ cards: [audiobook(), ebook()] })
    await wrapper.find('[data-testid="grid-card-primary-action"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('reader')
    expect(router.currentRoute.value.params.bookId).toBe('2611')
    expect(router.currentRoute.value.query.format).toBe('epub')
  })

  it('passes the shown copy with the quick view action', async () => {
    const { wrapper } = mountItem({ cards: [audiobook(), ebook()] })
    await wrapper.find(`button[aria-label="${t('book.actions.quickView')}"]`).trigger('click')

    const [book, action] = wrapper.emitted('action')![0] as [BookCard, string]
    expect(book.id).toBe(2611)
    expect(action).toBe('quick-view')
  })

  it('switches the card to the audiobook copy from its chip', async () => {
    const { wrapper } = mountItem({ cards: [audiobook(), ebook()] })
    await wrapper.find('[data-testid="goodreads-copy-audio"]').trigger('click')

    expect(wrapper.findComponent(BookCoverCard).props('book').id).toBe(2444)
    expect(wrapper.findComponent(BookCoverCard).props('coverAspectRatio')).toBe('2/3')
    expect(wrapper.emitted('update:shownId')).toEqual([[2444]])
    expect(wrapper.find('[data-testid="goodreads-copy-audio"]').attributes('aria-pressed')).toBe('true')
  })

  it('follows the copy the page says is shown', () => {
    const { wrapper } = mountItem({ cards: [audiobook(), ebook()], shownId: 2444 })
    expect(wrapper.findComponent(BookCoverCard).props('book').id).toBe(2444)
  })

  it('has no switcher for a single copy', () => {
    const { wrapper } = mountItem({ cards: [ebook()] })
    expect(wrapper.find('[data-testid="goodreads-copy-switcher"]').exists()).toBe(false)
  })

  it.each(['grid', 'list'] as const)('opens the copies sheet from its own button in the %s variant, not the quick view', async (variant) => {
    const { wrapper } = mountItem({ cards: [audiobook(), ebook()], variant })
    await wrapper.find('[data-testid="goodreads-owned-copies"]').trigger('click')

    expect(wrapper.emitted('copies')).toEqual([[]])
    expect(wrapper.emitted('action')).toBeUndefined()
  })

  it('renders the real library list row in the list variant', () => {
    const { wrapper } = mountItem({ cards: [audiobook(), ebook()], variant: 'list' })
    const listRow = wrapper.findComponent(BookListRow)

    expect(listRow.exists()).toBe(true)
    expect(listRow.props('book').id).toBe(2611)
    expect(wrapper.findComponent(BookCoverCard).exists()).toBe(false)
  })
})
