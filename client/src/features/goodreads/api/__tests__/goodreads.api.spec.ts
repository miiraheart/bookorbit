import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GoodreadsShelfItem } from '@bookorbit/types'

type ApiFn = (input: RequestInfo | URL, init?: RequestInit & { _isRetry?: boolean }) => Promise<Response>

vi.mock('@/lib/api', () => ({
  api: vi.fn<ApiFn>(),
}))

import { api } from '@/lib/api'
import { addGoodreadsSource, cancelGoodreadsRequests, fetchGoodreadsShelf, removeGoodreadsSource, requestGoodreadsBook } from '../goodreads.api'

const mockApi = vi.mocked(api)

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const book: GoodreadsShelfItem = {
  key: '1234',
  goodreadsId: '1234',
  title: 'La solitude des professeurs est infinie',
  authors: ['Yannick Haenel'],
  rating: null,
  isbn13: '9782073161956',
  coverUrl: 'https://images.gr-assets.com/books/1234.jpg',
  readAt: null,
  shelves: ['to-read'],
  bookIds: [],
}

describe('goodreads api', () => {
  beforeEach(() => {
    mockApi.mockReset()
  })

  it('files the book through the ordinary request route with the Goodreads id as provider', async () => {
    mockApi.mockResolvedValue(jsonResponse({ request: { id: 12, status: 'approved' } }, 201))

    await expect(requestGoodreadsBook(book, 'fr')).resolves.toEqual({ id: 12, status: 'approved' })

    const [url, init] = mockApi.mock.calls[0] ?? []
    expect(url).toBe('/api/v1/book-requests')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      mediaKind: 'ebook',
      title: book.title,
      authors: book.authors,
      isbn13: book.isbn13,
      coverUrl: book.coverUrl,
      language: 'fr',
      providerKey: 'goodreads',
      providerId: '1234',
    })
  })

  it('asks for an audiobook when told to, and an ebook by default', async () => {
    mockApi.mockImplementation(() => Promise.resolve(jsonResponse({ request: { id: 5, status: 'pending' } }, 201)))

    await requestGoodreadsBook(book, null, 'audiobook')
    await requestGoodreadsBook(book, null)

    const kinds = mockApi.mock.calls.map(([, init]) => (JSON.parse(String(init?.body)) as { mediaKind: string }).mediaKind)
    expect(kinds).toEqual(['audiobook', 'ebook'])
  })

  it('leaves the language to the server when the user has no default', async () => {
    mockApi.mockResolvedValue(jsonResponse({ request: { id: 3, status: 'pending' } }, 201))

    await requestGoodreadsBook({ ...book, isbn13: null, coverUrl: null }, null)

    const body = JSON.parse(String(mockApi.mock.calls[0]?.[1]?.body)) as Record<string, unknown>
    expect(body).not.toHaveProperty('language')
    expect(body).not.toHaveProperty('isbn13')
    expect(body).not.toHaveProperty('coverUrl')
  })

  it('asks for one source shelf page with its sort and the trimmed search', async () => {
    mockApi.mockResolvedValue(jsonResponse({ total: 0, items: [] }))

    await fetchGoodreadsShelf({ source: 'list-264', shelf: 'list', sort: 'title', q: '  dune ', offset: 50, limit: 50 })

    expect(mockApi.mock.calls[0]?.[0]).toBe('/api/v1/goodreads/items?source=list-264&shelf=list&sort=title&offset=50&limit=50&q=dune')
  })

  it('follows and unfollows sources through the goodreads routes', async () => {
    mockApi.mockImplementation(() => Promise.resolve(jsonResponse({ sources: [] })))

    await addGoodreadsSource('  https://www.goodreads.com/list/show/264  ')
    await removeGoodreadsSource('list-264')

    expect(mockApi.mock.calls[0]?.[0]).toBe('/api/v1/goodreads/sources')
    expect(JSON.parse(String(mockApi.mock.calls[0]?.[1]?.body))).toEqual({ url: 'https://www.goodreads.com/list/show/264' })
    expect(mockApi.mock.calls[1]?.[0]).toBe('/api/v1/goodreads/sources/list-264')
    expect(mockApi.mock.calls[1]?.[1]?.method).toBe('DELETE')
  })

  it('cancels through BookOrbit’s own bulk cancel route', async () => {
    mockApi.mockResolvedValue(jsonResponse({ updated: [], failed: [] }))

    await cancelGoodreadsRequests([4, 5])

    expect(mockApi.mock.calls[0]?.[0]).toBe('/api/v1/book-requests/cancel')
    expect(JSON.parse(String(mockApi.mock.calls[0]?.[1]?.body))).toEqual({ ids: [4, 5] })
  })
})
