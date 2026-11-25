import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { GoodreadsShelfItem } from '@bookorbit/types';

import { GoodreadsService, parseGoodreadsSource } from './goodreads.service';
import type { GoodreadsRepository } from './goodreads.repository';

function item(overrides: Partial<GoodreadsShelfItem>): GoodreadsShelfItem {
  return {
    key: '1',
    goodreadsId: '1',
    title: 'Title',
    authors: ['Author'],
    rating: null,
    isbn13: null,
    coverUrl: null,
    readAt: null,
    shelves: ['to-read'],
    bookIds: [],
    ...overrides,
  };
}

describe('parseGoodreadsSource', () => {
  it('reads profile links, list links and bare ids', () => {
    expect(parseGoodreadsSource('https://www.goodreads.com/user/show/152291144-miiraheart')).toEqual({ kind: 'user', ref: '152291144' });
    expect(parseGoodreadsSource('goodreads.com/review/list/42?shelf=read')).toEqual({ kind: 'user', ref: '42' });
    expect(parseGoodreadsSource('https://www.goodreads.com/list/show/1.Best_Books_Ever')).toEqual({ kind: 'list', ref: '1' });
    expect(parseGoodreadsSource(' 77 ')).toEqual({ kind: 'user', ref: '77' });
  });

  it('refuses anything else', () => {
    expect(() => parseGoodreadsSource('https://example.com/list/show/1')).toThrow(BadRequestException);
  });
});

