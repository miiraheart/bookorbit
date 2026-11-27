import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { clearReleaseSearchCache } from '@/features/book-requests/composables/useReleasePicker'
import { i18n } from '@/i18n'
import { installGoodreadsMessages } from '../../i18n'
import {
  ADMIN,
  apiRouter,
  audio,
  baseHandlers,
  ebooks,
  json,
  mountPanel,
  release,
  row,
  search,
  submitted,
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

import { api } from '@/lib/api'

installGoodreadsMessages()
const t = i18n.global.t
const { route, calls } = apiRouter(vi.mocked(api))
const PAIRS = 'POST /api/v1/book-requests/pairs'

function deferred() {
  let resolve: (response: Response) => void = () => undefined
  const promise = new Promise<Response>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

type Panel = Awaited<ReturnType<typeof mountPanel>>

async function closeAndReopen(wrapper: Panel, next = {}) {
  await wrapper.find('[data-testid="read-along-close"]').trigger('click')
  await wrapper.setProps({ open: false })
  await wrapper.setProps({ ...next, open: true })
  await flushPromises()
}

describe('ReadAlongPairPanel, a press closed before its requests came back', () => {
  beforeEach(() => {
    vi.mocked(api).mockReset()
    clearReleaseSearchCache()
  })

  it('waits for the first press on the same book, so its requests stay new and cancellable', async () => {
    const filed = deferred()
    const handlers = baseHandlers()
    handlers[PAIRS] = () => filed.promise
    route(handlers)
    const wrapper = await mountPanel()

    await closeAndReopen(wrapper)
    expect(calls(PAIRS)).toHaveLength(1)
    filed.resolve(json({ ebook: submitted(41), audiobook: submitted(42) }, 201))
    await flushPromises()

    expect(wrapper.find('[data-testid="read-along-notice"]').text()).toContain('2 requests were created')
    expect(wrapper.find('[data-testid="read-along-cancel"]').text()).toBe(t('goodreads.readAlongPair.cancel', { count: 2 }))
    expect(wrapper.emitted('changed')?.length).toBeGreaterThan(0)
  })

  it('keeps the current book when the closed press on another book answers last', async () => {
    const first = deferred()
    const second = deferred()
    const answers = [first, second]
    const handlers = baseHandlers()
    handlers[PAIRS] = () => answers.shift()!.promise
    handlers[`GET ${ADMIN}/52/releases`] = () => search(audio)
    handlers[`GET ${ADMIN}/51/releases`] = () => search(ebooks)
    handlers[`POST ${ADMIN}/51/grab`] = () => json({ id: 51 })
    handlers[`POST ${ADMIN}/52/grab`] = () => json({ id: 52 })
    route(handlers)
    const wrapper = await mountPanel(row({ key: 'a', goodreadsId: 'a', title: 'Book A' }))

    await closeAndReopen(wrapper, { row: row({ key: 'b', goodreadsId: 'b', title: 'Book B' }) })
    second.resolve(json({ ebook: submitted(51), audiobook: submitted(52) }, 201))
    await flushPromises()
    first.resolve(json({ ebook: submitted(41), audiobook: submitted(42) }, 201))
    await flushPromises()

    expect(calls(`GET ${ADMIN}/41/releases`)).toHaveLength(0)
    await wrapper.find('[data-testid="read-along-send"]').trigger('click')
    await flushPromises()
    expect(calls(`POST ${ADMIN}/51/grab`)).toHaveLength(1)
    expect(calls(`POST ${ADMIN}/52/grab`)).toHaveLength(1)
    expect(calls(`POST ${ADMIN}/41/grab`)).toHaveLength(0)
    expect(wrapper.emitted('changed')?.length).toBeGreaterThan(0)
  })
})

describe('ReadAlongPairPanel, after a partial send', () => {
  beforeEach(() => {
    vi.mocked(api).mockReset()
    clearReleaseSearchCache()
  })

  it('says which half started instead of saying nothing is downloading', async () => {
    const handlers = baseHandlers()
    handlers[`POST ${ADMIN}/41/grab`] = () => json({ message: 'Client offline' }, 502)
    route(handlers)
    const wrapper = await mountPanel()

    await wrapper.find('[data-testid="read-along-send"]').trigger('click')
    await flushPromises()

    const notice = wrapper.find('[data-testid="read-along-notice"]').text()
    expect(notice).toBe(t('goodreads.readAlongPair.partSent', { half: t('goodreads.readAlongPair.audiobook') }))
    expect(notice).not.toContain('Nothing is downloading')
  })

  it('tells apart two releases with the same guid on different indexers', async () => {
    const handlers = baseHandlers()
    handlers[`GET ${ADMIN}/42/releases`] = () =>
      search([release('a1', { seeders: 80 }), release('a1', { indexerId: 2, indexerName: 'Other tracker', seeders: 5 })])
    route(handlers)
    const wrapper = await mountPanel()

    await wrapper.find('[data-testid="read-along-half-audiobook"] [data-testid="read-along-swap"]').trigger('click')
    const options = wrapper.findAll('[data-testid="read-along-half-audiobook"] [data-testid="read-along-option"]')
    expect(options.map((option) => option.attributes('aria-pressed'))).toEqual(['true', 'false'])
    await options[1]!.trigger('click')
    await wrapper.find('[data-testid="read-along-send"]').trigger('click')
    await flushPromises()

    expect(JSON.parse(String(calls(`POST ${ADMIN}/42/grab`)[0]![1]!.body))).toEqual({ indexerId: 2, releaseGuid: 'a1' })
  })
})
