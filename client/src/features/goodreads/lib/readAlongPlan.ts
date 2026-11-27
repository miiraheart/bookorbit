import {
  ACTIVE_BOOK_REQUEST_STATUSES,
  BOOK_REQUEST_MEDIA_KINDS,
  isGrabbableBookRequestStatus,
  type BookCard,
  type BookRequestMediaKind,
  type GoodreadsRequestState,
  type GoodreadsShelfRow,
} from '@bookorbit/types'
import { pairSubmission, type PairAvailability, type PairSubmission } from '@/features/book-requests/requestPair'
import { pickCopies } from './copies'

export type ReadAlongStart = Extract<PairSubmission, { kind: 'pair' | 'single' }>

/**
 * What "Download both" does for a row: file the requests still missing, reopen the picks of
 * requests already filed while one of them still waits for a release, or nothing at all.
 */
export type ReadAlongPlan =
  | { kind: 'start'; submission: ReadAlongStart; owned: BookRequestMediaKind[] }
  | { kind: 'resume'; requests: Partial<Record<BookRequestMediaKind, GoodreadsRequestState>>; owned: BookRequestMediaKind[] }
  | { kind: 'none' }

/** Her own live requests on the row count as followed; an owned copy is the shown ebook or audio card. */
export function readAlongAvailability(row: Pick<GoodreadsShelfRow, 'requests'>, cards: readonly BookCard[]): PairAvailability {
  const copies = pickCopies(cards)
  const ownedIds: Record<BookRequestMediaKind, number | null> = { ebook: copies.ebook?.id ?? null, audiobook: copies.audio?.id ?? null }
  const entry = (kind: BookRequestMediaKind) => {
    const state = row.requests[kind]
    const live = isLive(state) ? state! : null
    return {
      ownedBookId: ownedIds[kind],
      existingRequestId: live?.id ?? null,
      existingRequestStatus: live?.status ?? null,
      alreadySubscribed: live !== null,
    }
  }
  return { ebook: entry('ebook'), audiobook: entry('audiobook') }
}

function isLive(state: GoodreadsRequestState | undefined): boolean {
  return !!state && ACTIVE_BOOK_REQUEST_STATUSES.includes(state.status)
}

/** Still waiting for a release she may send: her own self-serve request, or any request when she manages them. */
export function canPickFor(state: { status: GoodreadsRequestState['status']; selfServe?: boolean } | undefined, canManage: boolean): boolean {
  return !!state && isGrabbableBookRequestStatus(state.status) && (state.selfServe === true || canManage)
}

export function readAlongPlan(row: Pick<GoodreadsShelfRow, 'requests'>, cards: readonly BookCard[], canManage = false): ReadAlongPlan {
  const availability = readAlongAvailability(row, cards)
  const owned = BOOK_REQUEST_MEDIA_KINDS.filter((kind) => availability[kind]?.ownedBookId != null)
  const submission = pairSubmission(availability)
  if (submission.kind !== 'none') return { kind: 'start', submission, owned }
  if (submission.reason === 'owned') return { kind: 'none' }

  const needed = BOOK_REQUEST_MEDIA_KINDS.filter((kind) => !owned.includes(kind))
  const states = needed.map((kind) => row.requests[kind])
  if (!states.every(isLive) || !states.some((state) => canPickFor(state, canManage))) return { kind: 'none' }
  return { kind: 'resume', requests: Object.fromEntries(needed.map((kind) => [kind, row.requests[kind]!])), owned }
}
