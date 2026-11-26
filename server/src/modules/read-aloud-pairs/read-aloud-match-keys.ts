import {
  normalizeReadAlongLanguage,
  normalizeWorkToken,
  readAlongTitleFlags,
  type ReadAlongLanguageMatch,
  type ReadAlongMatchFlag,
} from '@bookorbit/types';

import { AUDIO_TITLE_MARKERS } from '../book-duplicates/book-duplicate-normalize';
import { audioFileFlags } from './read-aloud-match-files';

export type ReadAlongTitleKeys = {
  full: string | null;
  head: string | null;
  tail: string | null;
  joined: string | null;
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

const SUMMARY_LIBRARY_PATTERN = /blinkist|summary/i;
const NON_PERSON_AUTHOR_PATTERN = /graphic ?aud|full cast|^unknown( artist)?$|^various|audio ?book collection|published by/i;
const NAME_SUFFIXES = new Set(['phd', 'ph', 'md', 'dr', 'lpc', 'lcsw', 'psyd', 'and', 'jr', 'sr', 'mr', 'mrs', 'ms']);

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

/**
 * The full title, plus the title joined with its subtitle for a side that keeps "Title: Sub" in one
 * field. The subtitle column often holds a series label, so on its own it only blocks head matches.
 */
export function readAlongTitleKeys(title: string | null | undefined, subtitle?: string | null): ReadAlongTitleKeys {
  const cleaned = cleanReadAlongTitle(title ?? '');
  const colon = cleaned.indexOf(':');
  const head = colon >= 0 ? key(cleaned.slice(0, colon)) : null;
  const tail = colon >= 0 ? key(cleaned.slice(colon + 1)) : null;
  const joined = subtitle?.trim() ? key(cleanReadAlongTitle(`${title ?? ''} ${subtitle}`)) : null;
  return { full: key(cleaned), head, tail, joined, hasSubtitle: Boolean(tail) || Boolean(subtitle?.trim()) };
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
  if ((left.joined && left.joined === right.full) || (right.joined && right.joined === left.full)) return 'full';
  if (headMatches(left, right) || headMatches(right, left)) return 'head';
  if (left.tail && left.tail === right.full && !right.hasSubtitle) return 'head';
  if (right.tail && right.tail === left.full && !left.hasSubtitle) return 'head';
  return titleSimilarity(left.full, right.full) >= FUZZY_TITLE_THRESHOLD ? 'fuzzy' : null;
}

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^\p{L}]+/u)
    .filter((token) => token.length > 1 && !NAME_SUFFIXES.has(token));
}

/** Word tokens in sorted order, so "Gibson, Lindsay C." and "Lindsay C. Gibson" agree. */
export function personTokens(name: string | null | undefined): string[] {
  return nameTokens(name ?? '').sort();
}

/** The family name: the last word, or the part before a comma in "Gibson, Lindsay C.". */
export function personSurname(name: string): string | null {
  return nameTokens(name.split(',')[0] ?? '').at(-1) ?? null;
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
  if (a.code !== b.code) return a.fromMetadata && b.fromMetadata ? 'conflict' : 'unknown';
  return a.fromMetadata && b.fromMetadata ? 'equal' : 'prior';
}

export type ReadAlongFlagSource = {
  title: string | null | undefined;
  subtitle?: string | null;
  abridged?: boolean | null;
  libraryName?: string | null;
  durationSeconds?: number | null;
  authors?: readonly string[];
  audioFiles?: readonly string[];
  audioFileAliases?: readonly string[];
};

/**
 * Read from the raw title and subtitle, before markers and brackets are stripped. Omnibus reads the
 * title only: the subtitle column holds series labels such as "The Farseer Trilogy, Book 1". An
 * audiobook's file names are read too, since a part or a whole series often hides behind a clean title.
 */
export function readAlongFlags(side: ReadAlongFlagSource, kind: 'audio' | 'epub'): ReadAlongMatchFlag[] {
  const shortAudio = kind === 'audio' && side.durationSeconds != null && side.durationSeconds > 0 && side.durationSeconds < SUMMARY_MAX_SECONDS;
  const flags = readAlongTitleFlags({ ...side, summary: SUMMARY_LIBRARY_PATTERN.test(side.libraryName ?? '') || shortAudio }, kind);
  if (kind === 'audio' && side.audioFiles?.length) flags.push(...audioFileFlags(side.title ?? '', side.audioFiles, side.audioFileAliases));
  return [...new Set(flags)];
}
