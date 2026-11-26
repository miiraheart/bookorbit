import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { Permission, type BookCard, type BookFileRef } from '@bookorbit/types'
import { i18n } from '@/i18n'
import * as pairsApi from '@/features/read-along-pairs/api/read-along-pairs.api'
import { candidates, pair } from '@/features/read-along-pairs/__tests__/fixtures'
import GoodreadsReadAlongAction from '../GoodreadsReadAlongAction.vue'
import { installGoodreadsMessages } from '../../i18n'

const granted = vi.hoisted(() => new Set<string>())

vi.mock('@/features/auth/composables/usePermissions', async () => {
  const { computed } = await import('vue')
  return { usePermissions: () => ({ hasPermission: (name: string) => granted.has(name), isDemoRestrictedAccount: computed(() => false) }) }
})
vi.mock('@/features/read-along-pairs/api/read-along-pairs.api', () => ({
  fetchCandidates: vi.fn<typeof pairsApi.fetchCandidates>(),
}))

const PairEbookSheetStub = defineComponent({
  name: 'PairEbookSheet',
  props: ['open', 'bookId', 'title', 'preselect'],
  template: '<div data-testid="pair-sheet-stub" :data-open="String(open)" />',
})

installGoodreadsMessages()
const t = i18n.global.t
const api = vi.mocked(pairsApi)
const Empty = defineComponent({ render: () => null })

function file(id: number, format: string): BookFileRef {
  return { id, format, role: 'primary', sizeBytes: 1000 }
}

function card(id: number, files: BookFileRef[]): BookCard {
  return { id, libraryId: 1, status: 'present', title: 'A Court of Wings and Ruin', authors: ['Sarah J. Maas'], files } as unknown as BookCard
}

async function mountAction() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Empty },
      { path: '/book/:bookId', name: 'book-detail', component: Empty },
    ],
  })
  await router.push('/')
  const wrapper = mount(GoodreadsReadAlongAction, {
    props: { cards: [card(2444, [file(501, 'm4b')]), card(2611, [file(601, 'epub')])] },
    global: { plugins: [router], stubs: { PairEbookSheet: PairEbookSheetStub } },
  })
  await flushPromises()
  return wrapper
}

describe('GoodreadsReadAlongAction', () => {
  beforeEach(() => {
    granted.clear()
    granted.add(Permission.LibraryGenerateReadAloud)
    api.fetchCandidates.mockReset()
  })

  it('offers Pair ebook for unpaired copies and opens the sheet on the audio copy with the ebook copy preselected', async () => {
    api.fetchCandidates.mockResolvedValue(candidates())
    const wrapper = await mountAction()

    expect(api.fetchCandidates).toHaveBeenCalledWith(2444)
    expect(wrapper.get('[data-testid="goodreads-pair-ebook"]').text()).toContain(t('goodreads.pairEbook'))
    expect(wrapper.find('[data-testid="goodreads-read-along-note"]').exists()).toBe(false)

    await wrapper.get('[data-testid="goodreads-pair-ebook"]').trigger('click')
    const sheet = wrapper.getComponent(PairEbookSheetStub)
    expect(sheet.props('open')).toBe(true)
    expect(sheet.props('bookId')).toBe(2444)
    expect(sheet.props('preselect')).toEqual({ ebookBookId: 2611, ebookFileId: 601 })
  })

  it('routes a pair without a read-along to the audiobook Files tab to create one', async () => {
    api.fetchCandidates.mockResolvedValue(candidates({ pair: pair({ audiobookBookId: 2444, ebookBookId: 2611, ebookFileId: 601 }) }))
    const wrapper = await mountAction()

    const link = wrapper.get('[data-testid="goodreads-create-read-along"]')
    expect(link.text()).toContain(t('goodreads.createReadAlong'))
    expect(link.attributes('href')).toBe('/book/2444?tab=files&readAloud=create')
    expect(wrapper.find('[data-testid="goodreads-pair-ebook"]').exists()).toBe(false)
  })

  it('keeps the note without the permission and asks nothing of the server', async () => {
    granted.clear()
    const wrapper = await mountAction()

    expect(wrapper.get('[data-testid="goodreads-read-along-note"]').text()).toBe(t('goodreads.readAlongNote'))
    expect(api.fetchCandidates).not.toHaveBeenCalled()
  })

  it('falls back to the note when the pair cannot be read', async () => {
    api.fetchCandidates.mockRejectedValue(new Error('offline'))
    const wrapper = await mountAction()

    expect(wrapper.find('[data-testid="goodreads-read-along-note"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="goodreads-pair-ebook"]').exists()).toBe(false)
  })
})
