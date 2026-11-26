import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  GOODREADS_OWN_SOURCE_ID,
  type GoodreadsOverview,
  type GoodreadsShelfItem,
  type GoodreadsShelfPage,
  type GoodreadsShelfSummary,
  type GoodreadsSource,
  type GoodreadsSourceSummary,
  type GoodreadsStoredItem,
} from '@bookorbit/types';

import type { AddGoodreadsSourceDto, ListGoodreadsItemsDto, ReplaceGoodreadsSnapshotDto } from './dto';
import { GoodreadsRepository } from './goodreads.repository';

/** Goodreads' own shelves first, in reading order; any custom shelf follows alphabetically. */
const SHELF_ORDER = ['currently-reading', 'read-next', 'to-read', 'next-in-series', 'read'];
const DEFAULT_LIMIT = 50;
const MAX_SOURCES = 30;
const NEW_FOR_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredSource extends GoodreadsSource {
  /** True once the user renamed it: the sync job then stops overwriting the name. */
  nameLocked?: boolean;
  /** When the first import landed: books already there then are never new, later ones stay new for a week. */
  baselineAt?: string | null;
}

interface Snapshot {
  lastSyncedAt: string | null;
  syncRequestedAt: string | null;
  sources: StoredSource[];
  items: GoodreadsStoredItem[];
}

