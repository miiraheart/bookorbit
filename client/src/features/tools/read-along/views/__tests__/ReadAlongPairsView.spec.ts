import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { Permission, type ReadAlongListResponse } from '@bookorbit/types'
import * as pairsApi from '@/features/read-along-pairs/api/read-along-pairs.api'
import { pair, row } from '@/features/read-along-pairs/__tests__/fixtures'
import ReadAlongPairsView from '../ReadAlongPairsView.vue'

const granted = vi.hoisted(() => new Set<string>())

vi.mock('@/features/auth/composables/usePermissions', async () => {
  const { computed } = await import('vue')
  return { usePermissions: () => ({ hasPermission: (name: string) => granted.has(name), isDemoRestrictedAccount: computed(() => false) }) }
})
vi.mock('@/features/library/composables/useLibraries', () => ({
  useLibraries: () => ({ libraries: ref([{ id: 14, name: 'Audiobooks' }]), fetchLibraries: vi.fn<() => Promise<void>>(async () => {}) }),
}))
vi.mock('vue-sonner', () => ({ toast: { success: vi.fn<() => void>(), error: vi.fn<() => void>(), info: vi.fn<() => void>() } }))
vi.mock('@/features/read-along-pairs/api/read-along-pairs.api', () => ({
  listReadAlong: vi.fn<typeof pairsApi.listReadAlong>(),
  pairEbook: vi.fn<typeof pairsApi.pairEbook>(),
  unpairEbook: vi.fn<typeof pairsApi.unpairEbook>(),
  acceptExact: vi.fn<typeof pairsApi.acceptExact>(),
  deleteReadAlongFile: vi.fn<typeof pairsApi.deleteReadAlongFile>(),
}))

const api = vi.mocked(pairsApi)
const Empty = defineComponent({ render: () => null })
const SheetStub = defineComponent({ name: 'PairEbookSheet', props: ['open', 'bookId', 'title'], template: '<div />' })
const LauncherStub = defineComponent({ name: 'ReadAlongCreateLauncher', props: ['bookId', 'defaultLanguage'], template: '<div />' })

function listOf(items = [row()]): ReadAlongListResponse {
  return {
    items,
    total: items.length,
    summary: { paired: 0, needs_attention: 0, suggested: items.length, ambiguous: 0, flagged: 0, none: 0, readAlongReady: 0 },
  }
}

async function mountView(path = '/tools/read-along') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/tools/read-along', name: 'tools-read-along', component: Empty },
      { path: '/read/:bookId/:fileId', name: 'reader', component: Empty },
      { path: '/book/:bookId', name: 'book-detail', component: Empty },
    ],
  })
  await router.push(path)
  const wrapper = mount(ReadAlongPairsView, {
    global: { plugins: [router], stubs: { PairEbookSheet: SheetStub, ReadAlongCreateLauncher: LauncherStub, ConfirmDialog: true } },
  })
  await flushPromises()
  return { wrapper, router }
}

describe('ReadAlongPairsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    granted.clear()
    granted.add(Permission.LibraryGenerateReadAloud)
    api.listReadAlong.mockResolvedValue(listOf())
    api.pairEbook.mockResolvedValue({ pair: pair(), readAlongStale: false })
  })

  it('lists audiobooks with the summary and filters by status', async () => {
    const { wrapper } = await mountView()

    expect(api.listReadAlong).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 50 }))
    expect(wrapper.get('[data-testid="read-along-rows"]').text()).toContain('Circe (Unabridged)')

    await wrapper.get('[data-testid="read-along-filter-suggested"]').trigger('click')
    await flushPromises()
    expect(api.listReadAlong).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'suggested', page: 1 }))
  })

  it('pairs the best candidate in one click and reloads the list', async () => {
    const { wrapper } = await mountView()

    await wrapper.get('[data-testid="read-along-pair"]').trigger('click')
    await flushPromises()
    expect(api.pairEbook).toHaveBeenCalledWith(2238, { ebookBookId: 2614, ebookFileId: 11728 })
    expect(api.listReadAlong).toHaveBeenCalledTimes(2)
  })

  it('unpairs and then offers to delete the read-along made from that ebook', async () => {
    api.listReadAlong.mockResolvedValue(listOf([row({ status: 'paired', pair: pair(), readAlong: { fileId: 9001, stale: false } })]))
    api.unpairEbook.mockResolvedValue({ removed: pair(), readAlongs: [{ fileId: 9001, filename: 'Circe.readaloud.epub' }], canDeleteReadAlong: true })
    const { wrapper } = await mountView()

    await wrapper.get('[data-testid="read-along-unpair"]').trigger('click')
    await flushPromises()
    expect(api.unpairEbook).toHaveBeenCalledWith(2238)
    expect(wrapper.get('[data-testid="unpair-offer"]').text()).toContain('Circe.readaloud.epub')
    expect(api.deleteReadAlongFile).not.toHaveBeenCalled()
  })

  it('opens the pair sheet for ?book= and the create dialog for a row', async () => {
    const { wrapper, router } = await mountView('/tools/read-along?book=2238')

    const sheet = wrapper.getComponent(SheetStub)
    expect(sheet.props('open')).toBe(true)
    expect(sheet.props('bookId')).toBe(2238)
    expect(router.currentRoute.value.query.book).toBeUndefined()

    await wrapper.get('[data-testid="read-along-create"]').trigger('click')
    expect(wrapper.getComponent(LauncherStub).props('bookId')).toBe(2238)
  })

  it('shows nothing but a notice without the permission', async () => {
    granted.clear()
    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="read-along-rows"]').exists()).toBe(false)
    expect(api.listReadAlong).not.toHaveBeenCalled()
  })
})
