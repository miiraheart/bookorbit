import type { ReadAlongPair, ReadAlongPairSource } from '@bookorbit/types';

export const READ_ALOUD_PAIRS_SETTING_KEY = 'read_aloud_pairs_v1';
export const READ_ALOUD_PAIRS_STORE_VERSION = 1;

export type ReadAlongPairEntry = {
  ebookBookId: number;
  ebookFileId: number;
  fileHash: string | null;
  pairedAt: string;
  pairedBy: number | null;
  source?: ReadAlongPairSource;
  language?: string | null;
};

export type ReadAlongPairsStore = {
  version: typeof READ_ALOUD_PAIRS_STORE_VERSION;
  pairs: Record<string, ReadAlongPairEntry>;
  dismissed: Record<string, number[]>;
};

export function emptyReadAlongPairsStore(): ReadAlongPairsStore {
  return { version: READ_ALOUD_PAIRS_STORE_VERSION, pairs: {}, dismissed: {} };
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function parseEntry(value: unknown): ReadAlongPairEntry | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  if (!isPositiveInt(entry.ebookBookId) || !isPositiveInt(entry.ebookFileId) || typeof entry.pairedAt !== 'string') return null;
  return {
    ebookBookId: entry.ebookBookId,
    ebookFileId: entry.ebookFileId,
    fileHash: typeof entry.fileHash === 'string' && entry.fileHash ? entry.fileHash : null,
    pairedAt: entry.pairedAt,
    pairedBy: isPositiveInt(entry.pairedBy) ? entry.pairedBy : null,
    source: entry.source === 'accepted' ? 'accepted' : 'manual',
    language: typeof entry.language === 'string' && entry.language ? entry.language : null,
  };
}

/**
 * Throws on a value it cannot read instead of starting empty: the next write would otherwise save
 * an empty store over every pair.
 */
export function parseReadAlongPairsStore(raw: string | null | undefined): ReadAlongPairsStore {
  if (raw === null || raw === undefined || raw.trim() === '') return emptyReadAlongPairsStore();
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object') throw new Error(`${READ_ALOUD_PAIRS_SETTING_KEY} is not an object`);
  const value = parsed as Record<string, unknown>;
  if (value.version !== READ_ALOUD_PAIRS_STORE_VERSION)
    throw new Error(`${READ_ALOUD_PAIRS_SETTING_KEY} has unsupported version ${String(value.version)}`);

  const store = emptyReadAlongPairsStore();
  for (const [audioId, entry] of Object.entries((value.pairs ?? {}) as Record<string, unknown>)) {
    const parsedEntry = parseEntry(entry);
    if (isPositiveInt(Number(audioId)) && parsedEntry) store.pairs[audioId] = parsedEntry;
  }
  for (const [audioId, ids] of Object.entries((value.dismissed ?? {}) as Record<string, unknown>)) {
    const list = Array.isArray(ids) ? [...new Set(ids.filter(isPositiveInt))] : [];
    if (isPositiveInt(Number(audioId)) && list.length > 0) store.dismissed[audioId] = list;
  }
  return store;
}

export function serializeReadAlongPairsStore(store: ReadAlongPairsStore): string {
  return JSON.stringify(store);
}

export function toReadAlongPair(audiobookBookId: number, entry: ReadAlongPairEntry): ReadAlongPair {
  return {
    audiobookBookId,
    ebookBookId: entry.ebookBookId,
    ebookFileId: entry.ebookFileId,
    fileHash: entry.fileHash,
    source: entry.source ?? 'manual',
    language: entry.language ?? null,
    pairedAt: entry.pairedAt,
    pairedBy: entry.pairedBy,
  };
}

export function setReadAlongPair(store: ReadAlongPairsStore, audiobookBookId: number, entry: ReadAlongPairEntry): void {
  store.pairs[String(audiobookBookId)] = entry;
}

export function removeReadAlongPair(store: ReadAlongPairsStore, audiobookBookId: number): ReadAlongPairEntry | null {
  const key = String(audiobookBookId);
  const existing = store.pairs[key] ?? null;
  delete store.pairs[key];
  return existing;
}

export function dismissReadAlongCandidate(store: ReadAlongPairsStore, audiobookBookId: number, ebookBookId: number): void {
  const key = String(audiobookBookId);
  const current = store.dismissed[key] ?? [];
  if (!current.includes(ebookBookId)) store.dismissed[key] = [...current, ebookBookId];
}

export function undismissReadAlongCandidate(store: ReadAlongPairsStore, audiobookBookId: number, ebookBookId: number): boolean {
  const key = String(audiobookBookId);
  const current = store.dismissed[key] ?? [];
  if (!current.includes(ebookBookId)) return false;
  const next = current.filter((id) => id !== ebookBookId);
  if (next.length > 0) store.dismissed[key] = next;
  else delete store.dismissed[key];
  return true;
}

export function dismissedFor(store: ReadAlongPairsStore, audiobookBookId: number): number[] {
  return store.dismissed[String(audiobookBookId)] ?? [];
}
