import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { GoodreadsShelfRow, ReleaseCandidateItem } from '@bookorbit/types'
import { clearReleaseSearchCache } from '@/features/book-requests/composables/useReleasePicker'
import { i18n } from '@/i18n'
import ReadAlongPairPanel from '../readalong/ReadAlongPairPanel.vue'
import { installGoodreadsMessages } from '../../i18n'

type ApiFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type Handler = (init?: RequestInit) => Response

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
const mockApi = vi.mocked(api)
const ADMIN = '/api/v1/admin/book-requests'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function release(guid: string, overrides: Partial<ReleaseCandidateItem> = {}): ReleaseCandidateItem {
  return {
    indexerId: 1,
    indexerName: 'MyAnonaMouse',
    guid,
    title: `Verity ${guid}`,
    infoUrl: null,
    sizeBytes: 300_000_000,
    seeders: 10,
    leechers: 0,
    grabs: null,
    format: 'm4b',
    formats: ['m4b'],
    language: 'en',
    fileCount: 1,
    freeleech: false,
    vipOnly: false,
    alreadyGrabbed: false,
    publishedAt: null,
    audio: null,
    score: 80,
    tier: null,
    tierName: null,
    profileMismatch: null,
    reasons: [{ code: 'authorMatch', points: 61 }],
    ...overrides,
  }
}

const search = (releases: ReleaseCandidateItem[]) =>
  json({
    releases,
    criteria: { activeIsbn: null },
    indexers: [],
    uncoveredIndexerCount: 0,
    enabledIndexerCount: 2,
    configuredIndexerCount: 2,
    profileActive: false,
    cached: false,
  })

const audio = [release('a1', { seeders: 80 }), release('a2', { seeders: 5 })]
const ebooks = [
  release('e1', { format: 'epub', formats: ['epub'], seeders: 40 }),
  release('e2', { format: 'epub', formats: ['epub'], seeders: null, indexerName: "Anna's Archive", grabs: 900 }),
]

function row(overrides: Partial<GoodreadsShelfRow> = {}): GoodreadsShelfRow {
  return {
    key: '27362503',
    goodreadsId: '27362503',
    title: 'Verity',
    authors: ['Colleen Hoover'],
    rating: null,
    isbn13: null,
    coverUrl: null,
    readAt: null,
    shelves: ['to-read'],
    bookIds: [],
    source: 'me',
    firstSeenAt: '2026-11-25T00:00:00.000Z',
    isNew: false,
    request: null,
    requests: {},
    ...overrides,
  }
}

const submitted = (id: number, subscribed = false) => ({ request: { id, status: 'approved' }, subscribed })

function route(handlers: Record<string, Handler>) {
  mockApi.mockImplementation(async (input, init) => {
    const key = `${init?.method ?? 'GET'} ${String(input)}`
    const handler = handlers[key]
    if (!handler) throw new Error(`unexpected ${key}`)
    return handler(init)
  })
}

function calls(key: string) {
  return mockApi.mock.calls.filter(([input, init]) => `${init?.method ?? 'GET'} ${String(input)}` === key)
}

const baseHandlers = (): Record<string, Handler> => ({
  'POST /api/v1/book-requests/pairs': () => json({ ebook: submitted(41), audiobook: submitted(42) }, 201),
  [`GET ${ADMIN}/42/releases`]: () => search(audio),
  [`GET ${ADMIN}/41/releases`]: () => search(ebooks),
  [`POST ${ADMIN}/41/grab`]: () => json({ id: 41 }),
  [`POST ${ADMIN}/42/grab`]: () => json({ id: 42 }),
  'POST /api/v1/book-requests/cancel': (init) => json({ updated: JSON.parse(String(init?.body)).ids.map((id: number) => ({ id })), failed: [] }),
})

const passThrough = { template: '<div><slot /></div>' }

async function mountPanel(shelfRow = row()) {
  const wrapper = mount(ReadAlongPairPanel, {
    props: { open: true, row: shelfRow, cards: [] },
    global: {
      stubs: { Sheet: passThrough, SheetContent: passThrough, SheetHeader: passThrough, SheetTitle: passThrough, SheetDescription: passThrough },
    },
  })
  await flushPromises()
  return wrapper
}

const pickTitle = (wrapper: Awaited<ReturnType<typeof mountPanel>>, kind: string) =>
  wrapper.find(`[data-testid="read-along-half-${kind}"] [data-testid="read-along-pick-title"]`).text()

describe('ReadAlongPairPanel', () => {
  beforeEach(() => {
    mockApi.mockReset()
    clearReleaseSearchCache()
  })

  it('creates both self-serve requests, says nothing downloads yet, and shows the best pick of each half', async () => {
    route(baseHandlers())
    const wrapper = await mountPanel()

    const body = JSON.parse(String(calls('POST /api/v1/book-requests/pairs')[0]![1]!.body))
    expect(body).toMatchObject({ selfServe: true, title: 'Verity', providerKey: 'goodreads', providerId: '27362503', language: 'en' })
    expect(wrapper.find('[data-testid="read-along-notice"]').text()).toContain('2 requests were created')
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

  it('says why a half has no pick and does not offer to send', async () => {
    const handlers = baseHandlers()
    handlers[`GET ${ADMIN}/42/releases`] = () => search([release('a3', { title: 'Verity (Abridged)' })])
    route(handlers)
    const wrapper = await mountPanel()

    expect(wrapper.find('[data-testid="read-along-half-missing"]').text()).toBe(t('goodreads.readAlongPair.missing.audiobook.flagged'))
    expect(wrapper.find('[data-testid="read-along-send"]').attributes('disabled')).toBeDefined()
  })
})
