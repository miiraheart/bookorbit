import { beforeEach, describe, expect, it, vi } from 'vitest'

type ApiFn = (input: RequestInfo | URL, init?: RequestInit & { _isRetry?: boolean }) => Promise<Response>

vi.mock('@/lib/api', () => ({
  api: vi.fn<ApiFn>(),
}))

import { api } from '@/lib/api'
import { fetchAudioBookmarks, fetchEbookBookmarks } from '../bookmarks.api'

const mockApi = vi.mocked(api)

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('goodreads bookmarks api', () => {
  beforeEach(() => {
    mockApi.mockReset()
  })

  it('reads every EPUB bookmark of the book, with no readerFileId', async () => {
    const bookmarks = [{ id: 1, bookId: 2611, cfi: 'epubcfi(/6/4!/4/2/1:0)', title: 'Chapter 1', createdAt: '2026-11-01T00:00:00.000Z' }]
    mockApi.mockResolvedValue(jsonResponse(bookmarks))

    await expect(fetchEbookBookmarks(2611)).resolves.toEqual(bookmarks)
    const [url] = mockApi.mock.calls[0]!
    expect(url).toBe('/api/v1/books/2611/bookmarks')
    expect(String(url)).not.toContain('readerFileId')
  })

  it('reads the audiobook bookmarks from the audiobook route', async () => {
    mockApi.mockResolvedValue(jsonResponse([]))

    await expect(fetchAudioBookmarks(2444)).resolves.toEqual([])
    expect(mockApi.mock.calls[0]![0]).toBe('/api/v1/audiobooks/2444/bookmarks')
  })

  it('rejects when the server refuses', async () => {
    mockApi.mockResolvedValue(jsonResponse({ message: 'nope' }, 403))

    await expect(fetchAudioBookmarks(2444)).rejects.toMatchObject({ name: 'ApiError', status: 403 })
  })
})
