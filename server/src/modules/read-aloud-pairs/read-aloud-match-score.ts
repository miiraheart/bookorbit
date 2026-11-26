import type {
  ReadAlongCandidate,
  ReadAlongLanguageMatch,
  ReadAlongMatchFlag,
  ReadAlongMatchReason,
  ReadAlongMatchTier,
  ReadAlongPairStatus,
} from '@bookorbit/types';

import { canonicalizeIsbn, canonicalSeriesIndex } from '../book-duplicates/book-duplicate-normalize';
import {
  authorsKey,
  compareAuthors,
  compareReadAlongLanguages,
  compareReadAlongTitles,
  readAlongFlags,
  readAlongTitleKeys,
  resolveReadAlongLanguage,
  type ReadAlongTitleMatch,
} from './read-aloud-match-keys';

export type ReadAlongMatchBook = {
  bookId: number;
  libraryId: number;
  libraryName: string | null;
  title: string;
  subtitle?: string | null;
  authors: string[];
  isbn10?: string | null;
  isbn13?: string | null;
  workIds?: string[];
  language?: string | null;
  seriesName?: string | null;
  seriesIndex?: string | null;
  abridged?: boolean | null;
};

export type ReadAlongAudioBook = ReadAlongMatchBook & { durationSeconds?: number | null };

export type ReadAlongEbookBook = ReadAlongMatchBook & {
  fileId: number;
  metadataScore?: number | null;
  hasMediaOverlay?: boolean;
};

/** `includeHidden` is the manual search: language conflicts and weak matches are returned, flagged. */
export type RankReadAlongOptions = { dismissedEbookBookIds?: readonly number[]; includeHidden?: boolean };

export type ScoredReadAlongCandidate = { ebook: ReadAlongEbookBook; candidate: ReadAlongCandidate; groupKey: string };
type Scored = ScoredReadAlongCandidate & { strong: boolean };

const MIN_SCORE = 40;
const STRONG_TIERS: readonly ReadAlongMatchTier[] = ['exact', 'likely'];

function libraryRank(name: string | null): number {
  const value = (name ?? '').trim();
  if (/^(english|french|francais|français)$/i.test(value)) return 0;
  if (/shelfmark/i.test(value)) return 1;
  if (/readarr|legacy/i.test(value)) return 2;
  return 3;
}

function sharedWorkId(audio: ReadAlongMatchBook, ebook: ReadAlongMatchBook): boolean {
  const ids = new Set(audio.workIds ?? []);
  return (ebook.workIds ?? []).some((id) => ids.has(id));
}

function seriesSignal(audio: ReadAlongMatchBook, ebook: ReadAlongMatchBook): number {
  const a = audio.seriesName?.trim().toLowerCase();
  const b = ebook.seriesName?.trim().toLowerCase();
  if (!a || !b || a !== b) return 0;
  const ai = canonicalSeriesIndex(audio.seriesIndex);
  const bi = canonicalSeriesIndex(ebook.seriesIndex);
  return ai && bi && ai !== bi ? -5 : 5;
}

function tierFor(
  title: ReadAlongTitleMatch | null,
  idShared: boolean,
  author: string,
  language: ReadAlongLanguageMatch,
  flags: readonly ReadAlongMatchFlag[],
): ReadAlongMatchTier {
  const languageOk = language === 'equal' || language === 'prior';
  if (flags.length > 0) return 'maybe';
  if (title === 'full' && author === 'overlap' && languageOk) return 'exact';
  if (title === 'full' && author === 'overlap' && language === 'unknown') return 'likely';
  if (idShared && author !== 'conflict' && languageOk && title !== null) return 'likely';
  return 'maybe';
}

/**
 * Null when it should never be offered (titles and ids disagree, or authors conflict). The manual
 * search keeps every book it is given, so a match the keys miss can still be picked by hand.
 */
