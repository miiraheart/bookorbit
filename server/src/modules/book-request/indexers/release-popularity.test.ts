import type { ReleaseCandidate } from './indexer-adapter';
import { comparePopularity, popularityShare } from './release-popularity';
import { scoreRelease, type ScoringRequest } from './release-scoring';

/** The shape of a live ebook request: no preferred format, an EPUB-only profile. */
function request(overrides: Partial<ScoringRequest> = {}): ScoringRequest {
  return {
    title: 'Verity',
    authors: ['Colleen Hoover'],
    seriesName: null,
    seriesIndex: null,
    isbn13: null,
    isbn10: null,
    isbns: [],
    mediaKind: 'ebook',
    preferredFormats: [],
    language: 'en',
    tiers: [{ id: 'epub', name: 'EPUB', conditions: { formats: ['epub'] } }],
    ...overrides,
  };
}

/** Shaped like the Anna's Archive plugin's candidate: no swarm, a download count when known. */
function annas(overrides: Partial<ReleaseCandidate> = {}): ReleaseCandidate {
  return {
    indexerId: 3,
    guid: 'aa-1',
    title: 'Colleen Hoover - Verity [epub]',
    bookTitle: 'Verity',
    author: 'Colleen Hoover',
    format: 'epub',
    language: 'en',
    sizeBytes: 1_500_000,
    seeders: null,
    leechers: null,
    grabs: null,
    ...overrides,
  };
}

function torrent(overrides: Partial<ReleaseCandidate> = {}): ReleaseCandidate {
  return { ...annas({ indexerId: 1, guid: 'mam-1', seeders: 254, leechers: 0 }), ...overrides };
}

function reason(scored: ReturnType<typeof scoreRelease>, code: string) {
  return scored.reasons.find((entry) => entry.code === code);
}

describe('release popularity', () => {
  it('gives an AA epub with 10000 downloads the same popularity points as a well seeded torrent', () => {
    const direct = scoreRelease(annas({ grabs: 10_000 }), request());
    const seeded = scoreRelease(torrent(), request());

    expect(reason(direct, 'downloads')).toEqual({ code: 'downloads', points: 12, detail: '10000' });
    expect(reason(seeded, 'seeders')?.points).toBe(12);
    expect(direct.score).toBe(seeded.score);
  });

  it('lifts the correct AA release that scored 77 over the 80 floor once its downloads count', () => {
    expect(scoreRelease(annas(), request()).score).toBe(77);
    expect(scoreRelease(annas({ grabs: 195 }), request()).score).toBeGreaterThanOrEqual(80);
  });

  it('leaves a release with neither seeders nor downloads exactly as it scored before, with no popularity reason', () => {
    const scored = scoreRelease(annas(), request());

    expect(reason(scored, 'downloads')).toBeUndefined();
    expect(reason(scored, 'seeders')).toBeUndefined();
    expect(popularityShare({ seeders: null, grabs: null })).toBeNull();
    expect(popularityShare({ seeders: null })).toBeNull();
  });

  it('keeps the seeders reason when the swarm is the stronger signal, and downloads when they are', () => {
    expect(reason(scoreRelease(torrent({ grabs: 3 }), request()), 'seeders')?.detail).toBe('254');
    expect(reason(scoreRelease(torrent({ seeders: 2, grabs: 4000 }), request()), 'downloads')?.detail).toBe('4000');
  });

  it('saturates downloads at 5000, so 5000 against 9000 adds nothing but 10 against 500 does', () => {
    const points = (grabs: number) => reason(scoreRelease(annas({ grabs }), request()), 'downloads')!.points;

    expect(points(9000) - points(5000)).toBe(0);
    expect(points(500) - points(10)).toBeGreaterThan(4);
  });

  it('still lets the right book beat a wrong book that has huge downloads', () => {
    const wrong = scoreRelease(annas({ title: 'Colleen Hoover - It Ends with Us [epub]', bookTitle: 'It Ends with Us', grabs: 50_000 }), request());
    const right = scoreRelease(annas({ grabs: 40 }), request());

    expect(right.score).toBeGreaterThan(wrong.score);
    expect(wrong.score).toBeLessThan(80);
  });

  it('ranks a stated count above none, and a saturated swarm level with saturated downloads', () => {
    expect(comparePopularity({ seeders: null, grabs: 1 }, { seeders: null, grabs: null })).toBeLessThan(0);
    expect(comparePopularity({ seeders: 254 }, { seeders: null, grabs: 10_000 })).toBe(0);
    expect(comparePopularity({ seeders: 254 }, { seeders: null, grabs: 200 })).toBeLessThan(0);
  });
});
