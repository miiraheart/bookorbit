import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { AudiobookBookmark, BookCard, BookFileRef } from '@bookorbit/types'
import type { Bookmark } from '@/features/reader/epub/composables/useBookmarks'
import { i18n } from '@/i18n'
import GoodreadsBookmarks from '../GoodreadsBookmarks.vue'
import { installGoodreadsMessages } from '../../i18n'

vi.mock('../../api/bookmarks.api', () => ({
  fetchEbookBookmarks: vi.fn<(bookId: number) => Promise<Bookmark[]>>(),
  fetchAudioBookmarks: vi.fn<(bookId: number) => Promise<AudiobookBookmark[]>>(),
}))

import { fetchAudioBookmarks, fetchEbookBookmarks } from '../../api/bookmarks.api'

const mockEbook = vi.mocked(fetchEbookBookmarks)
const mockAudio = vi.mocked(fetchAudioBookmarks)

installGoodreadsMessages()
const t = i18n.global.t
const Empty = defineComponent({ render: () => null })

function file(id: number, format: string): BookFileRef {
  return { id, format, role: 'primary', sizeBytes: 1000 }
}

function card(id: number, files: BookFileRef[]): BookCard {
  return { id, libraryId: 1, status: 'present', title: 'A Court of Wings and Ruin', authors: [], files } as unknown as BookCard
}

const ebookMark: Bookmark = {
  id: 7,
  bookId: 2611,
  cfi: 'epubcfi(/6/4!/4/2/1:0)',
  title: 'Chapter 1',
  note: 'Rhysand',
  createdAt: '2026-11-01T00:00:00.000Z',
}
const audioMark: AudiobookBookmark = {
  id: 'a1',
  bookId: 2444,
  positionMs: 61000,
  chapterId: null,
  title: 'The vote',
  note: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
}

async function mountMarks(book: BookCard) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'goodreads', component: Empty },
      { path: '/read/:bookId/:fileId', name: 'reader', component: Empty },
    ],
  })
  const wrapper = mount(GoodreadsBookmarks, { props: { card: book }, global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('GoodreadsBookmarks', () => {
  beforeEach(() => {
    mockEbook.mockReset()
    mockAudio.mockReset()
  })

  it('opens an EPUB bookmark in the reader at its cfi', async () => {
    mockEbook.mockResolvedValue([ebookMark])
    const wrapper = await mountMarks(card(2611, [file(601, 'epub')]))

    const link = wrapper.get('[data-testid="goodreads-bookmark-ebook"]')
    const href = new URL(link.attributes('href')!, 'http://localhost')
    expect(href.pathname).toBe('/read/2611/601')
    expect(Object.fromEntries(href.searchParams)).toEqual({ format: 'epub', cfi: ebookMark.cfi })
    expect(link.text()).toContain('Chapter 1')
    expect(link.text()).toContain('Rhysand')
    expect(mockAudio).not.toHaveBeenCalled()
  })

  it('opens an audio bookmark at its place on the whole book, and never asks for EPUB bookmarks', async () => {
    mockAudio.mockResolvedValue([audioMark])
    const wrapper = await mountMarks(card(2444, [file(501, 'm4b')]))

    const link = wrapper.get('[data-testid="goodreads-bookmark-audio"]')
    expect(link.attributes('href')).toBe('/read/2444/501?format=m4b&at=61000')
    expect(link.text()).toContain('1:01')
    expect(mockEbook).not.toHaveBeenCalled()
  })

  it('keeps the list that loaded when the other request fails', async () => {
    mockEbook.mockRejectedValue(new Error('down'))
    mockAudio.mockResolvedValue([audioMark])
    const wrapper = await mountMarks(card(2299, [file(801, 'epub'), file(802, 'm4b')]))

    expect(wrapper.findAll('[data-testid="goodreads-bookmark-audio"]')).toHaveLength(1)
    expect(wrapper.text()).toContain(t('goodreads.bookmarksFailed'))
    expect(wrapper.find('[data-testid="goodreads-bookmarks-empty"]').exists()).toBe(false)
  })

  it('says so when the copy has no bookmarks', async () => {
    mockEbook.mockResolvedValue([])
    const wrapper = await mountMarks(card(2611, [file(601, 'epub')]))

    expect(wrapper.get('[data-testid="goodreads-bookmarks-empty"]').text()).toBe(t('goodreads.bookmarksEmpty'))
  })
})
