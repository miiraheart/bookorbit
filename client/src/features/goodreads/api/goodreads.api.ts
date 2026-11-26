import {
  GOODREADS_PROVIDER_KEY,
  type BookRequestBulkResult,
  type BookRequestMediaKind,
  type BookRequestStatus,
  type GoodreadsItemDetail,
  type GoodreadsOverview,
  type GoodreadsShelfItem,
  type GoodreadsShelfPage,
  type GoodreadsSort,
  type MetadataCandidate,
} from '@bookorbit/types'
import { apiJson, jsonBody } from '@/lib/api-json'

const BASE = '/api/v1/goodreads'

export function fetchGoodreadsOverview(): Promise<GoodreadsOverview> {
  return apiJson<GoodreadsOverview>(BASE, undefined, 'goodreads.loadFailed')
}

export function fetchGoodreadsShelf(params: {
  source: string
  shelf: string
  sort: GoodreadsSort
  q: string
  offset: number
  limit: number
}): Promise<GoodreadsShelfPage> {
  const query = new URLSearchParams({
    source: params.source,
    shelf: params.shelf,
    sort: params.sort,
    offset: String(params.offset),
    limit: String(params.limit),
  })
  if (params.q.trim()) query.set('q', params.q.trim())
  return apiJson<GoodreadsShelfPage>(`${BASE}/items?${query}`, undefined, 'goodreads.loadFailed')
}

export function fetchGoodreadsItem(source: string, key: string): Promise<GoodreadsItemDetail> {
  return apiJson<GoodreadsItemDetail>(`${BASE}/items/${encodeURIComponent(source)}/${encodeURIComponent(key)}`, undefined, 'goodreads.loadFailed')
}

/** The exact Goodreads book behind a shelf row, read by its Goodreads id through the metadata provider. */
export async function lookupGoodreadsBook(goodreadsId: string): Promise<MetadataCandidate | null> {
  const query = new URLSearchParams({ provider: GOODREADS_PROVIDER_KEY, id: goodreadsId })
  try {
    return await apiJson<MetadataCandidate | null>(`/api/v1/metadata-fetch/lookup?${query.toString()}`, undefined, 'goodreads.loadFailed')
  } catch {
    return null
  }
}

export function requestGoodreadsSync(): Promise<GoodreadsOverview> {
  return apiJson<GoodreadsOverview>(`${BASE}/sync`, { method: 'POST' }, 'goodreads.syncFailed')
}

export function addGoodreadsSource(url: string): Promise<GoodreadsOverview> {
  return apiJson<GoodreadsOverview>(`${BASE}/sources`, jsonBody('POST', { url: url.trim() }), 'goodreads.sourceAddFailed')
}

export function renameGoodreadsSource(id: string, name: string): Promise<GoodreadsOverview> {
  return apiJson<GoodreadsOverview>(`${BASE}/sources/${encodeURIComponent(id)}`, jsonBody('PATCH', { name }), 'goodreads.sourceRenameFailed')
}

export function removeGoodreadsSource(id: string): Promise<GoodreadsOverview> {
  return apiJson<GoodreadsOverview>(`${BASE}/sources/${encodeURIComponent(id)}`, { method: 'DELETE' }, 'goodreads.sourceRemoveFailed')
}

interface CreatedRequest {
  request?: { id?: number; status?: BookRequestStatus }
}

/** The work as every request from this page describes it, filed under the Goodreads id. */
export function goodreadsWork(item: GoodreadsShelfItem, language: string | null) {
  return {
    title: item.title,
    authors: item.authors,
    ...(item.isbn13 ? { isbn13: item.isbn13 } : {}),
    ...(item.coverUrl ? { coverUrl: item.coverUrl } : {}),
    ...(language ? { language } : {}),
    providerKey: GOODREADS_PROVIDER_KEY,
    providerId: item.goodreadsId ?? item.key,
  }
}

/** The same route the request form uses, so dedupe, permissions and the audit trail all apply. */
export async function requestGoodreadsBook(
  item: GoodreadsShelfItem,
  language: string | null,
  mediaKind: BookRequestMediaKind = 'ebook',
): Promise<{ id: number; status: BookRequestStatus } | null> {
  const body = await apiJson<CreatedRequest>(
    '/api/v1/book-requests',
    jsonBody('POST', { mediaKind, ...goodreadsWork(item, language) }),
    'goodreads.requestFailed',
  )
  const id = body.request?.id
  return typeof id === 'number' ? { id, status: body.request?.status ?? 'pending' } : null
}

/** BookOrbit's own bulk cancel: each request keeps the file rule cancelling it alone would apply. */
export function cancelGoodreadsRequests(ids: number[]): Promise<BookRequestBulkResult> {
  return apiJson<BookRequestBulkResult>('/api/v1/book-requests/cancel', jsonBody('POST', { ids }), 'goodreads.cancelFailed')
}
