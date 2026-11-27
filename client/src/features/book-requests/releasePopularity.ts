import type { ReleaseCandidateItem } from '@bookorbit/types'

import { formatDate } from '@/i18n/formatters'

/**
 * Mirrors server/src/modules/book-request/indexers/release-popularity.ts, which ranks the
 * unattended grab. Both tests pin the same table, so the picker's "Most popular" sort and the
 * automation cannot drift apart unnoticed.
 */
const SEEDER_SATURATION = 60
const GRABS_SATURATION = 5000

type PopularityCounts = Pick<ReleaseCandidateItem, 'seeders' | 'grabs'>
type Translate = (key: string, values?: Record<string, unknown>) => string

function logShare(count: number | null | undefined, saturation: number): number | null {
  if (count === null || count === undefined || !Number.isFinite(count)) return null
  if (count <= 0) return 0
  return Math.min(1, Math.log10(count + 1) / Math.log10(saturation + 1))
}

/** The better of the two signals, from 0 to 1. Null only when the source stated neither. */
export function popularityShare(release: PopularityCounts): number | null {
  const seeders = logShare(release.seeders, SEEDER_SATURATION)
  const grabs = logShare(release.grabs, GRABS_SATURATION)
  if (seeders === null) return grabs
  if (grabs === null) return seeders
  return Math.max(seeders, grabs)
}

export function hasPopularity(release: PopularityCounts): boolean {
  return popularityShare(release) !== null
}

/** "1,204 downloads", or null where the source stated no count. */
export function downloadsText(release: PopularityCounts, t: Translate): string | null {
  const grabs = release.grabs
  if (typeof grabs !== 'number' || !Number.isFinite(grabs)) return null
  return t('bookRequests.releases.downloadCountPlural', { count: grabs })
}

export interface ReleaseDateText {
  /** For the row's line of facts. */
  short: string
  /** For the score details, where the date stands on its own. */
  long: string
}

/**
 * A source that knows only the year pads it to January 1, and showing that as a day would claim a
 * precision nobody stated. The year is read in UTC, where the padding was written.
 */
export function releaseDateText(release: Pick<ReleaseCandidateItem, 'publishedAt' | 'publishedPrecision'>, t: Translate): ReleaseDateText | null {
  if (!release.publishedAt) return null
  const date = new Date(release.publishedAt)
  if (release.publishedPrecision === 'year') {
    const text = t('bookRequests.releases.publishedYear', { year: String(date.getUTCFullYear()) })
    return { short: text, long: text }
  }
  const short = formatDate(date, { dateStyle: 'medium' })
  return { short, long: t('bookRequests.releases.addedOn', { date: short }) }
}
