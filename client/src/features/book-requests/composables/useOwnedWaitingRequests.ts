import { computed, shallowRef, watch, type Ref } from 'vue'
import {
  BOOK_REQUEST_MEDIA_KINDS,
  isGrabbableBookRequestStatus,
  type BookRequestAvailability,
  type BookRequestAvailabilityQuery,
  type BookRequestItem,
  type BookRequestMediaKind,
} from '@bookorbit/types'
import { titleWithoutSeries } from '@/features/goodreads/lib/related'
import { apiJson, jsonBody } from '@/lib/api-json'
import { flattenRequestRows } from '../requestPair'

const BATCH = 50

type WaitingRequest = BookRequestItem & { mediaKind: BookRequestMediaKind }

/** Still waiting for a release, with nothing transferring for it yet. */
export function waitsForRelease(request: BookRequestItem): request is WaitingRequest {
  const transfer = request.download?.status
  return (
    isGrabbableBookRequestStatus(request.status) &&
    (BOOK_REQUEST_MEDIA_KINDS as readonly string[]).includes(request.mediaKind) &&
    transfer !== 'queued' &&
    transfer !== 'downloading'
  )
}

/** Asked without the provider, so the answer never names the request itself as the match. */
export function ownershipQuery(request: WaitingRequest): BookRequestAvailabilityQuery {
  return {
    title: titleWithoutSeries(request.title),
    ...(request.authors[0] ? { author: request.authors[0] } : {}),
    ...(request.isbn13 ? { isbn13: request.isbn13 } : {}),
    mediaKind: request.mediaKind,
  }
}

/**
 * The shelf is only checked when a request is filed. A request still waiting for a release whose
 * book is already in a library she can see is looked up again here, read only, once per request.
 */
export function useOwnedWaitingRequests(rows: Readonly<Ref<readonly BookRequestItem[]>>) {
  const found = shallowRef<ReadonlyMap<number, number>>(new Map())
  const asked = new Set<number>()
  const waiting = computed(() => flattenRequestRows(rows.value).filter(waitsForRelease))

  async function lookup(requests: WaitingRequest[]) {
    const fresh = requests.filter((request) => !asked.has(request.id))
    for (const request of fresh) asked.add(request.id)
    for (let start = 0; start < fresh.length; start += BATCH) {
      const batch = fresh.slice(start, start + BATCH)
      try {
        const answers = await apiJson<BookRequestAvailability[]>(
          '/api/v1/book-requests/availability',
          jsonBody('POST', { items: batch.map(ownershipQuery) }),
          'bookRequests.releases.errors.loadFailed',
        )
        const owned = batch.flatMap((request, index) => {
          const bookId = answers[index]?.ownedBookId
          return bookId ? [[request.id, bookId] as const] : []
        })
        if (owned.length) found.value = new Map([...found.value, ...owned])
      } catch {
        for (const request of batch) asked.delete(request.id)
      }
    }
  }

  watch(
    () => waiting.value.map((request) => request.id).join(','),
    () => void lookup(waiting.value),
    { immediate: true },
  )

  const ownedBookIds = computed<ReadonlyMap<number, number>>(
    () =>
      new Map(
        waiting.value.flatMap((request) => {
          const bookId = found.value.get(request.id)
          return bookId ? [[request.id, bookId] as const] : []
        }),
      ),
  )

  return { ownedBookIds }
}
