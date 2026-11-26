import { describe, expect, it, vi } from 'vitest'
import type { GoodreadsRequestState, GoodreadsShelfRow } from '@bookorbit/types'
import { cancelSummary, cancellableRequestIds, isLiveRequest, requestRows, requestableRows } from '../bulk'

function row(key: string, overrides: Partial<GoodreadsShelfRow> = {}): GoodreadsShelfRow {
  return {
    key,
    goodreadsId: key,
    title: `Book ${key}`,
    authors: ['Author'],
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

const rows = [
  row('free'),
  row('owned', { bookIds: [9], request: { id: 1, status: 'pending' } }),
  row('pending', { request: { id: 2, status: 'pending' } }),
  row('done', { request: { id: 3, status: 'available' } }),
  row('cancelled', { request: { id: 4, status: 'cancelled' } }),
]

describe('goodreads bulk selection', () => {
  it('requests only books not owned whose request is not alive', () => {
    expect(requestableRows(rows).map((entry) => entry.key)).toEqual(['free', 'cancelled'])
  })

  it('cancels only cancellable requests and never an owned book', () => {
    expect(cancellableRequestIds(rows)).toEqual([2])
  })

  it('requests one book at a time and counts what it skipped', async () => {
    const request = vi
      .fn<(entry: GoodreadsShelfRow) => Promise<GoodreadsRequestState | null>>()
      .mockResolvedValueOnce({ id: 10, status: 'approved' })
      .mockRejectedValueOnce(new Error('refused'))
    const done = vi.fn<(entry: GoodreadsShelfRow, created: GoodreadsRequestState | null) => void>()

    const summary = await requestRows(rows, request, done)

    expect(request.mock.calls.map(([entry]) => (entry as GoodreadsShelfRow).key)).toEqual(['free', 'cancelled'])
    expect(done).toHaveBeenCalledTimes(1)
    expect(summary).toEqual({ requested: 1, owned: 1, alreadyRequested: 2, failed: 1 })
  })

  it('treats only a cancelled or rejected request as released', () => {
    expect(isLiveRequest({ id: 1, status: 'pending' })).toBe(true)
    expect(isLiveRequest({ id: 1, status: 'available' })).toBe(true)
    expect(isLiveRequest({ id: 1, status: 'cancelled' })).toBe(false)
    expect(isLiveRequest({ id: 1, status: 'rejected' })).toBe(false)
    expect(isLiveRequest(null)).toBe(false)
  })

  it('summarizes a bulk cancel against the selection', () => {
    expect(cancelSummary(rows, 1, 0)).toEqual({ cancelled: 1, owned: 1, notCancellable: 3, failed: 0 })
  })
})
