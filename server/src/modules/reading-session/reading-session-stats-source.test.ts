import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { readingSessionStatsSource } from './reading-session-stats-source';

describe('readingSessionStatsSource', () => {
  it('reports imported Audiobookshelf sessions as their own source and keeps every other source', () => {
    const { sql } = new PgDialect().sqlToQuery(readingSessionStatsSource);
    expect(sql).toBe(
      `case when "reading_sessions"."source_device_key" = 'audiobookshelf' then 'audiobookshelf' else "reading_sessions"."source" end`,
    );
  });
});
