import { isCancellableBookRequestStatus, type GoodreadsShelfRow, type GoodreadsRequestState } from '@bookorbit/types'

/** A request that no longer holds the work: requesting again is allowed. */
const RELEASED_STATUSES = new Set(['cancelled', 'rejected'])

export interface BulkRequestSummary {
  requested: number
  owned: number
  alreadyRequested: number
  failed: number
}

export interface BulkCancelSummary {
  cancelled: number
  owned: number
  notCancellable: number
  failed: number
}

/** Owned books are never requested, and a book whose request is still alive is not requested twice. */
export function requestableRows(rows: GoodreadsShelfRow[]): GoodreadsShelfRow[] {
  return rows.filter((row) => row.bookIds.length === 0 && (!row.request || RELEASED_STATUSES.has(row.request.status)))
}

/** Only requests BookOrbit itself still lets you cancel, and never one for a book already owned. */
export function cancellableRequestIds(rows: GoodreadsShelfRow[]): number[] {
  return rows
    .filter((row) => row.bookIds.length === 0 && row.request && isCancellableBookRequestStatus(row.request.status))
    .map((row) => (row.request as GoodreadsRequestState).id)
}

/** One at a time, through the same call as the single Request button, so each book gets the same checks. */
export async function requestRows(
  rows: GoodreadsShelfRow[],
  request: (row: GoodreadsShelfRow) => Promise<GoodreadsRequestState | null>,
  onDone: (row: GoodreadsShelfRow, created: GoodreadsRequestState | null) => void,
): Promise<BulkRequestSummary> {
  const wanted = requestableRows(rows)
  const owned = rows.filter((row) => row.bookIds.length > 0).length
  const summary: BulkRequestSummary = { requested: 0, owned, alreadyRequested: rows.length - owned - wanted.length, failed: 0 }
  for (const row of wanted) {
    try {
      const created = await request(row)
      onDone(row, created)
      summary.requested += 1
    } catch {
      summary.failed += 1
    }
  }
  return summary
}

export function cancelSummary(rows: GoodreadsShelfRow[], cancelled: number, failed: number): BulkCancelSummary {
  const owned = rows.filter((row) => row.bookIds.length > 0).length
  return { cancelled, owned, notCancellable: rows.length - owned - cancellableRequestIds(rows).length, failed }
}
