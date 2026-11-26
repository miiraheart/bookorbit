import type {
  AcceptExactResponse,
  PairEbookRequest,
  PairEbookResponse,
  ReadAlongCandidatesResponse,
  ReadAlongDismissalsResponse,
  ReadAlongListResponse,
  ReadAlongMatchTier,
  ReadAlongPairedAudiobooksResponse,
  ReadAlongPairStatus,
  UnpairEbookResponse,
} from '@bookorbit/types'

import { apiJson, apiSend, jsonBody } from '@/lib/api-json'

const ERRORS = 'tools.readAlong.errors'

function withQuery(query: URLSearchParams): string {
  const text = query.toString()
  return text ? `?${text}` : ''
}

export type ReadAlongListParams = {
  status?: ReadAlongPairStatus
  tier?: ReadAlongMatchTier
  libraryId?: number
  q?: string
  page?: number
  pageSize?: number
}

export function listReadAlong(params: ReadAlongListParams = {}): Promise<ReadAlongListResponse> {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.tier) query.set('tier', params.tier)
  if (params.libraryId !== undefined) query.set('libraryId', String(params.libraryId))
  if (params.q) query.set('q', params.q)
  if (params.page !== undefined) query.set('page', String(params.page))
  if (params.pageSize !== undefined) query.set('pageSize', String(params.pageSize))
  const suffix = withQuery(query)
  return apiJson(`/api/v1/read-aloud/pairs${suffix}`, undefined, `${ERRORS}.list`)
}

export function fetchCandidates(bookId: number, options: { q?: string; showDismissed?: boolean } = {}): Promise<ReadAlongCandidatesResponse> {
  const query = new URLSearchParams()
  if (options.q) query.set('q', options.q)
  if (options.showDismissed) query.set('showDismissed', 'true')
  const suffix = withQuery(query)
  return apiJson(`/api/v1/books/${bookId}/read-aloud/candidates${suffix}`, undefined, `${ERRORS}.candidates`)
}

export function pairEbook(bookId: number, body: PairEbookRequest): Promise<PairEbookResponse> {
  return apiJson(`/api/v1/books/${bookId}/read-aloud/pair`, jsonBody('PUT', body), `${ERRORS}.pair`)
}

export function unpairEbook(bookId: number): Promise<UnpairEbookResponse> {
  return apiJson(`/api/v1/books/${bookId}/read-aloud/pair`, { method: 'DELETE' }, `${ERRORS}.unpair`)
}

export function dismissCandidate(bookId: number, ebookBookId: number): Promise<ReadAlongDismissalsResponse> {
  return apiJson(`/api/v1/books/${bookId}/read-aloud/candidates/dismiss`, jsonBody('POST', { ebookBookId }), `${ERRORS}.dismiss`)
}

export function undismissCandidate(bookId: number, ebookBookId: number): Promise<ReadAlongDismissalsResponse> {
  return apiJson(`/api/v1/books/${bookId}/read-aloud/candidates/undismiss`, jsonBody('POST', { ebookBookId }), `${ERRORS}.dismiss`)
}

/** `dryRun` counts what the server would pair, with the same rules, and pairs nothing. */
export function acceptExact(libraryId?: number, dryRun = false): Promise<AcceptExactResponse> {
  const body = { ...(libraryId === undefined ? {} : { libraryId }), ...(dryRun ? { dryRun } : {}) }
  return apiJson('/api/v1/read-aloud/pairs/accept-exact', jsonBody('POST', body), `${ERRORS}.acceptExact`)
}

export function fetchPairedAudiobooks(ebookBookId: number): Promise<ReadAlongPairedAudiobooksResponse> {
  return apiJson(`/api/v1/books/${ebookBookId}/read-aloud/paired-audiobooks`, undefined, `${ERRORS}.candidates`)
}

/** The same file delete the Files tab uses; it needs the delete-books permission on the server. */
export function deleteReadAlongFile(fileId: number): Promise<void> {
  return apiSend(`/api/v1/books/files/${fileId}`, { method: 'DELETE' }, `${ERRORS}.deleteReadAlong`)
}
