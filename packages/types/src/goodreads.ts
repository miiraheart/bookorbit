import type { BookRequestStatus } from "./book-request";

/** Book requests made from the Goodreads page carry this provider key and the Goodreads book id. */
export const GOODREADS_PROVIDER_KEY = "goodreads";

/** One book on Mira's Goodreads shelves, as the sync job reads them. A book on several shelves is one item. */
export interface GoodreadsShelfItem {
  /** Stable per book: the Goodreads book id when known, else the review id. */
  key: string;
  goodreadsId: string | null;
  title: string;
  authors: string[];
  /** 1 to 5, or null when not rated. */
  rating: number | null;
  isbn13: string | null;
  coverUrl: string | null;
  /** ISO date, only known from a CSV export. */
  readAt: string | null;
  shelves: string[];
  /** Owned copies in this library, empty when the book is not owned. */
  bookIds: number[];
}

export interface GoodreadsShelfSummary {
  name: string;
  count: number;
}

export interface GoodreadsOverview {
  lastSyncedAt: string | null;
  syncRequestedAt: string | null;
  total: number;
  shelves: GoodreadsShelfSummary[];
}

export interface GoodreadsRequestState {
  id: number;
  status: BookRequestStatus;
}

export interface GoodreadsShelfRow extends GoodreadsShelfItem {
  request: GoodreadsRequestState | null;
}

export interface GoodreadsShelfPage {
  total: number;
  items: GoodreadsShelfRow[];
}

export interface ReplaceGoodreadsSnapshotPayload {
  items: GoodreadsShelfItem[];
}
