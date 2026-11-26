import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { ReadAlongPair } from '@bookorbit/types';

import { DB } from '../../db';
import * as schema from '../../db/schema';
import {
  parseReadAlongPairsStore,
  READ_ALOUD_PAIRS_SETTING_KEY,
  serializeReadAlongPairsStore,
  toReadAlongPair,
  unreadableKeys,
  type ReadAlongPairEntry,
  type ReadAlongPairsStore,
} from './read-aloud-pairs-store';

type Db = NodePgDatabase<typeof schema>;

export type ReadAlongPairFileRow = {
  id: number;
  bookId: number;
  format: string | null;
  role: string;
  fileHash: string | null;
  mediaOverlayAvailable: boolean;
  libraryId?: number | null;
};

/** Where a paired ebook record is now: its library, or the book it was merged into when it is gone. */
export type ReadAlongPairOrigin = { libraryId: number | null; mergedInto: number | null };

export type ResolvedReadAlongPair = { pair: ReadAlongPair; state: 'ok' | 'needs_attention'; repaired: boolean };

const fileColumns = {
  id: schema.bookFiles.id,
  bookId: schema.bookFiles.bookId,
  format: schema.bookFiles.format,
  role: schema.bookFiles.role,
  fileHash: schema.bookFiles.fileHash,
  mediaOverlayAvailable: schema.bookFiles.mediaOverlayAvailable,
};

export function isPairableEpubFile(file: ReadAlongPairFileRow | undefined, ebookBookId: number): boolean {
  return (
    file !== undefined &&
    file.bookId === ebookBookId &&
    file.format?.toLowerCase() === 'epub' &&
    file.role === 'content' &&
    !file.mediaOverlayAvailable
  );
}

/**
 * The same book's copy first, then the lowest book and file id, so a hash shared by many books
 * resolves the same way every time. Another book only counts in the paired ebook's own library,
 * or, once that record was merged away, the book it was merged into: a hash never moves a pair
 * into a library nobody chose.
 */
export function pickFileByHash(
  rows: readonly ReadAlongPairFileRow[],
  entry: ReadAlongPairEntry,
  audiobookBookId: number,
  origin: ReadAlongPairOrigin = { libraryId: null, mergedInto: null },
): ReadAlongPairFileRow | null {
  if (!entry.fileHash) return null;
  const allowed = (row: ReadAlongPairFileRow) =>
    row.bookId === entry.ebookBookId || (origin.libraryId !== null ? row.libraryId === origin.libraryId : row.bookId === origin.mergedInto);
  const matches = rows
    .filter((row) => row.fileHash === entry.fileHash && row.bookId !== audiobookBookId && isPairableEpubFile(row, row.bookId) && allowed(row))
    .sort((a, b) => Number(b.bookId === entry.ebookBookId) - Number(a.bookId === entry.ebookBookId) || a.bookId - b.bookId || a.id - b.id);
  return matches[0] ?? null;
}

