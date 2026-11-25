import type { ReadingSessionStatsSource } from '@bookorbit/types';
import { sql } from 'drizzle-orm';

import { readingSessions } from '../../db/schema';

/** Imported Audiobookshelf sessions are stored as web; statistics group them under their own source. */
export const readingSessionStatsSource = sql<ReadingSessionStatsSource>`case when ${readingSessions.sourceDeviceKey} = 'audiobookshelf' then 'audiobookshelf' else ${readingSessions.source} end`;
