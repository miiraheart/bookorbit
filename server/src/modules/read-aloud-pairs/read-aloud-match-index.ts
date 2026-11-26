import { Injectable } from '@nestjs/common';
import { normalizeWorkToken, type ReadAlongCandidate } from '@bookorbit/types';

import type { RequestUser } from '../../common/types/request-user';
import { LibraryService } from '../library/library.service';
import { canonicalizeIsbn } from '../book-duplicates/book-duplicate-normalize';
import { compareReadAlongLanguages, personAuthors, personSurname, personTokenKey, readAlongTitleKeys } from './read-aloud-match-keys';
import {
  rankReadAlongCandidates,
  type RankReadAlongOptions,
  type ReadAlongAudioBook,
  type ReadAlongEbookBook,
  type ReadAlongMatchBook,
} from './read-aloud-match-score';
import { ReadAloudMatchIndexRepository, type ReadAlongCorpusRow } from './read-aloud-match-index.repository';

export const READ_ALONG_INDEX_TTL_MS = 5 * 60 * 1000;
const SEARCH_LIMIT = 40;

export type ReadAlongIndexedAudio = ReadAlongAudioBook & { ownEpubFileId: number | null };

type Corpus = {
  audio: ReadAlongIndexedAudio[];
  ebooks: ReadAlongEbookBook[];
  buckets: Map<string, ReadAlongEbookBook[]>;
};

function workIds(row: ReadAlongCorpusRow): string[] {
  return [
    row.hardcover_id?.trim() ? `hc:${row.hardcover_id.trim()}` : null,
    row.open_library_id?.trim() ? `ol:${row.open_library_id.trim()}` : null,
    row.goodreads_id?.trim() ? `gr:${row.goodreads_id.trim()}` : null,
  ].filter((id): id is string => id !== null);
}

function toMatchBook(row: ReadAlongCorpusRow): ReadAlongMatchBook {
  return {
    bookId: row.id,
    libraryId: row.library_id,
    libraryName: row.library_name,
    title: row.title ?? '',
    subtitle: row.subtitle,
    authors: row.authors ?? [],
    isbn10: row.isbn10,
    isbn13: row.isbn13,
    workIds: workIds(row),
    language: row.language,
    seriesName: row.series_name,
    seriesIndex: row.series_index,
    abridged: row.abridged,
  };
}

/**
 * Keys that every candidate the scorer can accept shares with its audiobook: a title key (full,
 * head, tail or title plus subtitle, since those compare with the other side's full title), an
 * ISBN, a work id, or an author for fuzzy titles, which the scorer only keeps when an author
 * overlaps. Authors are keyed by all their words and by family name, since "Robin Kimmerer" and
 * "Robin Wall Kimmerer" are the same person to the scorer.
 */
export function readAlongBucketKeys(book: ReadAlongMatchBook): string[] {
  const titles = readAlongTitleKeys(book.title, book.subtitle);
  const isbn = canonicalizeIsbn(book.isbn10 ?? null, book.isbn13 ?? null);
  const keys = [
    ...[titles.full, titles.head, titles.tail, titles.joined].filter((key): key is string => Boolean(key)).map((key) => `t:${key}`),
    ...(isbn ? [`i:${isbn}`] : []),
    ...(book.workIds ?? []).map((id) => `w:${id}`),
    ...personAuthors(book.authors)
      .map(personTokenKey)
      .filter(Boolean)
      .map((key) => `a:${key}`),
    ...personAuthors(book.authors)
      .map(personSurname)
      .filter((key): key is string => Boolean(key))
      .map((key) => `s:${key}`),
  ];
  return [...new Set(keys)];
}

/** The other names each audio file goes by, so a copy renamed without its "(Part 1 of 2)" still shows it. */
function audioFileAliases(rows: readonly ReadAlongCorpusRow[]): (row: ReadAlongCorpusRow) => string[] {
  const byHash = new Map<string, Set<string>>();
  for (const row of rows) {
    (row.audio_hashes ?? []).forEach((hash, index) => {
      const name = row.audio_files?.[index];
      if (hash && name) byHash.set(hash, (byHash.get(hash) ?? new Set()).add(name));
    });
  }
  return (row) => {
    const own = new Set(row.audio_files ?? []);
    return [...new Set((row.audio_hashes ?? []).flatMap((hash) => [...(byHash.get(hash) ?? [])]))].filter((name) => !own.has(name));
  };
}