@Injectable()
export class ReadAloudPairsRepository {
  private readonly logger = new Logger(ReadAloudPairsRepository.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  async read(): Promise<ReadAlongPairsStore> {
    const row = await this.db.query.appSettings.findFirst({ where: eq(schema.appSettings.key, READ_ALOUD_PAIRS_SETTING_KEY) });
    const store = parseReadAlongPairsStore(row?.value);
    const skipped = unreadableKeys(store);
    if (skipped.length > 0) {
      this.logger.warn(`[read_aloud.pairs] [skip] keys=${skipped.join(',')} - unreadable entries kept as stored and left out`);
    }
    return store;
  }

  /** Read-modify-write under an advisory lock, which also covers the first write when the row does not exist yet. */
  async update<T>(apply: (store: ReadAlongPairsStore) => T): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${READ_ALOUD_PAIRS_SETTING_KEY})::bigint)`);
      const row = await tx.query.appSettings.findFirst({ where: eq(schema.appSettings.key, READ_ALOUD_PAIRS_SETTING_KEY) });
      const store = parseReadAlongPairsStore(row?.value);
      const result = apply(store);
      const value = serializeReadAlongPairsStore(store);
      await tx
        .insert(schema.appSettings)
        .values({ key: READ_ALOUD_PAIRS_SETTING_KEY, value })
        .onConflictDoUpdate({ target: schema.appSettings.key, set: { value } });
      return result;
    });
  }

  async findFiles(fileIds: readonly number[]): Promise<ReadAlongPairFileRow[]> {
    if (fileIds.length === 0) return [];
    return this.db
      .select(fileColumns)
      .from(schema.bookFiles)
      .where(inArray(schema.bookFiles.id, [...new Set(fileIds)]));
  }

  private async findEpubFilesByHash(hashes: readonly string[]): Promise<ReadAlongPairFileRow[]> {
    if (hashes.length === 0) return [];
    const result = await this.db.execute<{
      id: number;
      book_id: number;
      format: string | null;
      role: string;
      file_hash: string | null;
      library_id: number;
    }>(sql`
      SELECT f.id, f.book_id, f.format, f.role, f.file_hash, b.library_id
      FROM book_files f JOIN books b ON b.id = f.book_id
      WHERE f.file_hash = ANY(${sql.param([...new Set(hashes)])}::text[])
        AND lower(f.format) = 'epub' AND f.role = 'content' AND NOT f.media_overlay_available
    `);
    return result.rows.map((row) => ({
      id: row.id,
      bookId: row.book_id,
      format: row.format,
      role: row.role,
      fileHash: row.file_hash,
      mediaOverlayAvailable: false,
      libraryId: row.library_id,
    }));
  }

  private async findOrigins(bookIds: readonly number[]): Promise<Map<number, ReadAlongPairOrigin>> {
    if (bookIds.length === 0) return new Map();
    const result = await this.db.execute<{ id: number; library_id: number | null; merged_into: number | null }>(sql`
      SELECT o.id, b.library_id, m.target_book_id AS merged_into
      FROM unnest(${sql.param([...new Set(bookIds)])}::int[]) AS o(id)
      LEFT JOIN books b ON b.id = o.id
      LEFT JOIN book_merges m ON m.source_book_id = o.id
    `);
    return new Map(result.rows.map((row) => [row.id, { libraryId: row.library_id, mergedInto: row.merged_into }]));
  }

  /**
   * Checks every stored pair against `book_files`. A pair whose file is gone or changed is moved to
   * the file with the same hash (a rescan or merge gives the file a new id); one that cannot be
   * found is reported as needing attention, never dropped.
   */
  async resolvePairs(audiobookBookIds?: readonly number[]): Promise<ResolvedReadAlongPair[]> {
    const store = await this.read();
    const wanted = audiobookBookIds ? new Set(audiobookBookIds) : null;
    const entries = Object.entries(store.pairs)
      .map(([id, entry]) => [Number(id), entry] as const)
      .filter(([id]) => !wanted || wanted.has(id));
    if (entries.length === 0) return [];

    const files = new Map((await this.findFiles(entries.map(([, entry]) => entry.ebookFileId))).map((file) => [file.id, file]));
    const stale = entries.filter(([, entry]) => !isPairableEpubFile(files.get(entry.ebookFileId), entry.ebookBookId));
    const hashed = stale.filter(([, entry]) => Boolean(entry.fileHash));
    const [hashRows, origins] = await Promise.all([
      this.findEpubFilesByHash(hashed.map(([, entry]) => entry.fileHash!)),
      this.findOrigins(hashed.map(([, entry]) => entry.ebookBookId)),
    ]);

    const repairs = new Map<number, ReadAlongPairFileRow>();
    for (const [id, entry] of stale) {
      const found = pickFileByHash(hashRows, entry, id, origins.get(entry.ebookBookId));
      if (found) repairs.set(id, found);
    }
    const applied = repairs.size > 0 ? await this.applyRepairs(entries, repairs) : new Map<number, ReadAlongPairEntry>();

    const staleIds = new Set(stale.map(([id]) => id));
    return entries.map(([id, entry]) => {
      const repaired = applied.get(id);
      if (repaired) return { pair: toReadAlongPair(id, repaired), state: 'ok', repaired: true };
      return { pair: toReadAlongPair(id, entry), state: staleIds.has(id) ? 'needs_attention' : 'ok', repaired: false };
    });
  }

  private applyRepairs(
    entries: ReadonlyArray<readonly [number, ReadAlongPairEntry]>,
    repairs: ReadonlyMap<number, ReadAlongPairFileRow>,
  ): Promise<Map<number, ReadAlongPairEntry>> {
    const seen = new Map(entries);
    return this.update((current) => {
      const applied = new Map<number, ReadAlongPairEntry>();
      for (const [id, file] of repairs) {
        const before = seen.get(id);
        const now = current.pairs[String(id)];
        if (!before || !now || now.ebookFileId !== before.ebookFileId || now.ebookBookId !== before.ebookBookId) continue;
        const next = { ...now, ebookBookId: file.bookId, ebookFileId: file.id };
        current.pairs[String(id)] = next;
        applied.set(id, next);
      }
      return applied;
    });
  }
}
