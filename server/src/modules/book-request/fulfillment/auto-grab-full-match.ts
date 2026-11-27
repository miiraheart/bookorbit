import { languagesAgree } from '@bookorbit/types';
import type { ReleaseCandidateItem } from '@bookorbit/types';

import { comparePopularity } from '../indexers/release-popularity';
import { WEIGHTS } from '../indexers/release-scoring';

export interface FullMatchRule {
  floor: number;
  /** A release profile is active for the medium, so its tiers say which format is wanted. */
  profiled: boolean;
  language: string | null;
}

/**
 * A release that is exactly the requested book and is held under the floor only by a small
 * download or seeder count. When nothing better clears the floor, it is still worth grabbing.
 *
 * Full match means all of:
 * - an `authorMatch` reason at the whole match weight, so title and author both agree. An
 *   `isbnMatch` does not count (it only needs a partial title or author), nor does a title-only
 *   match for a request with no author;
 * - the wanted format: in a profile tier when a profile is active, else a preferred format;
 * - the request names a language, and the release states one that agrees;
 * - no penalty at all (no suspicious size, not likely several books);
 * - a stated popularity whose missing points alone explain the gap to the floor.
 *
 * Releases failing a hard filter never reach this list, and a wrong book fails the first rule.
 */
export function fullMatchShortOnPopularity(release: ReleaseCandidateItem, rule: FullMatchRule): boolean {
  const { reasons } = release;
  const match = reasons.find((reason) => reason.code === 'authorMatch');
  if (!match || match.points < WEIGHTS.match) return false;

  const wantedFormat = rule.profiled ? release.tier !== null : reasons.some((reason) => reason.code === 'preferredFormat');
  if (!wantedFormat) return false;
  if (!rule.language || !release.language || !languagesAgree(rule.language, release.language)) return false;
  if (reasons.some((reason) => reason.points < 0)) return false;

  const popularity = reasons.find((reason) => reason.code === 'seeders' || reason.code === 'downloads');
  if (!popularity) return false;
  return release.score + WEIGHTS.seeders - popularity.points >= rule.floor;
}

const MATCH_CODES = new Set(['authorMatch', 'isbnMatch', 'titleMatch']);

/** The match reason scored the whole match weight: certainly the requested book. */
function matchesFully(release: Pick<ReleaseCandidateItem, 'reasons'>): boolean {
  return release.reasons.some((reason) => MATCH_CODES.has(reason.code) && reason.points >= WEIGHTS.match);
}

/**
 * Unattended grab order within a tier. Popularity decides only among releases that are certainly
 * the requested book. A partial match, such as a co-credited or different author, ranks below every
 * full one and by score among its kind, so ten thousand downloads never carry the wrong book.
 */
export function compareForAutoGrab(a: ReleaseCandidateItem, b: ReleaseCandidateItem): number {
  const full = Number(matchesFully(b)) - Number(matchesFully(a));
  if (full !== 0) return full;
  const popularity = matchesFully(a) ? comparePopularity(a, b) : 0;
  return popularity || b.score - a.score || (b.seeders ?? -1) - (a.seeders ?? -1);
}
