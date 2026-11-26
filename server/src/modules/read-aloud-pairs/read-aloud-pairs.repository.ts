import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { ReadAlongPair } from '@bookorbit/types';

import { DB } from '../../db';
import * as schema from '../../db/schema';
import {
  parseReadAlongPairsStore,
  READ_ALOUD_PAIRS_SETTING_KEY,
  serializeReadAlongPairsStore,
  toReadAlongPair,
  type ReadAlongPairEntry,
  type ReadAlongPairsStore,
} from './read-aloud-pairs-store';

type Db = NodePgDatabase<typeof schema>;

export type ReadAlongPairFileRow = { id: number; bookId: number; format: string | null; role: string; fileHash: string | null };

export type ResolvedReadAlongPair = { pair: ReadAlongPair; state: 'ok' | 'needs_attention'; repaired: boolean };

const fileColumns = {
  id: schema.bookFiles.id,
  bookId: schema.bookFiles.bookId,
  format: schema.bookFiles.format,
  role: schema.bookFiles.role,
  fileHash: schema.bookFiles.fileHash,
};

export function isPairableEpubFile(file: ReadAlongPairFileRow | undefined, ebookBookId: number): boolean {
  return file !== undefined && file.bookId === ebookBookId && file.format?.toLowerCase() === 'epub' && file.role === 'content';
}

/** The same book's copy first, then the lowest book and file id, so a hash shared by many books resolves the same way every time. */
export function pickFileByHash(
  rows: readonly ReadAlongPairFileRow[],
  entry: ReadAlongPairEntry,
  audiobookBookId: number,
): ReadAlongPairFileRow | null {
  if (!entry.fileHash) return null;
  const matches = rows
    .filter((row) => row.fileHash === entry.fileHash && row.bookId !== audiobookBookId && isPairableEpubFile(row, row.bookId))
    .sort((a, b) => Number(b.bookId === entry.ebookBookId) - Number(a.bookId === entry.ebookBookId) || a.bookId - b.bookId || a.id - b.id);
  return matches[0] ?? null;
}

@Injectable()
export class ReadAloudPairsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async read(): Promise<ReadAlongPairsStore> {
    const row = await this.db.query.appSettings.findFirst({ where: eq(schema.appSettings.key, READ_ALOUD_PAIRS_SETTING_KEY) });
    return parseReadAlongPairsStore(row?.value);
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
    return this.db
      .select(fileColumns)
      .from(schema.bookFiles)
      .where(
        and(
          inArray(schema.bookFiles.fileHash, [...new Set(hashes)]),
          sql`lower(${schema.bookFiles.format}) = 'epub'`,
          eq(schema.bookFiles.role, 'content'),
        ),
      );
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
    const hashRows = await this.findEpubFilesByHash(stale.map(([, entry]) => entry.fileHash).filter((hash): hash is string => Boolean(hash)));

    const repairs = new Map<number, ReadAlongPairFileRow>();
    for (const [id, entry] of stale) {
      const found = pickFileByHash(hashRows, entry, id);
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