describe('GoodreadsService', () => {
  let stored: Record<string, unknown> | null;
  let repo: { findSnapshot: ReturnType<typeof vi.fn>; saveSnapshot: ReturnType<typeof vi.fn>; findRequests: ReturnType<typeof vi.fn> };
  let service: GoodreadsService;

  beforeEach(() => {
    stored = null;
    repo = {
      findSnapshot: vi.fn(() => Promise.resolve(stored ? structuredClone(stored) : null)),
      saveSnapshot: vi.fn((_userId: number, data: Record<string, unknown>) => {
        stored = structuredClone(data);
        return Promise.resolve();
      }),
      findRequests: vi.fn(() => Promise.resolve(new Map())),
    };
    service = new GoodreadsService(repo as unknown as GoodreadsRepository);
  });

  it('starts with only her own source and no books', async () => {
    const overview = await service.getOverview(7);
    expect(overview.total).toBe(0);
    expect(overview.sources.map((source) => [source.id, source.own, source.total])).toEqual([['me', true, 0]]);
  });

  it('counts each shelf and orders Goodreads shelves before custom ones', async () => {
    await service.replaceSnapshot(7, {
      items: [
        item({ key: 'a', shelves: ['read', 'favourites'] }),
        item({ key: 'b', shelves: ['to-read'] }),
        item({ key: 'c', shelves: ['currently-reading', 'to-read'] }),
      ],
    });
    const [own] = (await service.getOverview(7)).sources;
    expect(own?.total).toBe(3);
    expect(own?.shelves.map((shelf) => [shelf.name, shelf.count])).toEqual([
      ['currently-reading', 1],
      ['to-read', 2],
      ['read', 1],
      ['favourites', 1],
    ]);
  });

  it('reads a snapshot saved before sources existed as her own shelves', async () => {
    stored = { lastSyncedAt: '2026-11-25T20:00:00.000Z', syncRequestedAt: null, items: [item({ key: 'a' })] };
    const overview = await service.getOverview(7);
    expect(overview.sources[0]).toMatchObject({ id: 'me', total: 1, newCount: 0 });
    const page = await service.listItems(7, { shelf: 'to-read' });
    expect(page.items[0]).toMatchObject({ source: 'me', firstSeenAt: '2026-11-25T20:00:00.000Z', isNew: false });
  });

  it('marks only books first seen in the latest sync as new, and keeps their first-seen date', async () => {
    await service.replaceSnapshot(7, { items: [item({ key: 'a', goodreadsId: 'a' })] });
    const firstPage = await service.listItems(7, { shelf: 'to-read' });
    expect(firstPage.items[0]?.isNew).toBe(false);
    const firstSeenA = firstPage.items[0]?.firstSeenAt;

    await new Promise((resolve) => setTimeout(resolve, 5));
    await service.replaceSnapshot(7, { items: [item({ key: 'a', goodreadsId: 'a' }), item({ key: 'b', goodreadsId: 'b', title: 'Zebra' })] });
    const page = await service.listItems(7, { shelf: 'to-read' });
    expect(page.items.map((row) => [row.key, row.isNew])).toEqual([
      ['b', true],
      ['a', false],
    ]);
    expect(page.items[1]?.firstSeenAt).toBe(firstSeenA);
    expect((await service.getOverview(7)).sources[0]?.newCount).toBe(1);
  });

  it('sorts by title and author on request, newest first by default', async () => {
    await service.replaceSnapshot(7, {
      items: [item({ key: 'a', title: 'Beta', authors: ['Zola'] }), item({ key: 'b', title: 'Alpha', authors: ['Yourcenar'] })],
    });
    expect((await service.listItems(7, { shelf: 'to-read', sort: 'title' })).items.map((row) => row.key)).toEqual(['b', 'a']);
    expect((await service.listItems(7, { shelf: 'to-read', sort: 'author' })).items.map((row) => row.key)).toEqual(['b', 'a']);
  });

  it('filters one shelf by accent-free search', async () => {
    await service.replaceSnapshot(7, {
      items: [
        item({ key: 'a', goodreadsId: 'a', title: 'Les Misérables', authors: ['Victor Hugo'] }),
        item({ key: 'b', goodreadsId: 'b', title: 'Dune', authors: ['Frank Herbert'] }),
      ],
    });
    const page = await service.listItems(7, { shelf: 'to-read', q: 'miserables', limit: 10 });
    expect(page.total).toBe(1);
    expect(page.items[0]?.title).toBe('Les Misérables');
  });

  it('attaches the newest request made for a book from this page', async () => {
    repo.findRequests.mockResolvedValue(new Map([['b', { id: 42, status: 'pending' }]]));
    await service.replaceSnapshot(7, { items: [item({ key: 'a', goodreadsId: 'a' }), item({ key: 'b', goodreadsId: 'b' })] });
    const page = await service.listItems(7, { shelf: 'to-read', sort: 'title' });
    expect(page.items.find((row) => row.key === 'b')?.request).toEqual({ id: 42, status: 'pending' });
    expect(page.items.find((row) => row.key === 'a')?.request).toBeNull();
  });

  it('follows a list, keeps its books apart, and removes them with the source', async () => {
    const added = await service.addSource(7, { url: 'https://www.goodreads.com/list/show/264.Books_That_Everyone_Should_Read' });
    expect(added.syncRequestedAt).not.toBeNull();
    expect(added.sources.map((source) => [source.id, source.kind, source.name])).toEqual([
      ['me', 'user', 'My shelves'],
      ['list-264', 'list', 'List 264'],
    ]);
    await service.replaceSnapshot(7, {
      source: 'list-264',
      sourceName: 'Books That Everyone Should Read',
      items: [item({ key: 'x', shelves: ['list'] })],
    });
    await service.replaceSnapshot(7, { items: [item({ key: 'a' })] });
    const overview = await service.getOverview(7);
    expect(overview.sources.map((source) => [source.name, source.total])).toEqual([
      ['My shelves', 1],
      ['Books That Everyone Should Read', 1],
    ]);
    expect((await service.listItems(7, { source: 'list-264', shelf: 'list' })).total).toBe(1);

    const removed = await service.removeSource(7, 'list-264');
    expect(removed.sources.map((source) => source.id)).toEqual(['me']);
    expect(removed.total).toBe(1);
  });

  it('keeps a renamed source name across syncs', async () => {
    await service.addSource(7, { url: '42' });
    await service.renameSource(7, 'user-42', 'Alice');
    await service.replaceSnapshot(7, { source: 'user-42', sourceName: 'alice_reads', items: [] });
    expect((await service.getOverview(7)).sources[1]?.name).toBe('Alice');
  });

  it('refuses duplicates, her own account, and removing her own shelves', async () => {
    await service.replaceSnapshot(7, { sourceRef: '152291144', items: [] });
    await expect(service.addSource(7, { url: '152291144' })).rejects.toBeInstanceOf(ConflictException);
    await service.addSource(7, { url: '42' });
    await expect(service.addSource(7, { url: 'https://www.goodreads.com/user/show/42-x' })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.removeSource(7, 'me')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records a failed sync without dropping the books it had', async () => {
    await service.replaceSnapshot(7, { items: [item({ key: 'a' })] });
    await service.replaceSnapshot(7, { error: 'HTTP 503' });
    const [own] = (await service.getOverview(7)).sources;
    expect(own).toMatchObject({ total: 1, lastError: 'HTTP 503' });
  });

  it('keeps a pending sync request across a snapshot replace', async () => {
    await service.requestSync(7);
    const requestedAt = (await service.getOverview(7)).syncRequestedAt;
    expect(requestedAt).not.toBeNull();
    await service.replaceSnapshot(7, { items: [item({ rating: 0, shelves: ['read', 'read'], bookIds: [3, 3] })] });
    expect((await service.getOverview(7)).syncRequestedAt).toBe(requestedAt);
    const page = await service.listItems(7, { shelf: 'read' });
    expect(page.items[0]).toMatchObject({ rating: null, shelves: ['read'], bookIds: [3] });
  });
});
