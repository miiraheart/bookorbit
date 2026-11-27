import { languagesAgree } from '@bookorbit/types';
import type { ReleaseCandidateItem } from '@bookorbit/types';

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
 * - the release language is stated and agrees, when the request names one;
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
  if (rule.language && !(release.language && languagesAgree(rule.language, release.language))) return false;
  if (reasons.some((reason) => reason.points < 0)) return false;

  const popularity = reasons.find((reason) => reason.code === 'seeders' || reason.code === 'downloads');
  if (!popularity) return false;
  return release.score + WEIGHTS.seeders - popularity.points >= rule.floor;
}
