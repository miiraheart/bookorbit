import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { ref } from 'vue'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { activateI18nLocale } from '@/i18n'

import * as pairsApi from '../../api/read-along-pairs.api'
import PairedAudiobookMenu from '../PairedAudiobookMenu.vue'

const allowed = ref(true)
vi.mock('@/features/auth/composables/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => allowed.value, isDemoRestrictedAccount: ref(false) }),
}))
vi.mock('../../api/read-along-pairs.api', () => ({ fetchPairedAudiobooks: vi.fn<typeof pairsApi.fetchPairedAudiobooks>() }))

const api = vi.mocked(pairsApi)

function mountMenu() {
  return mount(PairedAudiobookMenu, { props: { bookId: 2614 }, global: { stubs: { RouterLink: RouterLinkStub } } })
}

beforeAll(() => {
  activateI18nLocale('en')
})

beforeEach(() => {
  allowed.value = true
  api.fetchPairedAudiobooks.mockReset()
})

describe('PairedAudiobookMenu', () => {
  it('offers the paired audiobook and its read-along', async () => {
    api.fetchPairedAudiobooks.mockResolvedValue({ audiobooks: [{ bookId: 2238, title: 'Circe (Unabridged)', readAlongFileId: 9001 }] })
    const wrapper = mountMenu()
    await flushPromises()
    expect(api.fetchPairedAudiobooks).toHaveBeenCalledWith(2614)
    const [open, readAlong] = wrapper.findAllComponents(RouterLinkStub)
    expect(open!.props('to')).toEqual({ name: 'book-detail', params: { bookId: 2238 } })
    expect(open!.text()).toContain('Circe (Unabridged)')
    expect(readAlong!.props('to')).toEqual({ name: 'reader', params: { bookId: 2238, fileId: 9001 }, query: { format: 'epub' } })
    await wrapper.get('[data-testid="paired-audiobook-open"]').trigger('click')
    expect(wrapper.emitted('navigate')).toHaveLength(1)
  })

  it('shows only the audiobook when no read-along exists yet', async () => {
    api.fetchPairedAudiobooks.mockResolvedValue({ audiobooks: [{ bookId: 2238, title: 'Circe', readAlongFileId: null }] })
    const wrapper = mountMenu()
    await flushPromises()
    expect(wrapper.find('[data-testid="paired-audiobook-open"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="paired-audiobook-read-along"]').exists()).toBe(false)
  })

  it('renders nothing without a pair, on a failed lookup, or without the permission', async () => {
    api.fetchPairedAudiobooks.mockResolvedValue({ audiobooks: [] })
    const empty = mountMenu()
    await flushPromises()
    expect(empty.html()).not.toContain('paired-audiobook')

    api.fetchPairedAudiobooks.mockRejectedValue(new Error('nope'))
    const failed = mountMenu()
    await flushPromises()
    expect(failed.html()).not.toContain('paired-audiobook')

    allowed.value = false
    api.fetchPairedAudiobooks.mockClear()
    mountMenu()
    await flushPromises()
    expect(api.fetchPairedAudiobooks).not.toHaveBeenCalled()
  })
})
