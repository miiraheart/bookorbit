import { DEFAULT_BOOK_REQUEST_AUTOMATION_SETTINGS } from '@bookorbit/types';
import type { ReleaseCandidateItem, ReleaseTier } from '@bookorbit/types';

import type { BookRequestRow } from '../../../db/schema';
import type { ReleaseCandidate } from '../indexers/indexer-adapter';
import { scoreRelease, toReleaseItem, type ScoringRequest } from '../indexers/release-scoring';
import { RequestAutomationService } from './request-automation.service';

const EPUB_PROFILE: ReleaseTier[] = [{ id: 'epub', name: 'EPUB', conditions: { formats: ['epub'] } }];

/** The live ebook request shape: no preferred format, the EPUB profile, English. */
function scoring(overrides: Partial<ScoringRequest> = {}): ScoringRequest {
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
    tiers: EPUB_PROFILE,
    ...overrides,
  };
}

/** Scored by the real scorer, so these fixtures carry the score and reasons a live search would. */
function item(overrides: Partial<ReleaseCandidate> = {}, asked: ScoringRequest = scoring()): ReleaseCandidateItem {
  const candidate: ReleaseCandidate = {
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
  return toReleaseItem(scoreRelease(candidate, asked), candidate.indexerId === 3 ? 'annas-archive' : 'myanonamouse', asked);
}

function makeService(passes: ReleaseCandidateItem[][], options: { request?: Partial<BookRequestRow>; profiled?: boolean } = {}) {
  const profiles = { ...DEFAULT_BOOK_REQUEST_AUTOMATION_SETTINGS.profiles, ebook: options.profiled === false ? [] : EPUB_PROFILE };
  const request = { id: 7, title: 'Verity', status: 'approved', targetLibraryId: 2, mediaKind: 'ebook', authors: ['Colleen Hoover'] };
  const search = vi.fn<() => Promise<unknown>>();
  const result = (releases: ReleaseCandidateItem[]) => ({
    releases,
    indexers: [],
    enabledIndexerCount: 1,
    configuredIndexerCount: 1,
    uncoveredIndexerCount: 0,
  });
  for (const releases of passes) search.mockResolvedValueOnce(result(releases));
  search.mockResolvedValue(result(passes[passes.length - 1]));
  const fulfillment = { grab: vi.fn().mockResolvedValue(undefined), setRequestStatus: vi.fn().mockResolvedValue(true) };
  const service = new RequestAutomationService(
    { get: vi.fn().mockResolvedValue({ ...DEFAULT_BOOK_REQUEST_AUTOMATION_SETTINGS, autoGrabEnabled: true, profiles }) } as never,
    { findById: vi.fn().mockResolvedValue({ request: { language: 'en', isbn13: null, ...request, ...options.request } }) } as never,
    { countAutomatedForRequest: vi.fn().mockResolvedValue(0), findTriedReleaseKeys: vi.fn().mockResolvedValue(new Set()) } as never,
    { search } as never,
    fulfillment as never,
    { on: vi.fn() } as never,
    { notifyApprovers: vi.fn().mockResolvedValue(undefined) } as never,
    { wait: vi.fn().mockResolvedValue(undefined) } as never,
  );
  return { service, fulfillment, search };
}

async function grabbed(passes: ReleaseCandidateItem[][], options?: Parameters<typeof makeService>[1]): Promise<string | null> {
  const { service, fulfillment } = makeService(passes, options);
  service.considerRequest(7);
  await new Promise((resolve) => setImmediate(resolve));
  const call = fulfillment.grab.mock.calls[0] as [number, { releaseGuid: string }] | undefined;
  return call ? call[1].releaseGuid : null;
}

const MAM_254 = { indexerId: 1, guid: 'mam-254', seeders: 254, leechers: 0 };

describe('auto-grab picks the most popular eligible release', () => {
  it('picks the matching release with more downloads over a matching one with fewer', async () => {
    const few = item({ guid: 'aa-200', grabs: 200 });
    const many = item({ guid: 'aa-9000', grabs: 9000 });

    expect(await grabbed([[few, many]])).toBe('aa-9000');
  });

  it('picks a matching MAM release with 254 seeders over a matching AA release with 200 downloads', async () => {
    expect(await grabbed([[item({ guid: 'aa-200', grabs: 200 }), item(MAM_254)]])).toBe('mam-254');
  });

  it('prefers the more popular release even when a less popular one scores higher', async () => {
    const popular = item({ guid: 'aa-9000', grabs: 9000 });
    const higher = item({ ...MAM_254, guid: 'mam-20', seeders: 20, freeleech: true });

    expect(higher.score).toBeGreaterThan(popular.score);
    expect(await grabbed([[higher, popular]])).toBe('aa-9000');
  });

  it('falls back to score when two releases are equally popular', async () => {
    const plain = item({ guid: 'aa-plain', grabs: 10_000 });
    const freeleech = item({ ...MAM_254, guid: 'mam-fl', freeleech: true });

    expect(freeleech.score).toBeGreaterThan(plain.score);
    expect(await grabbed([[plain, freeleech]])).toBe('mam-fl');
  });

  it('never grabs a wrong book with huge downloads under the floor, and prefers the right book', async () => {
    const wrong = item({ guid: 'wrong', title: 'Colleen Hoover - It Ends with Us [epub]', bookTitle: 'It Ends with Us', grabs: 50_000 });

    expect(wrong.score).toBeLessThan(80);
    expect(await grabbed([[wrong]])).toBeNull();
    expect(await grabbed([[wrong, item({ guid: 'right', grabs: 300 })]])).toBe('right');
  });

  it('leaves a release with neither seeders nor downloads below the floor where it was', async () => {
    const unknown = item({ guid: 'aa-unknown', sizeBytes: null });

    expect(await grabbed([[unknown]])).toBeNull();
  });
});

describe('auto-grab takes a full match held under the floor by popularity alone', () => {
  it('grabs a lone correct AA EPUB with 12 downloads', async () => {
    const lone = item({ guid: 'aa-12', grabs: 12 });

    expect(await grabbed([[lone]])).toBe('aa-12');
  });

  it('grabs a lone correct AA EPUB at 78 because full title, author, format and language match and only downloads are missing', async () => {
    const lone = item({ guid: 'aa-1dl', grabs: 1 });

    expect(lone.score).toBeLessThan(80);
    expect(await grabbed([[lone]])).toBe('aa-1dl');
  });

  it('does not grab the same release when its title does not fully match the request', async () => {
    const mismatch = item({
      guid: 'aa-sequel',
      title: 'Colleen Hoover - Verity Deluxe Edition [epub]',
      bookTitle: 'Verity Deluxe Edition',
      grabs: 1,
    });

    expect(mismatch.score).toBeLessThan(80);
    expect(await grabbed([[mismatch]])).toBeNull();
  });

  it('does not count a near miss whose title and author match short of the full match weight', async () => {
    const partial = item({ guid: 'aa-partial', author: 'Hoover', grabs: 1 });
    const match = partial.reasons.find((reason) => reason.code === 'authorMatch');

    expect(match!.points).toBeLessThan(61);
    expect(partial.score + 12 - 1).toBeGreaterThanOrEqual(80);
    expect(await grabbed([[partial]])).toBeNull();
  });

  it('tries every release that clears the floor before a full match that only falls short on popularity', async () => {
    const lone = item({ guid: 'aa-4dl', grabs: 4 });
    const cleared = item({ ...MAM_254, guid: 'mam-1', seeders: 1, freeleech: true });

    expect(lone.score).toBeLessThan(80);
    expect(cleared.score).toBeGreaterThanOrEqual(80);
    expect(await grabbed([[lone, cleared]])).toBe('mam-1');
  });

  it('does not count an ISBN match as a full match, since it only needs part of the title or author', async () => {
    const asked = scoring({ isbn13: '9781538724736' });
    const byIsbn = item({ guid: 'aa-isbn', isbn: '9781538724736', grabs: 1 }, asked);

    expect(byIsbn.reasons.some((reason) => reason.code === 'isbnMatch')).toBe(true);
    expect(byIsbn.score).toBeLessThan(80);
    expect(await grabbed([[byIsbn]], { request: { isbn13: '9781538724736' } })).toBeNull();
  });

  it('does not count a title-only match for a request with no author', async () => {
    const asked = scoring({ authors: [] });
    const titleOnly = item({ guid: 'aa-noauthor', grabs: 1 }, asked);

    expect(titleOnly.reasons.some((reason) => reason.code === 'titleMatch')).toBe(true);
    expect(titleOnly.score).toBeLessThan(80);
    expect(await grabbed([[titleOnly]], { request: { authors: [] } })).toBeNull();
  });

  it('does not count a release whose language is unstated when the request names one', async () => {
    expect(await grabbed([[item({ guid: 'aa-nolang', language: undefined, grabs: 1 })]])).toBeNull();
  });

  it('does not count a release without a preferred format when no profile is active', async () => {
    expect(await grabbed([[item({ guid: 'aa-1dl', grabs: 1 })]], { profiled: false })).toBeNull();
  });

  it('does not count a release with a penalty such as likely several books', async () => {
    expect(await grabbed([[item({ guid: 'aa-pack', grabs: 1, fileCount: 30 })]])).toBeNull();
  });

  it('does not count a full match whose gap to the floor is more than the popularity it lacks', async () => {
    const short = item({ guid: 'aa-nosize', grabs: 12, sizeBytes: null });

    expect(short.score).toBeLessThan(80);
    expect(await grabbed([[short]])).toBeNull();
  });

  it('keeps searching past a full match under the floor and grabs a later release that clears it', async () => {
    const lone = item({ guid: 'aa-1dl', grabs: 1 });
    const { service, fulfillment, search } = makeService([[lone], [lone, item(MAM_254)]], { request: { isbn13: '9781538724736' } });

    service.considerRequest(7);
    await new Promise((resolve) => setImmediate(resolve));

    expect(search).toHaveBeenCalledTimes(2);
    expect(fulfillment.grab).toHaveBeenCalledWith(7, { indexerId: 1, releaseGuid: 'mam-254' }, null);
  });
});
