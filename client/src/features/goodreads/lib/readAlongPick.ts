import {
  normalizeReadAlongLanguage,
  PART_OF_PATTERN,
  readAlongTitleFlags,
  type ReleaseCandidateItem,
  type ReleaseScoreReasonCode,
} from '@bookorbit/types'

/**
 * Match points out of 61 a release needs to count as the requested work. Calibrated on the scorer:
 * the right book with a "(Series, #1)" tag left in the request title scores 47 to 50, a sequel or
 * a sibling title by the same author 29 to 35.
 */
export const READ_ALONG_MATCH_FLOOR = 42

const MATCH_CODES: ReadonlySet<ReleaseScoreReasonCode> = new Set(['isbnMatch', 'titleMatch', 'authorMatch'])

/** Why a half has no pick, from the first filter that left nothing. */
export type ReadAlongMissing = 'noRelease' | 'noMatch' | 'flagged' | 'language'

export interface ReadAlongHalfPick {
  pick: ReleaseCandidateItem | null
  /** Every release that passed, best first: the list Swap offers. */
  ranked: ReleaseCandidateItem[]
  missing: ReadAlongMissing | null
}

export interface ReadAlongWork {
  language: string | null
}

type Filter = [ReadAlongMissing, (release: ReleaseCandidateItem) => boolean]

export function matchReason(release: ReleaseCandidateItem) {
  return release.reasons.find((reason) => MATCH_CODES.has(reason.code)) ?? null
}

function matchesWork(release: ReleaseCandidateItem): boolean {
  if (release.seeders === 0 || release.reasons.some((reason) => reason.code === 'suspiciousSize')) return false
  const match = matchReason(release)
  return match !== null && (match.code === 'isbnMatch' || match.points >= READ_ALONG_MATCH_FLOOR)
}

export function isEpubRelease(release: ReleaseCandidateItem): boolean {
  return [release.format, ...release.formats].some((format) => format?.toLowerCase() === 'epub')
}

/** Descending, with an unknown count after every known one, including zero. */
function countDesc(a: number | null | undefined, b: number | null | undefined): number {
  return (b ?? -1) - (a ?? -1)
}

function byPopularity(a: ReleaseCandidateItem, b: ReleaseCandidateItem): number {
  return countDesc(a.seeders, b.seeders) || countDesc(a.grabs, b.grabs) || b.score - a.score
}

function narrow(releases: readonly ReleaseCandidateItem[], filters: Filter[]): { kept: ReleaseCandidateItem[]; missing: ReadAlongMissing | null } {
  if (releases.length === 0) return { kept: [], missing: 'noRelease' }
  let kept = [...releases]
  for (const [missing, keep] of filters) {
    kept = kept.filter(keep)
    if (kept.length === 0) return { kept, missing }
  }
  return { kept, missing: null }
}

function result(kept: ReleaseCandidateItem[], missing: ReadAlongMissing | null): ReadAlongHalfPick {
  return { pick: kept[0] ?? null, ranked: kept, missing }
}

/** Unabridged, single-volume, single-narrator audiobooks of the work, the most seeded first. */
export function rankAudiobookReleases(releases: readonly ReleaseCandidateItem[]): ReadAlongHalfPick {
  const { kept, missing } = narrow(releases, [
    ['noMatch', matchesWork],
    ['flagged', (release) => readAlongTitleFlags({ title: release.title }, 'audio').length === 0],
  ])
  return result(kept.sort(byPopularity), missing)
}

/** The language the ebook must be in: the picked audiobook's, else the work's. */
export function readAlongLanguage(audio: ReleaseCandidateItem | null, work: ReadAlongWork): string | null {
  return normalizeReadAlongLanguage(audio?.language) ?? normalizeReadAlongLanguage(work.language)
}

/** An ebook with no stated language is taken only when the work's language is known and is the target. */
function languageFits(release: ReleaseCandidateItem, target: string | null, work: ReadAlongWork): boolean {
  if (target === null) return true
  const stated = normalizeReadAlongLanguage(release.language)
  if (stated !== null) return stated === target
  return normalizeReadAlongLanguage(work.language) === target
}

function ebookOrder(a: ReleaseCandidateItem, b: ReleaseCandidateItem): number {
  const epub = Number(isEpubRelease(b)) - Number(isEpubRelease(a))
  const torrent = Number(b.seeders !== null) - Number(a.seeders !== null)
  return epub || torrent || byPopularity(a, b)
}

/** Ebooks that read along with the chosen audiobook: same language, no flags, EPUB and torrents first. */
export function rankEbookReleases(
  releases: readonly ReleaseCandidateItem[],
  audio: ReleaseCandidateItem | null,
  work: ReadAlongWork,
): ReadAlongHalfPick {
  const target = readAlongLanguage(audio, work)
  const { kept, missing } = narrow(releases, [
    ['noMatch', matchesWork],
    ['flagged', (release) => readAlongTitleFlags({ title: release.title }, 'epub').length === 0 && !PART_OF_PATTERN.test(release.title)],
    ['language', (release) => languageFits(release, target, work)],
  ])
  return result(kept.sort(ebookOrder), missing)
}

/** Null for a half that is not being picked, such as one already in the library. */
export function pickReadAlongPair(
  audioReleases: readonly ReleaseCandidateItem[] | null,
  ebookReleases: readonly ReleaseCandidateItem[] | null,
  work: ReadAlongWork,
): { audio: ReadAlongHalfPick | null; ebook: ReadAlongHalfPick | null } {
  const audio = audioReleases ? rankAudiobookReleases(audioReleases) : null
  const ebook = ebookReleases ? rankEbookReleases(ebookReleases, audio?.pick ?? null, work) : null
  return { audio, ebook }
}
