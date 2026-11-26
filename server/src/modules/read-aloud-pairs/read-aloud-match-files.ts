import { DRAMATIZED_PATTERN, normalizeWorkToken, type ReadAlongMatchFlag } from '@bookorbit/types';

const PART_IN_NAME = /part (\d+) of (\d+)|\((\d+) of (\d+)\)/gi;
const CONTAINER_FILE = /\.(?:m4b|m4a)$/i;
const MIN_OWN_STEM = 3;
const MIN_OTHER_STEM = 4;
const TRACK_WORDS = [
  'chapters?',
  'chap',
  'capitolo',
  'capitulo',
  'chapitre',
  'kapitel',
  'parts?',
  'partie',
  'parte',
  'teil',
  'tracks?',
  'discs?',
  'disk',
  'cd',
  'books?',
  'volume',
  'vol',
  'intro',
  'introduction',
  'introduzione',
  'prologue',
  'prologo',
  'epilogue',
  'epilogo',
  'credits',
  'opening',
  'closing',
  'end',
  'titoli',
  'testa',
  'coda',
  'dedication',
  'preface',
  'foreword',
  'afterword',
  'acknowledge?ments',
  'unabridged',
  'abridged',
  'the',
  'an?',
  'of',
];
const TRACK_WORD_PATTERN = new RegExp(`\\b(?:${TRACK_WORDS.join('|')})\\b`, 'gi');

/** A file or title reduced to the words that name a book: no extension, numbers, brackets or track words. */
export function audioNameStem(name: string): string {
  return normalizeWorkToken(
    name
      .replace(/\.[a-z0-9]{2,4}$/i, '')
      .replace(/_/g, ' ')
      .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
      .replace(/\b[ivxlc]{1,4}\b/gi, ' ')
      .replace(TRACK_WORD_PATTERN, ' ')
      .replace(/\d+/g, ' '),
  );
}

/** "(Part 1 of 2)" in a file name, unless every part of that set is in the record. */
function missingParts(files: readonly string[]): boolean {
  const sets = new Map<number, Set<number>>();
  for (const file of files) {
    for (const match of file.matchAll(PART_IN_NAME)) {
      const part = Number(match[1] ?? match[3]);
      const total = Number(match[2] ?? match[4]);
      sets.set(total, (sets.get(total) ?? new Set()).add(part));
    }
  }
  return [...sets].some(([total, parts]) => Array.from({ length: total }, (_, index) => index + 1).some((part) => !parts.has(part)));
}

/**
 * Files named after other books beside the record's own: a series or author folder imported as
 * one audiobook. Chapter-titled tracks never name the book, so a record needs files that do before
 * the rest count, and those must repeat a name or be whole-book containers such as m4b.
 */
function namesOtherBooks(title: string, files: readonly string[]): boolean {
  if (files.length < 2) return false;
  const own = audioNameStem(title.split(':')[0] ?? '');
  if (own.length < MIN_OWN_STEM) return false;
  const others = files.map((file) => ({ file, stem: audioNameStem(file) })).filter(({ stem }) => !stem.includes(own));
  if (others.length === 0 || others.length === files.length) return false;
  const named = others.filter(({ stem }) => stem.length >= MIN_OTHER_STEM);
  const counts = new Map<string, number>();
  for (const { stem } of named) counts.set(stem, (counts.get(stem) ?? 0) + 1);
  if ([...counts.values()].some((count) => count >= 2)) return true;
  return named.some(({ file }) => CONTAINER_FILE.test(file)) && 2 * named.length >= others.length;
}

/**
 * Flags read from an audiobook's file names, for records whose metadata title is clean. `aliases`
 * are the names the same files carry in other records; they show a part or a dramatization, but
 * only the record's own names say what else it holds.
 */
export function audioFileFlags(title: string, files: readonly string[], aliases: readonly string[] = []): ReadAlongMatchFlag[] {
  const names = [...files, ...aliases];
  const flags: ReadAlongMatchFlag[] = [];
  if (namesOtherBooks(title, files)) flags.push('omnibus_audio');
  if (missingParts(names)) flags.push('part_of');
  if (names.some((name) => DRAMATIZED_PATTERN.test(name))) flags.push('dramatized');
  return flags;
}
