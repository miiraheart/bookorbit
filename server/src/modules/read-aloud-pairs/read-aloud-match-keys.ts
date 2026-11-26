import { ISO_639_2_TO_1, languageSubtagOf, normalizeWorkToken, type ReadAlongLanguageMatch, type ReadAlongMatchFlag } from '@bookorbit/types';

import { AUDIO_TITLE_MARKERS } from '../book-duplicates/book-duplicate-normalize';

export type ReadAlongTitleKeys = {
  full: string | null;
  head: string | null;
  tail: string | null;
  hasSubtitle: boolean;
};

export type ReadAlongTitleMatch = 'full' | 'head' | 'fuzzy';

const MIN_KEY_LENGTH = 3;
const FUZZY_TITLE_THRESHOLD = 0.8;
const SUMMARY_MAX_SECONDS = 90 * 60;

const MARKER_PATTERN = new RegExp(`\\b(?:${AUDIO_TITLE_MARKERS.join('|')})\\b`, 'giu');
const BRACKETED_PATTERN = /\([^)]*\)|\[[^\]]*\]/g;
const LEADING_SERIES_BOOK_PATTERN = /^.*\bbook\s+\d+(\.\d+)?\s*-\s*/i;
const TRAILING_SERIES_BOOK_PATTERN = /\s+-\s+[^:]*\bbook\s+\d+(\.\d+)?\s*$/i;

const OMNIBUS_PATTERN = /omnibus|box ?set|bundle|collection|trilogy|books? \d+ ?- ?\d+/i;
const PART_OF_PATTERN = /part \d+ of \d+|\(\d+ of \d+\)/i;
const DRAMATIZED_PATTERN = /dramati[sz]ed|full cast|graphic ?audio/i;
const SUMMARY_LIBRARY_PATTERN = /blinkist|summary/i;
const DRAMATIZED_AUTHOR_PATTERN = /graphic ?aud|full cast/i;
const NON_PERSON_AUTHOR_PATTERN = /graphic ?aud|full cast|^unknown( artist)?$|^various|audio ?book collection|published by/i;
const NAME_SUFFIXES = new Set(['phd', 'ph', 'md', 'dr', 'lpc', 'lcsw', 'psyd', 'and', 'jr', 'sr', 'mr', 'mrs', 'ms']);

const UNKNOWN_LANGUAGE_VALUES = new Set(['eee', 'und', 'xxx', 'mul', 'zxx', 'mis']);
const LANGUAGE_ALIASES: Record<string, string> = {
  english: 'en',
  eng: 'en',
  french: 'fr',
  francais: 'fr',
  français: 'fr',
  fre: 'fr',
  fra: 'fr',
  spanish: 'es',
  spa: 'es',
  german: 'de',
  ger: 'de',
  deu: 'de',
};

function key(value: string | undefined): string | null {
  const normalized = normalizeWorkToken(value ?? '');
  return normalized.length >= MIN_KEY_LENGTH ? normalized : null;
}

