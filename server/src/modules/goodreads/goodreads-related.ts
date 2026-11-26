import type { GoodreadsStoredItem } from '@bookorbit/types';

/** Enough for the longest series on one shelf set, still one bounded card query. */
export const GOODREADS_RELATED_CAP = 40;

function nameKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLowerCase();
}

/** The same source's other books sharing an author with this one, by title. */
export function relatedItems(items: readonly GoodreadsStoredItem[], item: GoodreadsStoredItem, cap = GOODREADS_RELATED_CAP): GoodreadsStoredItem[] {
  const authors = new Set(item.authors.map(nameKey).filter(Boolean));
  if (authors.size === 0) return [];
  return items
    .filter((other) => other.source === item.source && other.key !== item.key && other.authors.some((name) => authors.has(nameKey(name))))
    .sort((a, b) => a.title.localeCompare(b.title))
    .slice(0, cap);
}
