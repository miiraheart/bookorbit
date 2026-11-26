import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

import { READ_ALOUD_PAIRS_SETTING_KEY, setReadAlongPair, type ReadAlongPairEntry } from './read-aloud-pairs-store';
import { pickFileByHash, ReadAloudPairsRepository, type ReadAlongPairFileRow } from './read-aloud-pairs.repository';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** An in-memory app_settings row whose only lock is the advisory lock call, like Postgres. */
function makeDb(initial: string | null = null) {
  const state = { value: initial, locked: [] as string[], writes: 0 };
  const selectResults: ReadAlongPairFileRow[][] = [];
  let lockChain: Promise<void> = Promise.resolve();

  const findFirst = vi.fn(async () => {
    const snapshot = state.value;
    await tick();
    return snapshot === null ? undefined : { key: READ_ALOUD_PAIRS_SETTING_KEY, value: snapshot };
  });
  const insert = vi.fn(() => ({
    values: (row: { value: string }) => ({
      onConflictDoUpdate: async () => {
        await tick();
        state.value = row.value;
        state.writes += 1;
      },
    }),
  }));

  const db = {
    query: { appSettings: { findFirst } },
    select: vi.fn(() => ({ from: () => ({ where: () => Promise.resolve(selectResults.shift() ?? []) }) })),
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      let release = () => {};
      const tx = {
        execute: vi.fn(async (query: SQL) => {
          state.locked.push(new PgDialect().sqlToQuery(query).sql);
          const previous = lockChain;
          lockChain = new Promise<void>((resolve) => (release = resolve));
          await previous;
        }),
        query: { appSettings: { findFirst } },
        insert,
      };
      try {
        return await callback(tx);
      } finally {
        release();
      }
    }),
  };
  return { db, state, selectResults };
}

const entry: ReadAlongPairEntry = {
  ebookBookId: 2614,
  ebookFileId: 11728,
  fileHash: 'hash-circe',
  pairedAt: '2026-11-26T10:00:00.000Z',
  pairedBy: 1,
};
const file = (overrides: Partial<ReadAlongPairFileRow> = {}): ReadAlongPairFileRow => ({
  id: 11728,
  bookId: 2614,
  format: 'epub',
  role: 'content',
  fileHash: 'hash-circe',
  ...overrides,
});

function storedValue(pairs: Record<number, ReadAlongPairEntry>): string {
  const store = { version: 1 as const, pairs: {}, dismissed: {} };
  for (const [id, value] of Object.entries(pairs)) setReadAlongPair(store, Number(id), value);
  return JSON.stringify(store);
}

describe('ReadAloudPairsRepository storage', () => {
  it('round trips a pair through app_settings', async () => {
    const { db, state } = makeDb();
    const repo = new ReadAloudPairsRepository(db as never);
    await repo.update((store) => setReadAlongPair(store, 2238, entry));
    expect(JSON.parse(state.value!)).toEqual({ version: 1, pairs: { '2238': entry }, dismissed: {} });
    expect((await repo.read()).pairs['2238'].ebookFileId).toBe(11728);
  });

  it('takes the advisory lock before reading, so concurrent writes keep each other (mock-level check)', async () => {
    const { db, state } = makeDb();
    const repo = new ReadAloudPairsRepository(db as never);
    await Promise.all([
      repo.update((store) => setReadAlongPair(store, 2238, entry)),
      repo.update((store) => setReadAlongPair(store, 2254, { ...entry, ebookBookId: 2699, ebookFileId: 12218 })),
    ]);
    expect(Object.keys(JSON.parse(state.value!).pairs).sort()).toEqual(['2238', '2254']);
    expect(state.locked).toHaveLength(2);
    expect(state.locked[0]).toContain('pg_advisory_xact_lock(hashtext(');
  });

  it('refuses to write over a value it cannot read', async () => {
    const { db, state } = makeDb('{broken');
    const repo = new ReadAloudPairsRepository(db as never);
    await expect(repo.update((store) => setReadAlongPair(store, 2238, entry))).rejects.toThrow();
    expect(state.value).toBe('{broken');
  });
});

describe('ReadAloudPairsRepository.resolvePairs', () => {
  it('keeps a pair whose file is still the epub content file', async () => {
    const { db, state, selectResults } = makeDb(storedValue({ 2238: entry }));
    selectResults.push([file()]);
    const [resolved] = await new ReadAloudPairsRepository(db as never).resolvePairs();
    expect(resolved).toMatchObject({ state: 'ok', repaired: false, pair: { audiobookBookId: 2238, ebookFileId: 11728 } });
    expect(state.writes).toBe(0);
  });

  it('moves a pair to the file with the same hash when the file id is gone', async () => {
    const { db, state, selectResults } = makeDb(storedValue({ 2238: entry }));
    selectResults.push([], [file({ id: 30001, bookId: 2712 }), file({ id: 30000, bookId: 2614 })]);
    const [resolved] = await new ReadAloudPairsRepository(db as never).resolvePairs();
    expect(resolved).toMatchObject({ state: 'ok', repaired: true, pair: { ebookBookId: 2614, ebookFileId: 30000 } });
    expect(JSON.parse(state.value!).pairs['2238']).toMatchObject({ ebookBookId: 2614, ebookFileId: 30000, fileHash: 'hash-circe' });
  });

  it('follows the hash to another book when the ebook record was merged away', async () => {
    const { db, selectResults } = makeDb(storedValue({ 2238: entry }));
    selectResults.push([file({ bookId: 3757 })], [file({ bookId: 3757 })]);
    const [resolved] = await new ReadAloudPairsRepository(db as never).resolvePairs();
    expect(resolved.pair).toMatchObject({ ebookBookId: 3757, ebookFileId: 11728 });
    expect(resolved.repaired).toBe(true);
  });

  it('reports needs_attention when nothing carries the hash, and keeps the pair', async () => {
    const { db, state, selectResults } = makeDb(storedValue({ 2238: entry }));
    selectResults.push([file({ format: 'kepub' })], []);
    const [resolved] = await new ReadAloudPairsRepository(db as never).resolvePairs();
    expect(resolved.state).toBe('needs_attention');
    expect(JSON.parse(state.value!).pairs['2238']).toBeDefined();
  });

  it('only resolves the requested audiobooks', async () => {
    const { db, selectResults } = makeDb(storedValue({ 2238: entry, 2254: { ...entry, ebookBookId: 2699, ebookFileId: 12218 } }));
    selectResults.push([file({ id: 12218, bookId: 2699 })]);
    const resolved = await new ReadAloudPairsRepository(db as never).resolvePairs([2254]);
    expect(resolved.map((item) => item.pair.audiobookBookId)).toEqual([2254]);
  });
});

describe('pickFileByHash', () => {
  it('prefers the same book, then the lowest ids, and never the audiobook itself', () => {
    const rows = [file({ id: 5, bookId: 9 }), file({ id: 4, bookId: 8 }), file({ id: 3, bookId: 2238 }), file({ id: 7, bookId: 2614 })];
    expect(pickFileByHash(rows, entry, 2238)?.id).toBe(7);
    expect(pickFileByHash(rows.slice(0, 3), entry, 2238)?.id).toBe(4);
    expect(pickFileByHash(rows, { ...entry, fileHash: null }, 2238)).toBeNull();
  });
});
