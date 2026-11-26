import { Permission } from '@bookorbit/types';

import type { RequestUser } from '../../common/types/request-user';
import type { ReadAlongBookFile, ReadAlongCorpusRow } from './read-aloud-match-index.repository';
import { emptyReadAlongPairsStore, toReadAlongPair, type ReadAlongPairsStore } from './read-aloud-pairs-store';

export const EDITOR = { id: 7, isSuperuser: false, permissions: [Permission.LibraryGenerateReadAloud] } as unknown as RequestUser;
export const DELETER = {
  id: 7,
  isSuperuser: false,
  permissions: [Permission.LibraryGenerateReadAloud, Permission.LibraryDeleteBooks],
} as unknown as RequestUser;

export const LIBRARIES: Record<number, string> = {
  14: 'Audiobooks - English',
  15: 'French',
  16: 'English',
  17: 'Shelfmark Downloads',
  18: 'Readarr - English (legacy)',
};

export function corpusRow(overrides: Partial<ReadAlongCorpusRow> & Pick<ReadAlongCorpusRow, 'id' | 'library_id' | 'title'>): ReadAlongCorpusRow {
  return {
    library_name: LIBRARIES[overrides.library_id] ?? null,
    subtitle: null,
    isbn10: null,
    isbn13: null,
    hardcover_id: null,
    open_library_id: null,
    goodreads_id: null,
    language: null,
    series_name: null,
    series_index: null,
    abridged: false,
    metadata_score: null,
    authors: [],
    has_audio: false,
    audio_seconds: null,
    epub_file_id: null,
    has_overlay: false,
    ...overrides,
  };
}

export function audioRow(id: number, title: string, authors: string[], overrides: Partial<ReadAlongCorpusRow> = {}): ReadAlongCorpusRow {
  return corpusRow({ id, library_id: 14, title, authors, has_audio: true, audio_seconds: 36_000, ...overrides });
}

export function epubRow(id: number, libraryId: number, title: string, authors: string[], overrides: Partial<ReadAlongCorpusRow> = {}) {
  return corpusRow({ id, library_id: libraryId, title, authors, epub_file_id: id * 10, ...overrides });
}

/** Real titles: Circe in four copies, Vicious in French only, a split dramatized ACOTAR volume, and an unmatched title. */
export const CORPUS: ReadAlongCorpusRow[] = [
  audioRow(2238, 'Circe (Unabridged)', ['Madeline Miller']),
  epubRow(2614, 16, 'Circe', ['Madeline Miller'], { language: 'en', metadata_score: 80 }),
  epubRow(2712, 17, 'Circe', ['Madeline Miller'], { language: 'en' }),
  epubRow(3757, 17, 'Circe', ['Miller, Madeline'], { language: 'en' }),
  epubRow(5639, 18, 'Circe', ['Madeline Miller']),
  audioRow(2494, 'Vicious', ['V. E. Schwab'], { language: 'en' }),
  epubRow(2535, 15, 'Vicious', ['V. E. Schwab'], { language: 'fr' }),
  audioRow(2600, 'A Court of Silver Flames (Part 1 of 2) (Dramatized Adaptation)', ['Sarah J. Maas']),
  epubRow(2601, 16, 'A Court of Silver Flames', ['Sarah J. Maas'], { language: 'en' }),
  audioRow(2700, 'Cognitive Behavioral Therapy', ['Lindsay C. Gibson']),
];

export function epubFile(id: number, bookId: number, overrides: Partial<ReadAlongBookFile> = {}): ReadAlongBookFile {
  return { id, bookId, format: 'epub', role: 'content', fileHash: `hash-${id}`, mediaOverlayAvailable: false, ...overrides };
}

export function audioFile(id: number, bookId: number): ReadAlongBookFile {
  return { id, bookId, format: 'm4b', role: 'content', fileHash: `hash-${id}`, mediaOverlayAvailable: false };
}

/** The pairs repository over one in-memory store; resolvePairs reports every stored pair as ok. */
export function fakePairsRepository(initial: ReadAlongPairsStore = emptyReadAlongPairsStore()) {
  const state = { store: initial, writes: 0 };
  const clone = () => JSON.parse(JSON.stringify(state.store)) as ReadAlongPairsStore;
  return {
    state,
    repo: {
      read: () => Promise.resolve(clone()),
      update: <T>(apply: (store: ReadAlongPairsStore) => T): Promise<T> => {
        const next = clone();
        const result = apply(next);
        state.store = next;
        state.writes += 1;
        return Promise.resolve(result);
      },
      resolvePairs: (ids?: readonly number[]) =>
        Promise.resolve(
          Object.entries(state.store.pairs)
            .filter(([id]) => !ids || ids.includes(Number(id)))
            .map(([id, entry]) => ({ pair: toReadAlongPair(Number(id), entry), state: 'ok' as const, repaired: false })),
        ),
    },
  };
}
