import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { clearReleaseSearchCache } from '@/features/book-requests/composables/useReleasePicker'
import { i18n } from '@/i18n'
import { installGoodreadsMessages } from '../../i18n'
import { ADMIN, apiRouter, baseHandlers, json, submitted, mountPanel, pickTitle, row, type ApiFn } from './readAlongPanelFixtures'

vi.mock('@/lib/api', () => ({ api: vi.fn<ApiFn>() }))
vi.mock('@/features/auth/composables/usePermissions', async () => {
  const { computed } = await import('vue')
  return { usePermissions: () => ({ hasPermission: () => true, isDemoRestrictedAccount: computed(() => false) }) }
})
vi.mock('@/features/book-requests/composables/useRequestDestinationDefault', () => ({
  useRequestLanguageDefault: () => ({ load: vi.fn<() => Promise<boolean>>().mockResolvedValue(true), resolveLanguage: () => 'en' }),
}))
vi.mock('vue-sonner', () => ({ toast: { success: vi.fn<(message: string) => void>(), error: vi.fn<(message: string) => void>() } }))

import { api } from '@/lib/api'

installGoodreadsMessages()
const t = i18n.global.t
const { route, calls } = apiRouter(vi.mocked(api))

describe('ReadAlongPairPanel resume', () => {
  beforeEach(() => {
    vi.mocked(api).mockReset()
    clearReleaseSearchCache()
  })

  it('reopens the picks of waiting requests without filing anything, and offers no cancel', async () => {
    route(baseHandlers())
    const waiting = {
      ebook: { id: 41, status: 'approved' as const, selfServe: true },
      audiobook: { id: 42, status: 'approved' as const, selfServe: true },
    }
    const wrapper = await mountPanel(row({ requests: waiting }))

    expect(calls('POST /api/v1/book-requests/pairs')).toHaveLength(0)
    expect(pickTitle(wrapper, 'audiobook')).toBe('Verity a1')
    expect(pickTitle(wrapper, 'ebook')).toBe('Verity e1')
    expect(wrapper.find('[data-testid="read-along-cancel"]').exists()).toBe(false)
  })

  it('resumes after a partial failure: the half already downloading is shown, only the other is searched', async () => {
    route(baseHandlers())
    const requests = {
      ebook: { id: 41, status: 'approved' as const, selfServe: true },
      audiobook: { id: 42, status: 'downloading' as const, selfServe: true },
    }
    const wrapper = await mountPanel(row({ requests }))

    expect(calls(`GET ${ADMIN}/42/releases`)).toHaveLength(0)
    expect(wrapper.find('[data-testid="read-along-half-status"]').text()).toContain(t('bookRequests.status.downloading'))
    expect(pickTitle(wrapper, 'ebook')).toBe('Verity e1')
    expect(wrapper.find('[data-testid="read-along-send"]').text()).toContain(t('goodreads.readAlongPair.send', { count: 1 }))
  })

  it('closed while the requests are being filed, it searches nothing and still reports the change', async () => {
    const handlers = baseHandlers()
    let answer: (response: Response) => void = () => {}
    handlers['POST /api/v1/book-requests/pairs'] = () =>
      new Promise<Response>((resolve) => {
        answer = resolve
      })
    route(handlers)
    const wrapper = await mountPanel()

    await wrapper.find('[data-testid="read-along-close"]').trigger('click')
    expect(wrapper.emitted('changed')).toBeUndefined()
    await wrapper.setProps({ open: false })
    answer(json({ ebook: submitted(41), audiobook: submitted(42) }, 201))
    await flushPromises()

    expect(calls(`GET ${ADMIN}/41/releases`)).toHaveLength(0)
    expect(calls(`GET ${ADMIN}/42/releases`)).toHaveLength(0)
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })
})
