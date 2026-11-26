import { ISO_639_2_TO_1, languageSubtagOf } from "./language";
import type { ReadAlongMatchFlag } from "./read-aloud-pairs";

export const PART_OF_PATTERN = /part \d+ of \d+|\(\d+ of \d+\)/i;
export const DRAMATIZED_PATTERN = /dramati[sz]ed|full cast|graphic ?audio/i;

const DRAMATIZED_AUTHOR_PATTERN = /graphic ?aud|full cast/i;
const OMNIBUS_PATTERN = /omnibus|box ?set|bundle|collection|books? \d+ ?- ?\d+/i;
const TRILOGY_PATTERN = /\btrilogy\b/i;
const SINGLE_VOLUME_PATTERN = /\bbook\s+(?:\d+|[ivx]+)\b(?!\s*-\s*\d)/i;
const SUMMARY_TITLE_PATTERN = /^summary of\b|summary guide/i;

const UNKNOWN_LANGUAGE_VALUES = new Set(["eee", "und", "xxx", "mul", "zxx", "mis"]);
const LANGUAGE_ALIASES: Record<string, string> = {
  english: "en",
  eng: "en",
  french: "fr",
  francais: "fr",
  français: "fr",
  fre: "fr",
  fra: "fr",
  spanish: "es",
  spa: "es",
  german: "de",
  ger: "de",
  deu: "de",
};

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

/** "Trilogy" names an omnibus unless the title is one book of it, as in "Locked Tomb Trilogy, Book 2". */
function isOmnibusTitle(title: string): boolean {
  return OMNIBUS_PATTERN.test(title) || (TRILOGY_PATTERN.test(title) && !SINGLE_VOLUME_PATTERN.test(title));
}

export type ReadAlongTitleFlagSource = {
  title: string | null | undefined;
  subtitle?: string | null;
  abridged?: boolean | null;
  authors?: readonly string[];
  /** Set by a caller that knows more than the title, such as a summary library or a short running time. */
  summary?: boolean;
};

/** The flags a title alone can show, so a library copy and a release title are judged the same way. */
export function readAlongTitleFlags(side: ReadAlongTitleFlagSource, kind: "audio" | "epub"): ReadAlongMatchFlag[] {
  const text = [side.title ?? "", side.subtitle ?? ""].join(" ");
  const flags: ReadAlongMatchFlag[] = [];
  if (side.abridged === true || (/\babridged\b/i.test(text) && !/\bunabridged\b/i.test(text))) flags.push("abridged");
  if (side.summary === true || SUMMARY_TITLE_PATTERN.test(side.title ?? "")) flags.push("summary");
  if (isOmnibusTitle(side.title ?? "")) flags.push(kind === "audio" ? "omnibus_audio" : "omnibus_epub");
  if (kind === "audio" && PART_OF_PATTERN.test(text)) flags.push("part_of");
  const dramatizedAuthor = (side.authors ?? []).some((name) => DRAMATIZED_AUTHOR_PATTERN.test(name));
  if (kind === "audio" && (DRAMATIZED_PATTERN.test(text) || dramatizedAuthor)) flags.push("dramatized");
  return flags;
}