export function cleanReadAlongTitle(title: string): string {
  return title
    .replace(BRACKETED_PATTERN, ' ')
    .replace(LEADING_SERIES_BOOK_PATTERN, '')
    .replace(TRAILING_SERIES_BOOK_PATTERN, '')
    .replace(MARKER_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The full title only; the subtitle column often holds a series label, so it only blocks head matches. */
export function readAlongTitleKeys(title: string | null | undefined, subtitle?: string | null): ReadAlongTitleKeys {
  const cleaned = cleanReadAlongTitle(title ?? '');
  const colon = cleaned.indexOf(':');
  const head = colon >= 0 ? key(cleaned.slice(0, colon)) : null;
  const tail = colon >= 0 ? key(cleaned.slice(colon + 1)) : null;
  return { full: key(cleaned), head, tail, hasSubtitle: Boolean(tail) || Boolean(subtitle?.trim()) };
}

function trigrams(value: string): Map<string, number> {
  const padded = `  ${value} `;
  const grams = new Map<string, number>();
  for (let index = 0; index + 3 <= padded.length; index += 1) {
    const gram = padded.slice(index, index + 3);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  return grams;
}

export function titleSimilarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const a = trigrams(left);
  const b = trigrams(right);
  let shared = 0;
  let total = 0;
  for (const [gram, count] of a) {
    shared += Math.min(count, b.get(gram) ?? 0);
    total += count;
  }
  for (const count of b.values()) total += count;
  return total === 0 ? 0 : (2 * shared) / total;
}

function headMatches(withSubtitle: ReadAlongTitleKeys, bare: ReadAlongTitleKeys): boolean {
  return Boolean(withSubtitle.head) && withSubtitle.head === bare.full && !bare.hasSubtitle;
}

/** Head before ':' counts only when the other side has no subtitle, so two different tails never match. */
export function compareReadAlongTitles(left: ReadAlongTitleKeys, right: ReadAlongTitleKeys): ReadAlongTitleMatch | null {
  if (!left.full || !right.full) return null;
  if (left.full === right.full) return 'full';
  if (headMatches(left, right) || headMatches(right, left)) return 'head';
  if (left.tail && left.tail === right.full && !right.hasSubtitle) return 'head';
  if (right.tail && right.tail === left.full && !left.hasSubtitle) return 'head';
  return titleSimilarity(left.full, right.full) >= FUZZY_TITLE_THRESHOLD ? 'fuzzy' : null;
}

/** Word tokens in sorted order, so "Gibson, Lindsay C." and "Lindsay C. Gibson" agree. */
export function personTokens(name: string | null | undefined): string[] {
  return (name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^\p{L}]+/u)
    .filter((token) => token.length > 1 && !NAME_SUFFIXES.has(token))
    .sort();
}

export function personTokenKey(name: string | null | undefined): string {
  return personTokens(name).join(' ');
}

/** Imprints and placeholders (GraphicAudio, Unknown) sit in the author field of some audiobooks; they are not people. */
export function personAuthors(authors: readonly string[]): string[] {
  return authors.filter((name) => !NON_PERSON_AUTHOR_PATTERN.test(name.trim()));
}

export function authorsKey(authors: readonly string[]): string {
  return [...new Set(personAuthors(authors).map(personTokenKey).filter(Boolean))].sort().join('|');
}

function samePerson(left: string[], right: string[]): boolean {
  if (left.length === 0 || right.length === 0) return false;
  if (left.join(' ') === right.join(' ')) return true;
  const [small, large] = left.length <= right.length ? [left, right] : [right, left];
  return small.length >= 2 && small.every((token) => large.includes(token));
}

export function compareAuthors(left: readonly string[], right: readonly string[]): 'overlap' | 'conflict' | 'unknown' {
  const a = personAuthors(left)
    .map(personTokens)
    .filter((tokens) => tokens.length > 0);
  const b = personAuthors(right)
    .map(personTokens)
    .filter((tokens) => tokens.length > 0);
  if (a.length === 0 || b.length === 0) return 'unknown';
  return a.some((person) => b.some((other) => samePerson(person, other))) ? 'overlap' : 'conflict';
}

/** A two-letter language code, or null for empty and placeholder values such as eee, und and XXX. */
export function normalizeReadAlongLanguage(value: string | null | undefined): string | null {
  const lowered = value?.trim().toLowerCase();
  if (!lowered || UNKNOWN_LANGUAGE_VALUES.has(lowered)) return null;
  const alias = LANGUAGE_ALIASES[lowered];
  if (alias) return alias;
  const subtag = languageSubtagOf(lowered);
  if (!subtag || UNKNOWN_LANGUAGE_VALUES.has(subtag)) return null;
  if (subtag.length === 2) return subtag;
  return LANGUAGE_ALIASES[subtag] ?? ISO_639_2_TO_1[subtag] ?? null;
}

export function libraryLanguagePrior(libraryName: string | null | undefined): string | null {
  if (!libraryName) return null;
  if (/french|francais|français/i.test(libraryName)) return 'fr';
  if (/english/i.test(libraryName)) return 'en';
  return null;
}

export type ReadAlongLanguageSide = { language?: string | null; libraryName?: string | null };

export function resolveReadAlongLanguage(side: ReadAlongLanguageSide): { code: string | null; fromMetadata: boolean } {
  const stated = normalizeReadAlongLanguage(side.language);
  if (stated) return { code: stated, fromMetadata: true };
  return { code: libraryLanguagePrior(side.libraryName), fromMetadata: false };
}

export function compareReadAlongLanguages(left: ReadAlongLanguageSide, right: ReadAlongLanguageSide): ReadAlongLanguageMatch {
  const a = resolveReadAlongLanguage(left);
  const b = resolveReadAlongLanguage(right);
  if (!a.code || !b.code) return 'unknown';
  if (a.code !== b.code) return 'conflict';
  return a.fromMetadata && b.fromMetadata ? 'equal' : 'prior';
}

export type ReadAlongFlagSource = {
  title: string | null | undefined;
  subtitle?: string | null;
  abridged?: boolean | null;
  libraryName?: string | null;
  durationSeconds?: number | null;
  authors?: readonly string[];
};

/**
 * Read from the raw title and subtitle, before markers and brackets are stripped. Omnibus reads the
 * title only: the subtitle column holds series labels such as "The Farseer Trilogy, Book 1".
 */
export function readAlongFlags(side: ReadAlongFlagSource, kind: 'audio' | 'epub'): ReadAlongMatchFlag[] {
  const text = [side.title ?? '', side.subtitle ?? ''].join(' ');
  const flags: ReadAlongMatchFlag[] = [];
  if (side.abridged === true || (/\babridged\b/i.test(text) && !/\bunabridged\b/i.test(text))) flags.push('abridged');
  const shortAudio = kind === 'audio' && side.durationSeconds != null && side.durationSeconds > 0 && side.durationSeconds < SUMMARY_MAX_SECONDS;
  if (SUMMARY_LIBRARY_PATTERN.test(side.libraryName ?? '') || shortAudio) flags.push('summary');
  if (OMNIBUS_PATTERN.test(side.title ?? '')) flags.push(kind === 'audio' ? 'omnibus_audio' : 'omnibus_epub');
  if (kind === 'audio' && PART_OF_PATTERN.test(text)) flags.push('part_of');
  const dramatizedAuthor = (side.authors ?? []).some((name) => DRAMATIZED_AUTHOR_PATTERN.test(name));
  if (kind === 'audio' && (DRAMATIZED_PATTERN.test(text) || dramatizedAuthor)) flags.push('dramatized');
  return flags;
}
