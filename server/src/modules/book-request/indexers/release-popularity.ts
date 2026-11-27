/** Seeders past this add nothing: 200 against 400 is noise, 1 against 20 is not. */
export const SEEDER_SATURATION = 60;

/**
 * Downloads past this add nothing. A direct source has no swarm, so its download count stands in
 * for seeders: an Anna's Archive file fetched ten thousand times is as safe a bet as a saturated
 * torrent.
 */
export const GRABS_SATURATION = 5000;

interface PopularityCounts {
  seeders: number | null;
  grabs?: number | null;
}

/** Log-scaled share of the saturation, from 0 to 1. Null when the source stated no count. */
function logShare(count: number | null | undefined, saturation: number): number | null {
  if (count === null || count === undefined || !Number.isFinite(count)) return null;
  if (count <= 0) return 0;
  return Math.min(1, Math.log10(count + 1) / Math.log10(saturation + 1));
}

export function seederShare(seeders: number | null | undefined): number | null {
  return logShare(seeders, SEEDER_SATURATION);
}

export function grabsShare(grabs: number | null | undefined): number | null {
  return logShare(grabs, GRABS_SATURATION);
}

/** The better of the two signals. Null only when the source stated neither, never read as zero. */
export function popularityShare(release: PopularityCounts): number | null {
  const seeders = seederShare(release.seeders);
  const grabs = grabsShare(release.grabs);
  if (seeders === null) return grabs;
  if (grabs === null) return seeders;
  return Math.max(seeders, grabs);
}

/** Most popular first; a release with no stated count sorts below any that has one. */
export function comparePopularity(a: PopularityCounts, b: PopularityCounts): number {
  return (popularityShare(b) ?? -1) - (popularityShare(a) ?? -1);
}
