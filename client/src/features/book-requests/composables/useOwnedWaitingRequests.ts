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
import { flattenRequestRows, rowRequests } from '../requestPair'
import type { RowActionModel } from '../requestSelection'

const BATCH = 50

type WaitingRequest = BookRequestItem & { mediaKind: BookRequestMediaKind }

/** A request aimed at a book already on the shelf, such as a format upgrade, is not a duplicate. */
export function waitsForRelease(request: BookRequestItem): request is WaitingRequest {
  const transfer = request.download?.status
  return (
    request.targetBookId == null &&
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

  const ownedAwaitingPick = computed(() => ownedAwaitingPickRows(rows.value, ownedBookIds.value))

  return { ownedBookIds, ownedAwaitingPick }
}

/** A pick is not asked of a request whose book is already on the shelf. */
export function withoutOwnedPick(model: RowActionModel, owned: ReadonlyMap<number, number> | undefined): RowActionModel {
  if (model.step?.kind !== 'pick' || !owned?.size) return model
  const halves = model.step.halves.filter((half) => !owned.has(half.id))
  return { ...model, step: halves.length > 0 ? { ...model.step, halves } : null }
}

/**
 * Rows on this page the server counts as awaiting a manual pick although every waiting half is
 * already owned. Only the loaded page is known, so the banner count drops by these alone.
 */
export function ownedAwaitingPickRows(rows: readonly BookRequestItem[], owned: ReadonlyMap<number, number>): number {
  return rows.filter((row) => {
    const awaiting = rowRequests(row).filter((request) => request.status === 'approved' && request.failureCode === 'AUTOMATION_DISABLED')
    return awaiting.length > 0 && awaiting.every((request) => owned.has(request.id))
  }).length
}
