import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { BookRequestItem } from '@bookorbit/types'

type ApiFn = (input: RequestInfo | URL, init?: RequestInit & { _isRetry?: boolean }) => Promise<Response>

vi.mock('@/lib/api', () => ({
  api: vi.fn<ApiFn>(),
}))

import { api } from '@/lib/api'
import { ownershipQuery, useOwnedWaitingRequests, waitsForRelease } from '../composables/useOwnedWaitingRequests'

const mockApi = vi.mocked(api)

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function request(overrides: Partial<BookRequestItem> = {}): BookRequestItem {
  return {
    id: 20,
    title: 'Fifty Shades of Grey (Fifty Shades, #1)',
    authors: ['E.L. James'],
    isbn13: null,
    mediaKind: 'ebook',
    status: 'approved',
    download: null,
    companion: null,
    ...overrides,
  } as BookRequestItem
}

function owned(ownedBookId: number | null) {
  return { ownedBookId, existingRequestId: null, existingRequestStatus: null, alreadySubscribed: false }
}

function sentItems(call = 0): unknown[] {
  return (JSON.parse(String(mockApi.mock.calls[call]?.[1]?.body)) as { items: unknown[] }).items
}

describe('waitsForRelease', () => {
  it('holds only requests still waiting for a release with nothing transferring', () => {
    expect(waitsForRelease(request())).toBe(true)
    expect(waitsForRelease(request({ status: 'failed' }))).toBe(true)
    expect(waitsForRelease(request({ status: 'available' }))).toBe(false)
    expect(waitsForRelease(request({ status: 'pending' }))).toBe(false)
    expect(waitsForRelease(request({ mediaKind: 'comic' }))).toBe(false)
    expect(waitsForRelease(request({ download: { status: 'downloading' } as BookRequestItem['download'] }))).toBe(false)
  })
})

describe('ownershipQuery', () => {
  it('asks by the clean title, first author and isbn, never by the provider', () => {
    const query = ownershipQuery(request({ isbn13: '9780345803481', providerKey: 'goodreads', providerId: '10818853' }) as never)
    expect(query).toEqual({ title: 'Fifty Shades of Grey', author: 'E.L. James', isbn13: '9780345803481', mediaKind: 'ebook' })
  })
})

describe('useOwnedWaitingRequests', () => {
  beforeEach(() => {
    mockApi.mockReset()
  })

  it('maps a waiting request to the book already on the shelf, and leaves the rest out', async () => {
    mockApi.mockResolvedValue(jsonResponse([owned(434), owned(null)]))
    const rows = ref<BookRequestItem[]>([request(), request({ id: 21, title: 'Freed' }), request({ id: 22, status: 'available' })])

    const { ownedBookIds } = useOwnedWaitingRequests(rows)
    await flushPromises()

    expect(mockApi).toHaveBeenCalledTimes(1)
    expect(mockApi.mock.calls[0]?.[0]).toBe('/api/v1/book-requests/availability')
    expect(sentItems()).toHaveLength(2)
    expect([...ownedBookIds.value]).toEqual([[20, 434]])
  })

  it('looks at both halves of a pair, and asks once per request across refetches', async () => {
    mockApi.mockResolvedValue(jsonResponse([owned(null), owned(77)]))
    const pair = request({ companion: request({ id: 31, mediaKind: 'audiobook' }) })
    const rows = ref<BookRequestItem[]>([pair])

    const { ownedBookIds } = useOwnedWaitingRequests(rows)
    await flushPromises()
    rows.value = [{ ...pair }]
    await flushPromises()

    expect(mockApi).toHaveBeenCalledTimes(1)
    expect([...ownedBookIds.value]).toEqual([[31, 77]])
  })

  it('stops pointing at the book once the request no longer waits', async () => {
    mockApi.mockResolvedValue(jsonResponse([owned(434)]))
    const rows = ref<BookRequestItem[]>([request()])

    const { ownedBookIds } = useOwnedWaitingRequests(rows)
    await flushPromises()
    rows.value = [request({ status: 'available' })]
    await flushPromises()

    expect(ownedBookIds.value.size).toBe(0)
  })

  it('shows nothing and asks again later when the lookup fails', async () => {
    mockApi.mockResolvedValueOnce(jsonResponse({ message: 'boom' }, 500)).mockResolvedValueOnce(jsonResponse([owned(9)]))
    const rows = ref<BookRequestItem[]>([request()])

    const { ownedBookIds } = useOwnedWaitingRequests(rows)
    await flushPromises()
    expect(ownedBookIds.value.size).toBe(0)

    rows.value = [request(), request({ id: 24 })]
    await flushPromises()

    expect(mockApi).toHaveBeenCalledTimes(2)
    expect(sentItems(1)).toHaveLength(2)
    expect([...ownedBookIds.value]).toEqual([[20, 9]])
  })
})
