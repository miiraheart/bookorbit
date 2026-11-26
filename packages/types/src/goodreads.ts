import type { BookCard } from "./book";
import type { BookRequestMediaKind, BookRequestStatus } from "./book-request";

/** Book requests made from the Goodreads page carry this provider key and the Goodreads book id. */
export const GOODREADS_PROVIDER_KEY = "goodreads";

/** The account the sync job reads as "my shelves". Present from the first sync, never removable. */
export const GOODREADS_OWN_SOURCE_ID = "me";

/** Tab name used for a followed Listopia list, which has no shelves of its own. */
export const GOODREADS_LIST_SHELF = "list";

/** A full page of rows with many copies each stays one bounded card query. */
export const GOODREADS_CARD_CAP = 400;

export type GoodreadsSourceKind = "user" | "list";

/** One followed Goodreads source: her own account, another member's public shelves, or a Listopia list. */
export interface GoodreadsSource {
  id: string;
  kind: GoodreadsSourceKind;
  /** Goodreads user id or list id; null for her own account until the sync job fills it in. */
  ref: string | null;
  name: string;
  own: boolean;
  addedAt: string;
  lastSyncedAt: string | null;
  /** The sync before the last one: books first seen after it are new. */
  previousSyncedAt: string | null;
  lastError: string | null;
}

/** One book on a source's shelves, as the sync job reads them. A book on several shelves is one item. */
export interface GoodreadsShelfItem {
  /** Stable per book within a source: the Goodreads book id when known, else the review id. */
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

/** An item as stored: which source it came from and when that source first listed it. */
export interface GoodreadsStoredItem extends GoodreadsShelfItem {
  source: string;
  firstSeenAt: string;
}

export interface GoodreadsShelfSummary {
  name: string;
  count: number;
  newCount: number;
}

export interface GoodreadsSourceSummary extends GoodreadsSource {
  total: number;
  newCount: number;
  shelves: GoodreadsShelfSummary[];
}

export interface GoodreadsOverview {
  lastSyncedAt: string | null;
  syncRequestedAt: string | null;
  total: number;
  sources: GoodreadsSourceSummary[];
}

export interface GoodreadsRequestState {
  id: number;
  status: BookRequestStatus;
  /** Present, and true, only on a request she fulfils herself. */
  selfServe?: boolean;
}

/** The newest request per media kind; a legacy comic request counts as the ebook one. */
export type GoodreadsRequests = Partial<Record<BookRequestMediaKind, GoodreadsRequestState>>;

export interface GoodreadsShelfRow extends GoodreadsStoredItem {
  isNew: boolean;
  /** The newest of `requests`, whatever its kind. */
  request: GoodreadsRequestState | null;
  requests: GoodreadsRequests;
}

export interface GoodreadsShelfPage {
  total: number;
  items: GoodreadsShelfRow[];
  /** Library cards for the owned copies on this page, each book once. Copies the viewer may not see are absent. */
  cards: BookCard[];
}

export type GoodreadsSort = "newest" | "title" | "author";

/** One book of a source on its own, for its Goodreads page, with the same source's other books by its authors. */
export interface GoodreadsItemDetail {
  item: GoodreadsShelfRow;
  related: GoodreadsShelfRow[];
  /** Library cards for the copies of the item and of the related rows that this user may see. */
  cards: BookCard[];
}

/** The sync job sends one source at a time; an error alone keeps that source's previous books. */
export interface ReplaceGoodreadsSnapshotPayload {
  source?: string;
  items?: GoodreadsShelfItem[];
  error?: string | null;
  /** The name Goodreads gives the source, used until the user renames it. */
  sourceName?: string | null;
  /** Fills in her own account id the first time the job runs. */
  sourceRef?: string | null;
}

export interface AddGoodreadsSourcePayload {
  /** A Goodreads profile or list URL, or a bare user id. */
  url: string;
  name?: string;
}
