import type { Mock } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { GoodreadsShelfRow, ReleaseCandidateItem } from '@bookorbit/types'
import ReadAlongPairPanel from '../readalong/ReadAlongPairPanel.vue'

export type ApiFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
export type Handler = (init?: RequestInit) => Response | Promise<Response>

export const ADMIN = '/api/v1/admin/book-requests'

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export function release(guid: string, overrides: Partial<ReleaseCandidateItem> = {}): ReleaseCandidateItem {
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

export const search = (releases: ReleaseCandidateItem[]) =>
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

export const audio = [release('a1', { seeders: 80 }), release('a2', { seeders: 5 })]
export const ebooks = [
  release('e1', { format: 'epub', formats: ['epub'], seeders: 40 }),
  release('e2', { format: 'epub', formats: ['epub'], seeders: null, indexerName: "Anna's Archive", grabs: 900 }),
]

export function row(overrides: Partial<GoodreadsShelfRow> = {}): GoodreadsShelfRow {
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

export const submitted = (id: number, subscribed = false) => ({ request: { id, status: 'approved' }, subscribed })

/** Answers each "METHOD path" from its handler, and lists the calls made to one of them. */
export function apiRouter(mockApi: Mock<ApiFn>) {
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
  return { route, calls }
}

export const baseHandlers = (): Record<string, Handler> => ({
  'POST /api/v1/book-requests/pairs': () => json({ ebook: submitted(41), audiobook: submitted(42) }, 201),
  [`GET ${ADMIN}/42/releases`]: () => search(audio),
  [`GET ${ADMIN}/41/releases`]: () => search(ebooks),
  [`POST ${ADMIN}/41/grab`]: () => json({ id: 41 }),
  [`POST ${ADMIN}/42/grab`]: () => json({ id: 42 }),
  'POST /api/v1/book-requests/cancel': (init) => json({ updated: JSON.parse(String(init?.body)).ids.map((id: number) => ({ id })), failed: [] }),
})

const passThrough = { template: '<div><slot /></div>' }

export async function mountPanel(shelfRow = row()) {
  const wrapper = mount(ReadAlongPairPanel, {
    props: { open: true, row: shelfRow, cards: [] },
    global: {
      stubs: { Sheet: passThrough, SheetContent: passThrough, SheetHeader: passThrough, SheetTitle: passThrough, SheetDescription: passThrough },
    },
  })
  await flushPromises()
  return wrapper
}

export const pickTitle = (wrapper: Awaited<ReturnType<typeof mountPanel>>, kind: string) =>
  wrapper.find(`[data-testid="read-along-half-${kind}"] [data-testid="read-along-pick-title"]`).text()