export function scoreReadAlongCandidate(
  audio: ReadAlongAudioBook,
  ebook: ReadAlongEbookBook,
  includeHidden = false,
): ScoredReadAlongCandidate | null {
  const title = compareReadAlongTitles(readAlongTitleKeys(audio.title, audio.subtitle), readAlongTitleKeys(ebook.title, ebook.subtitle));
  const audioIsbn = canonicalizeIsbn(audio.isbn10 ?? null, audio.isbn13 ?? null);
  const isbnShared = audioIsbn !== null && audioIsbn === canonicalizeIsbn(ebook.isbn10 ?? null, ebook.isbn13 ?? null);
  const workShared = sharedWorkId(audio, ebook);
  const idShared = isbnShared || workShared;
  if (!title && !idShared && !includeHidden) return null;

  const author = compareAuthors(audio.authors, ebook.authors);
  if (author === 'conflict' && !idShared && !includeHidden) return null;
  const language = compareReadAlongLanguages(audio, ebook);
  const flags = [...new Set([...readAlongFlags(audio, 'audio'), ...readAlongFlags(ebook, 'epub')])];
  if (language === 'conflict') flags.push('language_conflict');

  const reasons: ReadAlongMatchReason[] = [];
  let score = 0;
  const add = (points: number, reason: ReadAlongMatchReason | null, when: boolean) => {
    if (!when) return;
    score += points;
    if (reason) reasons.push(reason);
  };
  add(40, 'isbn', isbnShared);
  add(40, 'work_id', workShared);
  add(35, 'title_exact', title === 'full');
  add(25, 'title_head', title === 'head');
  add(20, 'title_close', title === 'fuzzy');
  add(25, 'author', author === 'overlap');
  add(-30, null, author === 'conflict');
  const series = seriesSignal(audio, ebook);
  add(series, series > 0 ? 'series' : null, series !== 0);
  add(10, 'language', language === 'equal');
  add(10, 'language_prior', language === 'prior');
  score = Math.max(0, Math.min(100, score));
  if (score < MIN_SCORE && !includeHidden) return null;

  const fullKey = readAlongTitleKeys(ebook.title, ebook.subtitle).full ?? `book:${ebook.bookId}`;
  const groupKey = [fullKey, authorsKey(ebook.authors)].join('#');
  const candidate: ReadAlongCandidate = {
    ebookBookId: ebook.bookId,
    ebookFileId: ebook.fileId,
    title: ebook.title,
    authors: ebook.authors,
    libraryId: ebook.libraryId,
    libraryName: ebook.libraryName,
    language: resolveReadAlongLanguage(ebook).code,
    languageMatch: language,
    score,
    tier: tierFor(title, idShared, author, language, flags),
    reasons,
    flags,
    otherCopies: [],
  };
  return { ebook, candidate, groupKey };
}

function compareCopies(a: Scored, b: Scored): number {
  const languageRank = (value: ReadAlongLanguageMatch) => (value === 'equal' ? 0 : value === 'prior' ? 1 : 2);
  return (
    languageRank(a.candidate.languageMatch) - languageRank(b.candidate.languageMatch) ||
    libraryRank(a.ebook.libraryName) - libraryRank(b.ebook.libraryName) ||
    (b.ebook.metadataScore ?? 0) - (a.ebook.metadataScore ?? 0) ||
    Number(a.ebook.hasMediaOverlay ?? false) - Number(b.ebook.hasMediaOverlay ?? false) ||
    b.ebook.bookId - a.ebook.bookId
  );
}

const TIER_ORDER: Record<ReadAlongMatchTier, number> = { exact: 0, likely: 1, maybe: 2 };

/**
 * Copies of one work (same full title, authors and series index; a missing index joins any) fold
 * into the best copy. An exact match only stays exact when it is the one strong work left.
 */
export function rankReadAlongCandidates(
  audio: ReadAlongAudioBook,
  ebooks: readonly ReadAlongEbookBook[],
  options: RankReadAlongOptions = {},
): ReadAlongCandidate[] {
  const dismissed = new Set(options.dismissedEbookBookIds ?? []);
  const scored = ebooks
    .filter((ebook) => ebook.bookId !== audio.bookId && !dismissed.has(ebook.bookId))
    .map((ebook) => scoreReadAlongCandidate(audio, ebook, options.includeHidden))
    .filter((entry): entry is ScoredReadAlongCandidate => entry !== null)
    .filter((entry) => options.includeHidden || !entry.candidate.flags.includes('language_conflict'));

  const groups: Scored[][] = [];
  for (const entry of scored) {
    const index = canonicalSeriesIndex(entry.ebook.seriesIndex);
    const group = groups.find((members) =>
      members.every((member) => {
        if (member.groupKey !== entry.groupKey) return false;
        const other = canonicalSeriesIndex(member.ebook.seriesIndex);
        return !index || !other || index === other;
      }),
    );
    const item = { ...entry, strong: STRONG_TIERS.includes(entry.candidate.tier) };
    if (group) group.push(item);
    else groups.push([item]);
  }

  const best = groups.map((members) => {
    const [head, ...rest] = [...members].sort(compareCopies);
    const candidate = {
      ...head.candidate,
      otherCopies: rest.map((copy) => ({ ebookBookId: copy.ebook.bookId, ebookFileId: copy.ebook.fileId, libraryName: copy.ebook.libraryName })),
    };
    return { candidate, strong: members.some((member) => member.strong) };
  });
  const strongWorks = best.filter((entry) => entry.strong).length;
  return best
    .map(({ candidate }) => (candidate.tier === 'exact' && strongWorks > 1 ? { ...candidate, tier: 'likely' as const } : candidate))
    .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || b.score - a.score || a.ebookBookId - b.ebookBookId);
}

export function readAlongStatus(candidates: readonly ReadAlongCandidate[]): Exclude<ReadAlongPairStatus, 'paired' | 'needs_attention'> {
  const visible = candidates.filter((candidate) => !candidate.flags.includes('language_conflict'));
  const best = visible[0];
  if (!best) return 'none';
  const strong = visible.filter((candidate) => STRONG_TIERS.includes(candidate.tier)).length;
  if (strong >= 2) return 'ambiguous';
  if (best.flags.length > 0) return 'flagged';
  if (STRONG_TIERS.includes(best.tier)) return 'suggested';
  return visible.length >= 2 ? 'ambiguous' : 'suggested';
}
