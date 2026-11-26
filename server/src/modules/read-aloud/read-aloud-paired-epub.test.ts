import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { ReadAlongPair } from '@bookorbit/types';

import { ReadAloudPairedEpub } from './read-aloud-paired-epub';
import { ReadAloudPresenter } from './read-aloud-presenter.service';
import { ReadAloudService } from './read-aloud.service';
import { bookDetail, JOB_ID, jobRow, okHealth, OWNER, REPORT_TOTALS, COVERAGE, sourceFiles } from './test-helpers';

const AUDIO = bookDetail().files[1]!;
const OWN_EPUB = bookDetail().files[0]!;
const EBOOK_ID = 40;

const PAIRED_FILE = {
  id: 401,
  absolutePath: '/library/ebooks/circe/Circe.epub',
  filename: 'Circe.epub',
  format: 'epub',
  role: 'content',
  sizeBytes: 3_000,
  durationSeconds: null,
  fileHash: 'paired-hash',
  mediaOverlayAvailable: false,
  sortOrder: 0,
};

function storedPair(overrides: Partial<ReadAlongPair> = {}): ReadAlongPair {
  return {
    audiobookBookId: 12,
    ebookBookId: EBOOK_ID,
    ebookFileId: 401,
    fileHash: 'paired-hash',
    source: 'manual',
    language: 'fr',
    pairedAt: '2026-11-26T00:00:00.000Z',
    pairedBy: OWNER.id,
    ...overrides,
  };
}

const PAIRED_INPUT = {
  epubFileId: 401,
  epubBookId: EBOOK_ID,
  audioFileIds: [102],
  language: 'fr',
  granularity: 'sentence' as const,
  sourceBytes: 8_000,
  replaceFileId: null,
  sourceHashes: { '401': 'paired-hash', '102': 'audio-hash' },
};

function setup(options: { files?: unknown[]; pair?: ReadAlongPair | null; ebookFolder?: string; ebookFile?: typeof PAIRED_FILE } = {}) {
  const ebookFile = options.ebookFile ?? PAIRED_FILE;
  const own = sourceFiles();
  const jobs = {
    findActiveForBook: vi.fn().mockResolvedValue(null),
    findLatestFinishedForViewer: vi.fn().mockResolvedValue(null),
    findReadAlongFiles: vi.fn().mockResolvedValue([]),
    findBookPlacement: vi.fn((bookId: number) =>
      Promise.resolve(
        bookId === EBOOK_ID
          ? { folderPath: options.ebookFolder ?? '/library/ebooks/circe', allowedFormats: [], libraryName: 'English ebooks', status: 'present' }
          : { folderPath: '/library/novel', allowedFormats: [], libraryName: 'Audiobooks', status: 'present' },
      ),
    ),
    findSourceFiles: vi.fn((bookId: number, ids: number[]) =>
      Promise.resolve((bookId === EBOOK_ID ? [ebookFile] : own).filter((file) => ids.includes(file.id))),
    ),
    findById: vi.fn().mockResolvedValue(jobRow({ status: 'awaiting_review', stage: 'awaiting_review', input: PAIRED_INPUT })),
    findRequesterName: vi.fn().mockResolvedValue('Owner'),
    findBookTitle: vi.fn().mockResolvedValue('Circe'),
    queuePositions: vi.fn().mockResolvedValue(new Map()),
    create: vi.fn((values: { input: unknown }) => Promise.resolve(jobRow({ input: values.input as never }))),
    claimForPublishing: vi.fn().mockResolvedValue(jobRow({ status: 'processing', stage: 'publishing', input: PAIRED_INPUT })),
    complete: vi.fn().mockResolvedValue(null),
    fail: vi.fn().mockResolvedValue(null),
  };
  const worker = { healthState: vi.fn().mockResolvedValue(okHealth()), lastKnownHealthState: vi.fn().mockResolvedValue(okHealth()) };
  const books = {
    getDetail: vi.fn().mockResolvedValue(bookDetail({ language: '', files: options.files ?? [AUDIO] })),
    verifyBookAccess: vi.fn().mockResolvedValue(undefined),
  };
  const pair = options.pair === undefined ? storedPair() : options.pair;
  const pairs = { resolvePairs: vi.fn(() => Promise.resolve(pair ? [{ pair, state: 'ok', repaired: false }] : [])) };
  const pairedEpub = new ReadAloudPairedEpub(pairs as never, books as never, jobs as never);
  const service = new ReadAloudService(
    jobs as never,
    worker as never,
    books as never,
    { findByIdWithPermissions: vi.fn().mockResolvedValue(OWNER) } as never,
    { findOne: vi.fn().mockResolvedValue({ organizationMode: 'book_per_folder' }) } as never,
    new ReadAloudPresenter(jobs as never),
    { record: vi.fn().mockResolvedValue(undefined) } as never,
    { pushUpdate: vi.fn(), notify: vi.fn(), jobsChanged: vi.fn() } as never,
    {
      withHeartbeat: vi.fn((_id: string, fn: () => Promise<unknown>) => fn()),
      validate: vi.fn().mockResolvedValue({ report: REPORT_TOTALS, coverage: COVERAGE, warnings: [], requiresReview: false, outputBytes: 10 }),
      publish: vi.fn().mockResolvedValue(555),
    } as never,
    { dir: vi.fn((id: string) => `/data/read-aloud/jobs/${id}`), remove: vi.fn().mockResolvedValue(undefined) } as never,
    pairedEpub,
  );
  return { service, jobs, books, pairs };
}

