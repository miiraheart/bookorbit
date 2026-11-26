import {
  BOOK_REQUEST_MEDIA_KINDS,
  isBookRequestMediaKind,
  type BookRequestStatus,
  type GoodreadsRequestState,
  type GoodreadsRequests,
} from '@bookorbit/types';

export interface RequestRow {
  id: number;
  status: string;
  providerId: string | null;
  mediaKind: string;
}

/** Rows newest first: the first one seen per book and kind wins. A retired comic request stands for the ebook. */
export function groupRequests(rows: readonly RequestRow[]): Map<string, GoodreadsRequests> {
  const found = new Map<string, GoodreadsRequests>();
  for (const row of rows) {
    if (!row.providerId) continue;
    const kind = isBookRequestMediaKind(row.mediaKind) ? row.mediaKind : 'ebook';
    const entry = found.get(row.providerId) ?? {};
    entry[kind] ??= { id: row.id, status: row.status as BookRequestStatus };
    found.set(row.providerId, entry);
  }
  return found;
}

export function newestRequest(requests: GoodreadsRequests): GoodreadsRequestState | null {
  let newest: GoodreadsRequestState | null = null;
  for (const kind of BOOK_REQUEST_MEDIA_KINDS) {
    const state = requests[kind];
    if (state && (!newest || state.id > newest.id)) newest = state;
  }
  return newest;
}
