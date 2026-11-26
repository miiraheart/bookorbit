import { api } from '@/lib/api'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acceptExact,
  deleteReadAlongFile,
  dismissCandidate,
  fetchCandidates,
  listReadAlong,
  pairEbook,
  undismissCandidate,
  unpairEbook,
} from '../read-along-pairs.api'

vi.mock('@/lib/api', () => ({ api: vi.fn<(...args: unknown[]) => unknown>(), NetworkError: class extends Error {} }))

function ok(body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status: 200 })
}

describe('read-along pairs API', () => {
  beforeEach(() => {
    vi.mocked(api).mockReset()
    vi.mocked(api).mockImplementation(async () => ok())
  })

  it('lists with only the filters that are set', async () => {
    await listReadAlong()
    await listReadAlong({ status: 'suggested', tier: 'exact', libraryId: 14, q: 'circe', page: 2, pageSize: 50 })

    expect(api).toHaveBeenNthCalledWith(1, '/api/v1/read-aloud/pairs', undefined)
    expect(api).toHaveBeenNthCalledWith(2, '/api/v1/read-aloud/pairs?status=suggested&tier=exact&libraryId=14&q=circe&page=2&pageSize=50', undefined)
  })

  it('asks for one audiobook candidates with a search and the dismissed ones', async () => {
    await fetchCandidates(2238)
    await fetchCandidates(2238, { q: 'circe', showDismissed: true })

    expect(api).toHaveBeenNthCalledWith(1, '/api/v1/books/2238/read-aloud/candidates', undefined)
    expect(api).toHaveBeenNthCalledWith(2, '/api/v1/books/2238/read-aloud/candidates?q=circe&showDismissed=true', undefined)
  })

  it('pairs with PUT, unpairs with DELETE and reads the unpair answer', async () => {
    vi.mocked(api)
      .mockResolvedValueOnce(ok({ pair: {}, readAlongStale: false }))
      .mockResolvedValueOnce(ok({ removed: null, readAlongs: [{ fileId: 9, filename: 'Circe.readaloud.epub' }], canDeleteReadAlong: true }))

    await pairEbook(2238, { ebookBookId: 2614, ebookFileId: 11728, dismissPrevious: true })
    const unpaired = await unpairEbook(2238)

    expect(api).toHaveBeenNthCalledWith(1, '/api/v1/books/2238/read-aloud/pair', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ebookBookId: 2614, ebookFileId: 11728, dismissPrevious: true }),
    })
    expect(api).toHaveBeenNthCalledWith(2, '/api/v1/books/2238/read-aloud/pair', { method: 'DELETE' })
    expect(unpaired.readAlongs).toEqual([{ fileId: 9, filename: 'Circe.readaloud.epub' }])
  })

  it('dismisses and un-dismisses one ebook record', async () => {
    await dismissCandidate(2238, 2712)
    await undismissCandidate(2238, 2712)

    expect(api).toHaveBeenNthCalledWith(
      1,
      '/api/v1/books/2238/read-aloud/candidates/dismiss',
      expect.objectContaining({ method: 'POST', body: '{"ebookBookId":2712}' }),
    )
    expect(api).toHaveBeenNthCalledWith(
      2,
      '/api/v1/books/2238/read-aloud/candidates/undismiss',
      expect.objectContaining({ method: 'POST', body: '{"ebookBookId":2712}' }),
    )
  })

  it('accepts exact matches for one library or all, and deletes a read-along by file id', async () => {
    vi.mocked(api)
      .mockResolvedValueOnce(ok({ paired: 3, skipped: 0 }))
      .mockResolvedValueOnce(ok({ paired: 0, skipped: 0 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(acceptExact(14)).resolves.toEqual({ paired: 3, skipped: 0 })
    await acceptExact()
    await deleteReadAlongFile(9)

    expect(api).toHaveBeenNthCalledWith(
      1,
      '/api/v1/read-aloud/pairs/accept-exact',
      expect.objectContaining({ method: 'POST', body: '{"libraryId":14}' }),
    )
    expect(api).toHaveBeenNthCalledWith(2, '/api/v1/read-aloud/pairs/accept-exact', expect.objectContaining({ method: 'POST', body: '{}' }))
    expect(api).toHaveBeenNthCalledWith(3, '/api/v1/books/files/9', { method: 'DELETE' })
  })

  it('throws on a refused pair', async () => {
    vi.mocked(api).mockResolvedValueOnce(new Response(JSON.stringify({ message: 'no' }), { status: 400 }))

    await expect(pairEbook(2238, { ebookBookId: 2238, ebookFileId: 1 })).rejects.toMatchObject({ status: 400 })
  })
})
