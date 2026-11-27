import {
  BOOK_REQUEST_MEDIA_KINDS,
  type BookRequestMediaKind,
  type BookRequestPairSubmitResult,
  type BookRequestStatus,
  type BookRequestSubmitResult,
  type GoodreadsShelfItem,
} from '@bookorbit/types'
import { apiJson, jsonBody } from '@/lib/api-json'
import type { ReadAlongStart } from '../lib/readAlongPlan'
import { goodreadsWork } from './goodreads.api'

/** One half as the server answered it. `created` is false for a request she already had or joined. */
export interface ReadAlongRequest {
  mediaKind: BookRequestMediaKind
  id: number
  status: BookRequestStatus
  selfServe: boolean
  created: boolean
}

function toRequest(mediaKind: BookRequestMediaKind, result: BookRequestSubmitResult): ReadAlongRequest {
  return {
    mediaKind,
    id: result.request.id,
    status: result.request.status,
    selfServe: result.request.selfServe === true,
    created: !result.subscribed,
  }
}

/**
 * Self-serve, so automation stays out of it and nothing is sent until she picks. A pair goes
 * through the pair route, which joins what exists; a lone half beside an owned copy joins that book.
 */
export async function startGoodreadsReadAlong(item: GoodreadsShelfItem, language: string | null, start: ReadAlongStart): Promise<ReadAlongRequest[]> {
  const work = { ...goodreadsWork(item, language), selfServe: true }
  if (start.kind === 'single') {
    const result = await apiJson<BookRequestSubmitResult>(
      '/api/v1/book-requests',
      jsonBody('POST', { ...work, mediaKind: start.mediaKind, ...(start.joinBookId ? { targetBookId: start.joinBookId } : {}) }),
      'goodreads.requestFailed',
    )
    return [toRequest(start.mediaKind, result)]
  }
  const result = await apiJson<BookRequestPairSubmitResult>('/api/v1/book-requests/pairs', jsonBody('POST', work), 'goodreads.requestFailed')
  return BOOK_REQUEST_MEDIA_KINDS.map((kind) => toRequest(kind, result[kind]))
}
