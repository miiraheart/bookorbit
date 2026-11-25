import { Injectable, Logger } from '@nestjs/common';
import type { GoodreadsOverview, GoodreadsShelfItem, GoodreadsShelfPage } from '@bookorbit/types';

import type { ListGoodreadsItemsDto, ReplaceGoodreadsSnapshotDto } from './dto';
import { GoodreadsRepository } from './goodreads.repository';

/** Goodreads' own shelves first, in reading order; any custom shelf follows alphabetically. */
const SHELF_ORDER = ['currently-reading', 'read-next', 'to-read', 'next-in-series', 'read'];
const DEFAULT_LIMIT = 50;

interface Snapshot {
  lastSyncedAt: string | null;
  syncRequestedAt: string | null;
  items: GoodreadsShelfItem[];
}

function fold(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

function shelfRank(name: string): number {
  const index = SHELF_ORDER.indexOf(name);
  return index === -1 ? SHELF_ORDER.length : index;
}

@Injectable()
export class GoodreadsService {
  private readonly logger = new Logger(GoodreadsService.name);

  constructor(private readonly repo: GoodreadsRepository) {}

  private async load(userId: number): Promise<Snapshot> {
    const data = await this.repo.findSnapshot(userId);
    return {
      lastSyncedAt: typeof data?.lastSyncedAt === 'string' ? data.lastSyncedAt : null,
      syncRequestedAt: typeof data?.syncRequestedAt === 'string' ? data.syncRequestedAt : null,
      items: Array.isArray(data?.items) ? (data.items as GoodreadsShelfItem[]) : [],
    };
  }

  async getOverview(userId: number): Promise<GoodreadsOverview> {
    const snapshot = await this.load(userId);
    const counts = new Map<string, number>();
    for (const item of snapshot.items) for (const shelf of item.shelves) counts.set(shelf, (counts.get(shelf) ?? 0) + 1);
    const shelves = [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => shelfRank(a.name) - shelfRank(b.name) || a.name.localeCompare(b.name));
    return { lastSyncedAt: snapshot.lastSyncedAt, syncRequestedAt: snapshot.syncRequestedAt, total: snapshot.items.length, shelves };
  }

  async listItems(userId: number, query: ListGoodreadsItemsDto): Promise<GoodreadsShelfPage> {
    const snapshot = await this.load(userId);
    const needle = fold(query.q?.trim() ?? '');
    const matching = snapshot.items.filter(
      (item) => item.shelves.includes(query.shelf) && (!needle || fold(`${item.title} ${item.authors.join(' ')}`).includes(needle)),
    );
    const offset = query.offset ?? 0;
    const page = matching.slice(offset, offset + (query.limit ?? DEFAULT_LIMIT));
    const requests = await this.repo.findRequests(
      userId,
      page.map((item) => item.goodreadsId ?? item.key),
    );
    return {
      total: matching.length,
      items: page.map((item) => ({ ...item, request: requests.get(item.goodreadsId ?? item.key) ?? null })),
    };
  }

  async replaceSnapshot(userId: number, dto: ReplaceGoodreadsSnapshotDto): Promise<GoodreadsOverview> {
    const startedAt = Date.now();
    const previous = await this.load(userId);
    const items: GoodreadsShelfItem[] = dto.items.map((item) => ({
      key: item.key,
      goodreadsId: item.goodreadsId ?? null,
      title: item.title,
      authors: item.authors,
      rating: item.rating ? item.rating : null,
      isbn13: item.isbn13 ?? null,
      coverUrl: item.coverUrl ?? null,
      readAt: item.readAt ?? null,
      shelves: [...new Set(item.shelves)],
      bookIds: [...new Set(item.bookIds)],
    }));
    await this.repo.saveSnapshot(userId, {
      lastSyncedAt: new Date().toISOString(),
      syncRequestedAt: previous.syncRequestedAt,
      items,
    });
    this.logger.log(
      `[goodreads.replace_snapshot] [end] userId=${userId} durationMs=${Date.now() - startedAt} items=${items.length} - goodreads shelves replaced`,
    );
    return this.getOverview(userId);
  }

  /** Recorded for the sync job, which polls for it and runs within a minute. */
  async requestSync(userId: number): Promise<GoodreadsOverview> {
    const snapshot = await this.load(userId);
    await this.repo.saveSnapshot(userId, { ...snapshot, syncRequestedAt: new Date().toISOString() });
    return this.getOverview(userId);
  }
}