export function buildReadAlongCorpus(rows: readonly ReadAlongCorpusRow[]): Corpus {
  const audio: ReadAlongIndexedAudio[] = [];
  const ebooks: ReadAlongEbookBook[] = [];
  const buckets = new Map<string, ReadAlongEbookBook[]>();
  const aliasesOf = audioFileAliases(rows);
  for (const row of rows) {
    if (row.has_audio) {
      audio.push({
        ...toMatchBook(row),
        durationSeconds: row.audio_seconds,
        audioFiles: row.audio_files ?? [],
        audioFileAliases: aliasesOf(row),
        ownEpubFileId: row.epub_file_id,
      });
      continue;
    }
    if (row.epub_file_id === null) continue;
    const ebook: ReadAlongEbookBook = {
      ...toMatchBook(row),
      fileId: row.epub_file_id,
      metadataScore: row.metadata_score,
      hasMediaOverlay: row.has_overlay,
    };
    ebooks.push(ebook);
    for (const key of readAlongBucketKeys(ebook)) {
      const list = buckets.get(key);
      if (list) list.push(ebook);
      else buckets.set(key, [ebook]);
    }
  }
  return { audio, ebooks, buckets };
}

/** One user's slice of the index: only records they may open, on both sides, before anything is ranked. */
export class ReadAlongIndexView {
  readonly audio: ReadAlongIndexedAudio[];
  private readonly audioById: Map<number, ReadAlongIndexedAudio>;
  private readonly ebookById: Map<number, ReadAlongEbookBook>;

  constructor(
    private readonly corpus: Corpus,
    private readonly visible: ReadonlySet<number>,
  ) {
    this.audio = corpus.audio.filter((book) => visible.has(book.bookId));
    this.audioById = new Map(this.audio.map((book) => [book.bookId, book]));
    this.ebookById = new Map(corpus.ebooks.filter((book) => visible.has(book.bookId)).map((book) => [book.bookId, book]));
  }

  findAudio(bookId: number): ReadAlongIndexedAudio | null {
    return this.audioById.get(bookId) ?? null;
  }

  findEbook(bookId: number): ReadAlongEbookBook | null {
    return this.ebookById.get(bookId) ?? null;
  }

  isVisible(bookId: number): boolean {
    return this.visible.has(bookId);
  }

  candidatesFor(audio: ReadAlongAudioBook, options: RankReadAlongOptions = {}): ReadAlongCandidate[] {
    const pool = new Set<ReadAlongEbookBook>();
    for (const key of readAlongBucketKeys(audio)) {
      for (const ebook of this.corpus.buckets.get(key) ?? []) if (this.visible.has(ebook.bookId)) pool.add(ebook);
    }
    return rankReadAlongCandidates(audio, [...pool], options);
  }

  /**
   * The hand search: titles or authors containing the query, scored with nothing hidden. Copies in
   * a conflicting language are ranked on their own, so they never fold under a copy that agrees.
   */
  search(audio: ReadAlongAudioBook, query: string, dismissed: readonly number[]): ReadAlongCandidate[] {
    const token = normalizeWorkToken(query);
    if (token.length < 2) return [];
    const matches = [...this.ebookById.values()]
      .filter((ebook) => normalizeWorkToken(ebook.title).includes(token) || ebook.authors.some((name) => normalizeWorkToken(name).includes(token)))
      .sort((a, b) => a.title.length - b.title.length || a.bookId - b.bookId)
      .slice(0, SEARCH_LIMIT);
    const conflict = matches.filter((ebook) => compareReadAlongLanguages(audio, ebook) === 'conflict');
    const agreeing = matches.filter((ebook) => !conflict.includes(ebook));
    const options = { dismissedEbookBookIds: dismissed, includeHidden: true };
    return [...rankReadAlongCandidates(audio, agreeing, options), ...rankReadAlongCandidates(audio, conflict, options)];
  }

  /** The dismissed ebooks still visible to this user, scored so the sheet can show them on request. */
  scoreDismissed(audio: ReadAlongAudioBook, dismissed: readonly number[]): ReadAlongCandidate[] {
    const books = dismissed.map((id) => this.ebookById.get(id)).filter((book): book is ReadAlongEbookBook => book !== undefined);
    return books.flatMap((book) => rankReadAlongCandidates(audio, [book], { includeHidden: true }));
  }
}

/**
 * The corpus is the same for everyone, so it is cached unfiltered for five minutes and dropped on
 * every pair or dismissal write. Visibility is applied per request and nothing per user is cached.
 */
@Injectable()
export class ReadAlongMatchIndex {
  private cached: { at: number; corpus: Promise<Corpus> } | null = null;

  constructor(
    private readonly repo: ReadAloudMatchIndexRepository,
    private readonly libraries: LibraryService,
  ) {}

  invalidate(): void {
    this.cached = null;
  }

  async forUser(user: RequestUser): Promise<ReadAlongIndexView> {
    const [corpus, libraryIds] = await Promise.all([this.corpus(), this.libraries.findAccessibleLibraryIds(user)]);
    return new ReadAlongIndexView(corpus, await this.repo.visibleBookIds(user, libraryIds));
  }

  private corpus(): Promise<Corpus> {
    const at = Date.now();
    if (this.cached && at - this.cached.at < READ_ALONG_INDEX_TTL_MS) return this.cached.corpus;
    const corpus = this.repo.loadCorpus().then(buildReadAlongCorpus);
    const entry = { at, corpus };
    this.cached = entry;
    corpus.catch(() => {
      if (this.cached === entry) this.cached = null;
    });
    return corpus;
  }
}
