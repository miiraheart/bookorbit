import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GoodreadsShelfItem } from '@bookorbit/types'

type ApiFn = (input: RequestInfo | URL, init?: RequestInit & { _isRetry?: boolean }) => Promise<Response>

vi.mock('@/lib/api', () => ({
  api: vi.fn<ApiFn>(),
}))

import { api } from '@/lib/api'
import { fetchGoodreadsShelf, requestGoodreadsBook } from '../goodreads.api'

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

  it('leaves the language to the server when the user has no default', async () => {
    mockApi.mockResolvedValue(jsonResponse({ request: { id: 3, status: 'pending' } }, 201))

    await requestGoodreadsBook({ ...book, isbn13: null, coverUrl: null }, null)

    const body = JSON.parse(String(mockApi.mock.calls[0]?.[1]?.body)) as Record<string, unknown>
    expect(body).not.toHaveProperty('language')
    expect(body).not.toHaveProperty('isbn13')
    expect(body).not.toHaveProperty('coverUrl')
  })

  it('asks for one shelf page with the trimmed search', async () => {
    mockApi.mockResolvedValue(jsonResponse({ total: 0, items: [] }))

    await fetchGoodreadsShelf({ shelf: 'to-read', q: '  dune ', offset: 50, limit: 50 })

    expect(mockApi.mock.calls[0]?.[0]).toBe('/api/v1/goodreads/items?shelf=to-read&offset=50&limit=50&q=dune')
  })
})
