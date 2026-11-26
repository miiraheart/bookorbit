import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { GOODREADS_PROVIDER_KEY, type GoodreadsRequests } from '@bookorbit/types';

import { DB } from '../../db';
import * as schema from '../../db/schema';
import { groupRequests } from './goodreads-requests';

type Db = NodePgDatabase<typeof schema>;

/** Kept in user_preferences rather than its own table: a few hundred books per user, and no migration to carry. */
export const GOODREADS_SNAPSHOT_CATEGORY = 'goodreads-shelves';

@Injectable()
export class GoodreadsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async findSnapshot(userId: number): Promise<Record<string, unknown> | null> {
    const row = await this.db.query.userPreferences.findFirst({
      where: and(eq(schema.userPreferences.userId, userId), eq(schema.userPreferences.category, GOODREADS_SNAPSHOT_CATEGORY)),
    });
    return (row?.data as Record<string, unknown> | undefined) ?? null;
  }

  async saveSnapshot(userId: number, data: Record<string, unknown>): Promise<void> {
    const now = new Date();
    await this.db
      .insert(schema.userPreferences)
      .values({ userId, category: GOODREADS_SNAPSHOT_CATEGORY, data, updatedAt: now })
      .onConflictDoUpdate({
        target: [schema.userPreferences.userId, schema.userPreferences.category],
        set: { data, updatedAt: now },
      });
  }

  /** The newest request per Goodreads book and media kind this user made from the Goodreads page. */
  async findRequests(userId: number, goodreadsIds: string[]): Promise<Map<string, GoodreadsRequests>> {
    if (goodreadsIds.length === 0) return new Map();
    const rows = await this.db
      .select({
        id: schema.bookRequests.id,
        status: schema.bookRequests.status,
        providerId: schema.bookRequests.providerId,
        mediaKind: schema.bookRequests.mediaKind,
        selfServe: schema.bookRequests.selfServe,
      })
      .from(schema.bookRequests)
      .where(
        and(
          eq(schema.bookRequests.userId, userId),
          eq(schema.bookRequests.providerKey, GOODREADS_PROVIDER_KEY),
          inArray(schema.bookRequests.providerId, goodreadsIds),
        ),
      )
      .orderBy(desc(schema.bookRequests.id));
    return groupRequests(rows);
  }
}