const PAIRED_CANDIDATE = {
  id: 401,
  filename: 'Circe.epub',
  format: 'epub',
  sizeBytes: 3_000,
  durationSeconds: null,
  bookId: EBOOK_ID,
  libraryName: 'English ebooks',
  language: 'fr',
};

describe('read-aloud capability with a paired ebook', () => {
  it('lists the paired EPUB with its record and library, so an audiobook with no EPUB of its own is eligible', async () => {
    const { service, books } = setup();
    const capability = await service.capability(12, OWNER);
    expect(capability.epubFiles).toEqual([PAIRED_CANDIDATE]);
    expect(capability).toMatchObject({ eligible: true, reason: null, estimatedOutputBytes: Math.ceil(8_000 * 1.08) });
    expect(books.verifyBookAccess).toHaveBeenCalledWith(EBOOK_ID, OWNER);
  });

  it("keeps the book's own EPUB first", async () => {
    const { service } = setup({ files: [OWN_EPUB, AUDIO] });
    const capability = await service.capability(12, OWNER);
    expect(capability.epubFiles.map((file) => file.id)).toEqual([101, 401]);
  });

  it('leaves the paired EPUB out when the viewer cannot open that ebook', async () => {
    const { service, books } = setup();
    books.verifyBookAccess.mockRejectedValue(new NotFoundException());
    const capability = await service.capability(12, OWNER);
    expect(capability.epubFiles).toEqual([]);
    expect(capability.reason).toBe('no_epub');
  });

  it('leaves out a paired file that already carries a media overlay', async () => {
    const { service } = setup({ ebookFile: { ...PAIRED_FILE, mediaOverlayAvailable: true } });
    expect((await service.capability(12, OWNER)).reason).toBe('no_epub');
  });

  it("reports an unmounted library when only the paired ebook's folder is out of the worker's reach", async () => {
    const { service } = setup({ ebookFolder: '/elsewhere/circe' });
    expect((await service.capability(12, OWNER)).reason).toBe('library_not_mounted');
  });
});

describe('creating a job from the paired ebook', () => {
  it('reads the EPUB from the ebook record, checks access on both books and keeps both hashes', async () => {
    const { service, jobs, books } = setup();
    const job = await service.create(12, { epubFileId: 401, epubBookId: EBOOK_ID }, OWNER);
    expect(books.getDetail).toHaveBeenCalledWith(12, OWNER);
    expect(books.verifyBookAccess).toHaveBeenCalledWith(EBOOK_ID, OWNER);
    expect(jobs.findSourceFiles).toHaveBeenCalledWith(EBOOK_ID, [401]);
    expect(jobs.findSourceFiles).toHaveBeenCalledWith(12, [102]);
    expect(jobs.create.mock.calls[0]![0].input).toEqual({
      epubFileId: 401,
      epubBookId: EBOOK_ID,
      audioFileIds: [102],
      language: 'fr',
      granularity: 'sentence',
      sourceBytes: 8_000,
      replaceFileId: null,
      sourceHashes: { '401': 'paired-hash', '102': 'audio-hash' },
    });
    expect(job.input.epubBookId).toBe(EBOOK_ID);
    expect(job.epubBookTitle).toBe('Circe');
  });

  it('never picks the EPUB on its own while a paired one is there', async () => {
    const { service } = setup({ files: [OWN_EPUB, AUDIO] });
    await expect(service.create(12, {}, OWNER)).rejects.toThrow('Select an EPUB source');
  });

  it('rejects an ebook record that is not the paired one', async () => {
    const { service } = setup();
    await expect(service.create(12, { epubFileId: 401, epubBookId: 41 }, OWNER)).rejects.toThrow(BadRequestException);
  });

  it('rejects the paired file once the requester cannot open the ebook', async () => {
    const { service, books, jobs } = setup();
    books.verifyBookAccess.mockRejectedValue(new NotFoundException());
    await expect(service.create(12, { epubFileId: 401 }, OWNER)).rejects.toThrow('Selected EPUB is not an eligible source');
    expect(jobs.create).not.toHaveBeenCalled();
  });

  it("rejects the paired file when the worker cannot reach the ebook's folder", async () => {
    const { service } = setup({ ebookFolder: '/elsewhere/circe' });
    await expect(service.create(12, { epubFileId: 401 }, OWNER)).rejects.toThrow('not mounted');
  });
});

