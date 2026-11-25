import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { GoodreadsShelfItem } from '@bookorbit/types';

import { GoodreadsService } from './goodreads.service';
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

describe('GoodreadsService', () => {
  let stored: Record<string, unknown> | null;
  let repo: { findSnapshot: ReturnType<typeof vi.fn>; saveSnapshot: ReturnType<typeof vi.fn>; findRequests: ReturnType<typeof vi.fn> };
  let service: GoodreadsService;

  beforeEach(() => {
    stored = null;
    repo = {
      findSnapshot: vi.fn(() => Promise.resolve(stored)),
      saveSnapshot: vi.fn((_userId: number, data: Record<string, unknown>) => {
        stored = data;
        return Promise.resolve();
      }),
      findRequests: vi.fn(() => Promise.resolve(new Map())),
    };
    service = new GoodreadsService(repo as unknown as GoodreadsRepository);
  });

  it('starts empty before the first sync', async () => {
    await expect(service.getOverview(7)).resolves.toEqual({ lastSyncedAt: null, syncRequestedAt: null, total: 0, shelves: [] });
  });

  it('counts each shelf and orders Goodreads shelves before custom ones', async () => {
    await service.replaceSnapshot(7, {
      items: [
        item({ key: 'a', shelves: ['read', 'favourites'] }),
        item({ key: 'b', shelves: ['to-read'] }),
        item({ key: 'c', shelves: ['currently-reading', 'to-read'] }),
      ],
    });
    const overview = await service.getOverview(7);
    expect(overview.total).toBe(3);
    expect(overview.lastSyncedAt).not.toBeNull();
    expect(overview.shelves).toEqual([
      { name: 'currently-reading', count: 1 },
      { name: 'to-read', count: 2 },
      { name: 'read', count: 1 },
      { name: 'favourites', count: 1 },
    ]);
  });

  it('filters one shelf by accent-free search and pages it', async () => {
    await service.replaceSnapshot(7, {
      items: [
        item({ key: 'a', goodreadsId: 'a', title: 'Les Misérables', authors: ['Victor Hugo'] }),
        item({ key: 'b', goodreadsId: 'b', title: 'Dune', authors: ['Frank Herbert'] }),
        item({ key: 'c', goodreadsId: 'c', title: 'Misery', authors: ['Stephen King'], shelves: ['read'] }),
      ],
    });
    const page = await service.listItems(7, { shelf: 'to-read', q: 'miserables', limit: 10 });
    expect(page.total).toBe(1);
    expect(page.items[0]?.title).toBe('Les Misérables');
  });

  it('attaches the newest request made for a book from this page', async () => {
    repo.findRequests.mockResolvedValue(new Map([['b', { id: 42, status: 'pending' }]]));
    await service.replaceSnapshot(7, { items: [item({ key: 'a', goodreadsId: 'a' }), item({ key: 'b', goodreadsId: 'b' })] });
    const page = await service.listItems(7, { shelf: 'to-read' });
    expect(repo.findRequests).toHaveBeenCalledWith(7, ['a', 'b']);
    expect(page.items.map((row) => row.request)).toEqual([null, { id: 42, status: 'pending' }]);
  });

  it('keeps a pending sync request across a snapshot replace and records new ones', async () => {
    await service.requestSync(7);
    const requestedAt = (await service.getOverview(7)).syncRequestedAt;
    expect(requestedAt).not.toBeNull();
    await service.replaceSnapshot(7, { items: [item({ rating: 0, shelves: ['read', 'read'], bookIds: [3, 3] })] });
    const overview = await service.getOverview(7);
    expect(overview.syncRequestedAt).toBe(requestedAt);
    const page = await service.listItems(7, { shelf: 'read' });
    expect(page.items[0]).toMatchObject({ rating: null, shelves: ['read'], bookIds: [3] });
  });
});
