import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { clearReleaseSearchCache } from '@/features/book-requests/composables/useReleasePicker'
import { i18n } from '@/i18n'
import { installGoodreadsMessages } from '../../i18n'
import {
  ADMIN,
  apiRouter,
  baseHandlers,
  ebooks,
  json,
  release,
  search,
  submitted,
  mountPanel,
  pickTitle,
  row,
  type ApiFn,
} from './readAlongPanelFixtures'

vi.mock('@/lib/api', () => ({ api: vi.fn<ApiFn>() }))
vi.mock('@/features/auth/composables/usePermissions', async () => {
  const { computed } = await import('vue')
  return { usePermissions: () => ({ hasPermission: () => true, isDemoRestrictedAccount: computed(() => false) }) }
})
vi.mock('@/features/book-requests/composables/useRequestDestinationDefault', () => ({
  useRequestLanguageDefault: () => ({ load: vi.fn<() => Promise<boolean>>().mockResolvedValue(true), resolveLanguage: () => 'en' }),
}))
vi.mock('vue-sonner', () => ({ toast: { success: vi.fn<(message: string) => void>(), error: vi.fn<(message: string) => void>() } }))

import { toast } from 'vue-sonner'
import { api } from '@/lib/api'

installGoodreadsMessages()
const t = i18n.global.t
const { route, calls } = apiRouter(vi.mocked(api))