function fold(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

function shelfRank(name: string): number {
  const index = SHELF_ORDER.indexOf(name);
  return index === -1 ? SHELF_ORDER.length : index;
}

function ownSource(addedAt: string): StoredSource {
  return {
    id: GOODREADS_OWN_SOURCE_ID,
    kind: 'user',
    ref: null,
    name: 'My shelves',
    own: true,
    addedAt,
    lastSyncedAt: null,
    previousSyncedAt: null,
    lastError: null,
  };
}

/** A profile or list link, or a bare member id. Anything else is refused before it reaches the sync job. */
export function parseGoodreadsSource(url: string): { kind: 'user' | 'list'; ref: string } {
  const value = url.trim();
  if (/^\d{1,12}$/.test(value)) return { kind: 'user', ref: value };
  const list = /goodreads\.com\/list\/show\/(\d{1,12})/i.exec(value);
  if (list) return { kind: 'list', ref: list[1] };
  const user = /goodreads\.com\/(?:user\/show|review\/list)\/(\d{1,12})/i.exec(value);
  if (user) return { kind: 'user', ref: user[1] };
  throw new BadRequestException('Paste a Goodreads profile or list link (goodreads.com/user/show/... or goodreads.com/list/show/...)');
}

export function isNewItem(item: GoodreadsStoredItem, source: StoredSource | undefined, now = Date.now()): boolean {
  const baseline = source?.baselineAt;
  if (!baseline || item.firstSeenAt <= baseline) return false;
  return now - Date.parse(item.firstSeenAt) < NEW_FOR_MS;
}

@Injectable()
export class GoodreadsService {
  private readonly logger = new Logger(GoodreadsService.name);

  constructor(private readonly repo: GoodreadsRepository) {}

  /** Snapshots from before sources existed hold her own shelves only: they become the "me" source. */
  private async load(userId: number): Promise<Snapshot> {
    const data = await this.repo.findSnapshot(userId);
    const lastSyncedAt = typeof data?.lastSyncedAt === 'string' ? data.lastSyncedAt : null;
    const rawItems = Array.isArray(data?.items) ? (data.items as Partial<GoodreadsStoredItem>[]) : [];
    const sources = Array.isArray(data?.sources) ? (data.sources as StoredSource[]) : [];
    if (!sources.some((source) => source.id === GOODREADS_OWN_SOURCE_ID)) {
      const own = ownSource(lastSyncedAt ?? new Date().toISOString());
      own.lastSyncedAt = rawItems.length > 0 ? lastSyncedAt : null;
      sources.unshift(own);
    }
    const items = rawItems.map((item) => ({
      ...(item as GoodreadsShelfItem),
      source: item.source ?? GOODREADS_OWN_SOURCE_ID,
      firstSeenAt: item.firstSeenAt ?? lastSyncedAt ?? new Date(0).toISOString(),
    }));
    for (const source of sources) {
      if (source.baselineAt !== undefined) continue;
      const seen = items.filter((item) => item.source === source.id).map((item) => item.firstSeenAt);
      source.baselineAt = seen.length > 0 ? seen.reduce((min, value) => (value < min ? value : min)) : null;
    }
    return {
      lastSyncedAt,
      syncRequestedAt: typeof data?.syncRequestedAt === 'string' ? data.syncRequestedAt : null,
      sources,
      items,
    };
  }

  private async save(userId: number, snapshot: Snapshot): Promise<void> {
    await this.repo.saveSnapshot(userId, snapshot as unknown as Record<string, unknown>);
  }

  private summarize(snapshot: Snapshot): GoodreadsSourceSummary[] {
    return snapshot.sources.map((stored) => {
      const source: GoodreadsSource = { ...stored };
      delete (source as StoredSource).nameLocked;
      delete (source as StoredSource).baselineAt;
      const counts = new Map<string, GoodreadsShelfSummary>();
      let total = 0;
      let newCount = 0;
      for (const item of snapshot.items) {
        if (item.source !== source.id) continue;
        total += 1;
        const fresh = isNewItem(item, stored);
        if (fresh) newCount += 1;
        for (const shelf of item.shelves) {
          const entry = counts.get(shelf) ?? { name: shelf, count: 0, newCount: 0 };
          entry.count += 1;
          if (fresh) entry.newCount += 1;
          counts.set(shelf, entry);
        }
      }
      const shelves = [...counts.values()].sort((a, b) => shelfRank(a.name) - shelfRank(b.name) || a.name.localeCompare(b.name));
      return { ...source, total, newCount, shelves };
    });
  }

  async getOverview(userId: number): Promise<GoodreadsOverview> {
    const snapshot = await this.load(userId);
    return {
      lastSyncedAt: snapshot.lastSyncedAt,
      syncRequestedAt: snapshot.syncRequestedAt,
      total: snapshot.items.length,
      sources: this.summarize(snapshot),
    };
  }

  async listItems(userId: number, query: ListGoodreadsItemsDto): Promise<GoodreadsShelfPage> {
    const snapshot = await this.load(userId);
    const sourceId = query.source ?? GOODREADS_OWN_SOURCE_ID;
    const source = snapshot.sources.find((entry) => entry.id === sourceId);
    const needle = fold(query.q?.trim() ?? '');
    const matching = snapshot.items.filter(
      (item) =>
        item.source === sourceId &&
        item.shelves.includes(query.shelf) &&
        (!needle || fold(`${item.title} ${item.authors.join(' ')}`).includes(needle)),
    );
    const sort = query.sort ?? 'newest';
    matching.sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title);
      if (sort === 'author') return (a.authors[0] ?? '').localeCompare(b.authors[0] ?? '') || a.title.localeCompare(b.title);
      return b.firstSeenAt.localeCompare(a.firstSeenAt) || a.title.localeCompare(b.title);
    });
    const offset = query.offset ?? 0;
    const page = matching.slice(offset, offset + (query.limit ?? DEFAULT_LIMIT));
    const requests = await this.repo.findRequests(
      userId,
      page.map((item) => item.goodreadsId ?? item.key),
    );
    return {
      total: matching.length,
      items: page.map((item) => ({
        ...item,
        isNew: isNewItem(item, source),
        request: requests.get(item.goodreadsId ?? item.key) ?? null,
      })),
    };
  }

  async replaceSnapshot(userId: number, dto: ReplaceGoodreadsSnapshotDto): Promise<GoodreadsOverview> {
    const startedAt = Date.now();
    const snapshot = await this.load(userId);
    const sourceId = dto.source ?? GOODREADS_OWN_SOURCE_ID;
    const source = snapshot.sources.find((entry) => entry.id === sourceId);
    if (!source) throw new NotFoundException(`Unknown Goodreads source ${sourceId}`);
    const now = new Date().toISOString();

    if (dto.sourceRef && source.own && !source.ref) source.ref = dto.sourceRef;
    if (dto.sourceName && !source.nameLocked) source.name = dto.sourceName.slice(0, 120);

    if (!dto.items) {
      source.lastError = dto.error ? dto.error.slice(0, 500) : null;
      await this.save(userId, snapshot);
      this.logger.warn(`[goodreads.replace_snapshot] [fail] userId=${userId} source=${sourceId} - ${source.lastError ?? 'no items'}`);
      return this.getOverview(userId);
    }

    if (!source.baselineAt) source.baselineAt = now;
    const firstSeen = new Map<string, string>();
    for (const item of snapshot.items) if (item.source === sourceId) firstSeen.set(item.key, item.firstSeenAt);
    const items: GoodreadsStoredItem[] = dto.items.map((item) => ({
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
      source: sourceId,
      firstSeenAt: firstSeen.get(item.key) ?? now,
    }));
    snapshot.items = [...snapshot.items.filter((item) => item.source !== sourceId), ...items];
    source.previousSyncedAt = source.lastSyncedAt;
    source.lastSyncedAt = now;
    source.lastError = dto.error ? dto.error.slice(0, 500) : null;
    snapshot.lastSyncedAt = now;
    await this.save(userId, snapshot);
    this.logger.log(
      `[goodreads.replace_snapshot] [end] userId=${userId} source=${sourceId} durationMs=${Date.now() - startedAt} items=${items.length} - goodreads shelves replaced`,
    );
    return this.getOverview(userId);
  }

  /** Recorded for the sync job, which polls for it and runs within a minute. */
  async requestSync(userId: number): Promise<GoodreadsOverview> {
    const snapshot = await this.load(userId);
    snapshot.syncRequestedAt = new Date().toISOString();
    await this.save(userId, snapshot);
    return this.getOverview(userId);
  }

  async addSource(userId: number, dto: AddGoodreadsSourceDto): Promise<GoodreadsOverview> {
    const { kind, ref } = parseGoodreadsSource(dto.url);
    const snapshot = await this.load(userId);
    const own = snapshot.sources.find((source) => source.own);
    if (kind === 'user' && own?.ref === ref) throw new ConflictException('That is your own Goodreads account, already followed');
    const id = `${kind}-${ref}`;
    if (snapshot.sources.some((source) => source.id === id)) throw new ConflictException('That Goodreads source is already followed');
    if (snapshot.sources.length >= MAX_SOURCES) throw new BadRequestException(`At most ${MAX_SOURCES} Goodreads sources`);
    const name = dto.name?.trim();
    const now = new Date().toISOString();
    snapshot.sources.push({
      id,
      kind,
      ref,
      name: name || (kind === 'list' ? `List ${ref}` : `Member ${ref}`),
      nameLocked: Boolean(name),
      own: false,
      addedAt: now,
      lastSyncedAt: null,
      previousSyncedAt: null,
      lastError: null,
    });
    snapshot.syncRequestedAt = now;
    await this.save(userId, snapshot);
    this.logger.log(`[goodreads.add_source] [end] userId=${userId} source=${id} - goodreads source followed`);
    return this.getOverview(userId);
  }

  async renameSource(userId: number, sourceId: string, name: string): Promise<GoodreadsOverview> {
    const snapshot = await this.load(userId);
    const source = snapshot.sources.find((entry) => entry.id === sourceId);
    if (!source) throw new NotFoundException(`Unknown Goodreads source ${sourceId}`);
    source.name = name.trim().slice(0, 120) || source.name;
    source.nameLocked = true;
    await this.save(userId, snapshot);
    return this.getOverview(userId);
  }

  async removeSource(userId: number, sourceId: string): Promise<GoodreadsOverview> {
    if (sourceId === GOODREADS_OWN_SOURCE_ID) throw new BadRequestException('Your own Goodreads shelves cannot be removed');
    const snapshot = await this.load(userId);
    if (!snapshot.sources.some((entry) => entry.id === sourceId)) throw new NotFoundException(`Unknown Goodreads source ${sourceId}`);
    snapshot.sources = snapshot.sources.filter((entry) => entry.id !== sourceId);
    snapshot.items = snapshot.items.filter((item) => item.source !== sourceId);
    await this.save(userId, snapshot);
    this.logger.log(`[goodreads.remove_source] [end] userId=${userId} source=${sourceId} - goodreads source removed`);
    return this.getOverview(userId);
  }
}