describe('running a job that reads a paired ebook', () => {
  const queued = (overrides = {}) => jobRow({ status: 'processing', input: PAIRED_INPUT, ...overrides });

  it('hands the worker the EPUB from the ebook record', async () => {
    const { service } = setup();
    const context = await service.resolveProcessingContext(queued());
    expect(context.request).toMatchObject({ epubPath: PAIRED_FILE.absolutePath, audioPaths: ['/library/novel/01.mp3'], language: 'fr' });
  });

  it('fails with source_missing once the audiobook is unpaired', async () => {
    const { service } = setup({ pair: null });
    await expect(service.resolveProcessingContext(queued())).rejects.toMatchObject({ code: 'source_missing' });
  });

  it('fails with source_missing once the audiobook is paired with another file', async () => {
    const { service } = setup({ pair: storedPair({ ebookFileId: 402, fileHash: 'other-hash' }) });
    await expect(service.resolveProcessingContext(queued())).rejects.toMatchObject({ code: 'source_missing' });
  });

  it('fails with source_changed when the paired file was swapped on disk', async () => {
    const { service } = setup({ ebookFile: { ...PAIRED_FILE, fileHash: 'rewritten' } });
    await expect(service.resolveProcessingContext(queued())).rejects.toMatchObject({ code: 'source_changed' });
  });

  it('fails with source_missing when the requester can no longer open the ebook', async () => {
    const { service, books } = setup();
    books.verifyBookAccess.mockImplementation((bookId: number) =>
      bookId === EBOOK_ID ? Promise.reject(new NotFoundException()) : Promise.resolve(),
    );
    await expect(service.resolveProcessingContext(queued())).rejects.toMatchObject({ code: 'source_missing' });
  });

  it('keeps the cached work of a re-sync after the pair changed', async () => {
    const { service } = setup({ pair: null });
    await expect(service.resolveProcessingContext(queued({ resumeFrom: 'aligning' }))).resolves.toBeDefined();
  });

  it('keeps running a job someone already chose to publish after the pair changed', async () => {
    const { service } = setup({ pair: null });
    await expect(service.resolveProcessingContext(queued({ publishApproved: true }))).resolves.toBeDefined();
  });
});

describe('publishing a job that read a paired ebook', () => {
  it('answers 409 pair_changed when the audiobook was paired with another ebook since', async () => {
    const { service, jobs } = setup({ pair: storedPair({ ebookBookId: 41, ebookFileId: 402, fileHash: 'other-hash' }) });
    const error = await service.publish(JOB_ID, OWNER).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ errorCode: 'pair_changed' });
    expect(jobs.claimForPublishing).not.toHaveBeenCalled();
  });

  it('publishes anyway when forced', async () => {
    const { service, jobs } = setup({ pair: null });
    await expect(service.publish(JOB_ID, OWNER, true)).resolves.toMatchObject({ stage: 'publishing' });
    expect(jobs.claimForPublishing).toHaveBeenCalledWith(JOB_ID);
  });

  it('publishes when the pair now names a copy with the same content', async () => {
    const { service, jobs } = setup({ pair: storedPair({ ebookBookId: 41, ebookFileId: 402 }) });
    await service.publish(JOB_ID, OWNER);
    expect(jobs.claimForPublishing).toHaveBeenCalledWith(JOB_ID);
  });
});