describe('ReadAlongPairPanel', () => {
  beforeEach(() => {
    vi.mocked(api).mockReset()
    clearReleaseSearchCache()
  })

  it('creates both self-serve requests, says nothing downloads yet, and shows the best pick of each half', async () => {
    route(baseHandlers())
    const wrapper = await mountPanel()

    const body = JSON.parse(String(calls('POST /api/v1/book-requests/pairs')[0]![1]!.body))
    expect(body).toMatchObject({ selfServe: true, title: 'Verity', providerKey: 'goodreads', providerId: '27362503', language: 'en' })
    expect(wrapper.find('[data-testid="read-along-notice"]').text()).toContain('2 requests were created')
    expect(wrapper.find('[data-testid="read-along-notice"]').text()).toContain('6 hours')
    expect(pickTitle(wrapper, 'audiobook')).toBe('Verity a1')
    expect(pickTitle(wrapper, 'ebook')).toBe('Verity e1')
    expect(wrapper.find('[data-testid="read-along-half-ebook"]').text()).toContain('40 seeders')
    expect(calls(`POST ${ADMIN}/41/grab`)).toHaveLength(0)
  })

  it('swaps a half to another ranked release and sends that one', async () => {
    route(baseHandlers())
    const wrapper = await mountPanel()

    await wrapper.find('[data-testid="read-along-half-ebook"] [data-testid="read-along-swap"]').trigger('click')
    const options = wrapper.findAll('[data-testid="read-along-half-ebook"] [data-testid="read-along-option"]')
    expect(options[1]!.text()).toContain('900 downloads')
    await options[1]!.trigger('click')
    expect(pickTitle(wrapper, 'ebook')).toBe('Verity e2')

    await wrapper.find('[data-testid="read-along-send"]').trigger('click')
    await flushPromises()
    expect(JSON.parse(String(calls(`POST ${ADMIN}/41/grab`)[0]![1]!.body))).toEqual({ indexerId: 1, releaseGuid: 'e2' })
  })

  it('sends both halves on one press and closes', async () => {
    route(baseHandlers())
    const wrapper = await mountPanel()

    expect(wrapper.find('[data-testid="read-along-send"]').text()).toContain(t('goodreads.readAlongPair.send', { count: 2 }))
    await wrapper.find('[data-testid="read-along-send"]').trigger('click')
    await flushPromises()

    expect(JSON.parse(String(calls(`POST ${ADMIN}/42/grab`)[0]![1]!.body))).toEqual({ indexerId: 1, releaseGuid: 'a1' })
    expect(JSON.parse(String(calls(`POST ${ADMIN}/41/grab`)[0]![1]!.body))).toEqual({ indexerId: 1, releaseGuid: 'e1' })
    expect(wrapper.emitted('update:open')).toEqual([[false]])
    expect(wrapper.emitted('changed')).toHaveLength(1)
    expect(vi.mocked(toast.success)).toHaveBeenLastCalledWith('Both downloads started')
  })

  it('keeps the panel open on a partial failure and retries only the failed half', async () => {
    const handlers = baseHandlers()
    let ebookAttempts = 0
    handlers[`POST ${ADMIN}/41/grab`] = () => (++ebookAttempts === 1 ? json({ message: 'Client offline' }, 502) : json({ id: 41 }))
    route(handlers)
    const wrapper = await mountPanel()

    await wrapper.find('[data-testid="read-along-send"]').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('update:open')).toBeUndefined()
    expect(wrapper.find('[data-testid="read-along-half-audiobook"] [data-testid="read-along-half-sent"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="read-along-half-ebook"] [data-testid="read-along-half-failed"]').text()).toContain('Client offline')

    await wrapper.find('[data-testid="read-along-retry"]').trigger('click')
    await flushPromises()
    expect(calls(`POST ${ADMIN}/42/grab`)).toHaveLength(1)
    expect(calls(`POST ${ADMIN}/41/grab`)).toHaveLength(2)
    expect(wrapper.emitted('update:open')).toEqual([[false]])
  })

  it('cancels only the request this press created, never the one it joined', async () => {
    const handlers = baseHandlers()
    handlers['POST /api/v1/book-requests/pairs'] = () => json({ ebook: submitted(17, true), audiobook: submitted(42) }, 201)
    handlers[`GET ${ADMIN}/17/releases`] = () => search(ebooks)
    route(handlers)
    const wrapper = await mountPanel(row({ requests: { ebook: { id: 17, status: 'approved' } } }))

    expect(wrapper.find('[data-testid="read-along-notice"]').text()).toContain('One request was created')
    await wrapper.find('[data-testid="read-along-cancel"]').trigger('click')
    await flushPromises()

    expect(JSON.parse(String(calls('POST /api/v1/book-requests/cancel')[0]![1]!.body))).toEqual({ ids: [42] })
    expect(wrapper.emitted('update:open')).toEqual([[false]])
  })

  it('keeps the new requests when closed, and nothing is sent', async () => {
    route(baseHandlers())
    const wrapper = await mountPanel()

    await wrapper.find('[data-testid="read-along-close"]').trigger('click')
    expect(calls('POST /api/v1/book-requests/cancel')).toHaveLength(0)
    expect(calls(`POST ${ADMIN}/41/grab`)).toHaveLength(0)
    expect(wrapper.emitted('update:open')).toEqual([[false]])
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })

  it('does not cancel a half that was already sent', async () => {
    const handlers = baseHandlers()
    handlers[`POST ${ADMIN}/41/grab`] = () => json({ message: 'Client offline' }, 502)
    route(handlers)
    const wrapper = await mountPanel()

    await wrapper.find('[data-testid="read-along-send"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="read-along-cancel"]').trigger('click')
    await flushPromises()
    expect(JSON.parse(String(calls('POST /api/v1/book-requests/cancel')[0]![1]!.body))).toEqual({ ids: [41] })
  })

  it('says why a half has no pick and does not offer to send', async () => {
    const handlers = baseHandlers()
    handlers[`GET ${ADMIN}/42/releases`] = () => search([release('a3', { title: 'Verity (Abridged)' })])
    route(handlers)
    const wrapper = await mountPanel()

    expect(wrapper.find('[data-testid="read-along-half-missing"]').text()).toBe(t('goodreads.readAlongPair.missing.audiobook.flagged'))
    expect(wrapper.find('[data-testid="read-along-send"]').attributes('disabled')).toBeDefined()
  })
})
