vi.mock('../reader/epub/epub-media-overlay', () => ({
  buildEpubMediaOverlayPlaylistFromFile: vi.fn().mockResolvedValue({ items: [{}], resources: [{}] }),
}));
vi.mock('./read-aloud-report', () => ({
  parseAlignmentReport: vi.fn(() => ({ totals: {}, chapters: [], tracks: [] })),
  assessCoverage: vi.fn(() => ({ coverage: null, chapters: [] })),
  reportWarnings: vi.fn(() => ({ warnings: [], requiresReview: false })),
}));

import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { readAloudConfig } from '../../config/config';
import { BookService } from '../book/book.service';
import { FileWriteService } from '../file-write/file-write.service';
import { LibraryService } from '../library/library.service';
import { ReadAloudPairsDataModule } from '../read-aloud-pairs/read-aloud-pairs-data.module';
import { ReadAloudPairsRepository } from '../read-aloud-pairs/read-aloud-pairs.repository';
import { GeneratedBookFileService } from '../upload/generated-book-file.service';
import { UserService } from '../user/user.service';

import { CreateReadAloudJobDto } from './dto/create-read-aloud-job.dto';
import { PublishReadAloudJobDto } from './dto/publish-read-aloud-job.dto';
import { ReadAloudController } from './read-aloud.controller';
import { ReadAloudActivityService } from './read-aloud-activity.service';
import { ReadAloudJobRepository } from './read-aloud-job.repository';
import { ReadAloudNotifier } from './read-aloud-notifier.service';
import { jobMatchesPair, ReadAloudPairedEpub } from './read-aloud-paired-epub';
import { ReadAloudPresenter } from './read-aloud-presenter.service';
import { ReadAloudPublisher } from './read-aloud-publisher.service';
import { ReadAloudModule } from './read-aloud.module';
import { ReadAloudService } from './read-aloud.service';
import { ReadAloudWorkerClientService } from './read-aloud-worker-client.service';
import { ReadAloudWorkspace } from './read-aloud-workspace.service';
import { JOB_ID, jobRow, OWNER } from './test-helpers';

const PAIRED_INPUT = {
  epubFileId: 401,
  epubBookId: 40,
  audioFileIds: [102],
  language: 'fr',
  granularity: 'sentence' as const,
  sourceBytes: 8_000,
  replaceFileId: null,
  sourceHashes: { '401': 'paired-hash', '102': 'audio-hash' },
};

function setup(pairChanged = false) {
  const jobs = {
    findReadAlongFiles: vi.fn().mockResolvedValue([]),
    findSourceFiles: vi.fn((bookId: number) => Promise.resolve(bookId === 40 ? [{ id: 401, filename: 'Circe.epub' }] : [])),
    saveReportChapters: vi.fn().mockResolvedValue(undefined),
  };
  const files = { addFile: vi.fn().mockResolvedValue({ fileId: 900, reused: false }), replaceFile: vi.fn() };
  const workspace = {
    outputPath: vi.fn(() => '/data/read-aloud/jobs/x/output.epub'),
    inspect: vi.fn().mockResolvedValue({ isFile: () => true, size: 10 }),
    readReport: vi.fn().mockResolvedValue('{}'),
  };
  const pairedEpub = { pairChanged: vi.fn().mockResolvedValue(pairChanged) };
  const publisher = new ReadAloudPublisher(
    { maxOutputBytes: 1e9 } as never,
    jobs as never,
    workspace as never,
    files as never,
    { record: vi.fn().mockResolvedValue(undefined) } as never,
    { embedAudioCoverInDraft: vi.fn().mockResolvedValue({ code: 'skipped' }) } as never,
    pairedEpub as never,
  );
  return { publisher, jobs, files, pairedEpub };
}

describe('ReadAloudPublisher with a paired ebook', () => {
  const row = jobRow({ status: 'processing', stage: 'publishing', input: PAIRED_INPUT });

  it("names the read-along after the paired ebook's EPUB and adds it to the audiobook record", async () => {
    const { publisher, jobs, files } = setup();
    await publisher.publish(row, OWNER);
    expect(jobs.findSourceFiles).toHaveBeenCalledWith(40, [401]);
    expect(files.addFile).toHaveBeenCalledWith(expect.objectContaining({ bookId: 12, filename: 'Circe.readaloud.epub' }));
  });

  it('asks for review when the audiobook was paired with another ebook while the job ran', async () => {
    const { publisher, pairedEpub } = setup(true);
    await expect(publisher.validate(row)).resolves.toMatchObject({ requiresReview: true });
    expect(pairedEpub.pairChanged).toHaveBeenCalledWith(row);
  });

  it('needs no review for that reason while the pair is unchanged', async () => {
    const { publisher } = setup(false);
    await expect(publisher.validate(row)).resolves.toMatchObject({ requiresReview: false });
  });
});

describe('ReadAloudPresenter with a paired ebook', () => {
  it('says which ebook the text came from', async () => {
    const jobs = {
      findRequesterName: vi.fn().mockResolvedValue('Owner'),
      findBookTitle: vi.fn().mockResolvedValue('Circe'),
      queuePositions: vi.fn(),
    };
    const job = await new ReadAloudPresenter(jobs as never).present(jobRow({ status: 'completed', input: PAIRED_INPUT }), OWNER);
    expect(job.input.epubBookId).toBe(40);
    expect(job.epubBookTitle).toBe('Circe');
    expect(jobs.findBookTitle).toHaveBeenCalledWith(40);
  });

  it('hides the ebook title from a viewer who cannot open that ebook', async () => {
    const jobs = {
      findRequesterName: vi.fn().mockResolvedValue('Owner'),
      findBookTitle: vi.fn().mockResolvedValue('Circe'),
      queuePositions: vi.fn(),
    };
    const other = { ...OWNER, id: 99 };
    const blocked = { canOpen: vi.fn().mockResolvedValue(false) };
    const hidden = await new ReadAloudPresenter(jobs as never, blocked as never).present(jobRow({ status: 'completed', input: PAIRED_INPUT }), other);
    expect(hidden.epubBookTitle).toBeNull();
    expect(blocked.canOpen).toHaveBeenCalledWith(40, other);
    expect(jobs.findBookTitle).not.toHaveBeenCalled();
    const allowed = { canOpen: vi.fn().mockResolvedValue(true) };
    const shown = await new ReadAloudPresenter(jobs as never, allowed as never).present(jobRow({ status: 'completed', input: PAIRED_INPUT }), other);
    expect(shown.epubBookTitle).toBe('Circe');
    const bare = await new ReadAloudPresenter(jobs as never, allowed as never).present(jobRow({ status: 'completed', input: PAIRED_INPUT }), {
      id: 99,
      isSuperuser: false,
    });
    expect(bare.epubBookTitle).toBeNull();
  });

  it("adds nothing for a job on the book's own EPUB", async () => {
    const jobs = { findRequesterName: vi.fn().mockResolvedValue('Owner'), findBookTitle: vi.fn(), queuePositions: vi.fn() };
    const job = await new ReadAloudPresenter(jobs as never).present(jobRow({ status: 'completed' }), OWNER);
    expect(job).not.toHaveProperty('epubBookTitle');
    expect(job.input).not.toHaveProperty('epubBookId');
    expect(jobs.findBookTitle).not.toHaveBeenCalled();
  });
});

describe('ReadAloudPairedEpub with unreadable pairs', () => {
  const broken = () => new ReadAloudPairedEpub({ resolvePairs: vi.fn().mockRejectedValue(new Error('bad json')) } as never, {} as never, {} as never);
  const row = jobRow({ status: 'awaiting_review', input: PAIRED_INPUT });

  it('treats the pair as changed, so review and the 409 flow take over', async () => {
    expect(await broken().pairChanged(row)).toBe(true);
    await expect(broken().assertPublishable(row, false)).rejects.toMatchObject({ response: { errorCode: 'pair_changed' } });
    await expect(broken().assertPublishable(row, true)).resolves.toBeUndefined();
  });
});

describe('jobMatchesPair', () => {
  const pair = { ebookFileId: 401, fileHash: 'paired-hash' };

  it('matches by file id or by the hash the job recorded', () => {
    expect(jobMatchesPair(PAIRED_INPUT, pair)).toBe(true);
    expect(jobMatchesPair(PAIRED_INPUT, { ebookFileId: 999, fileHash: 'paired-hash' })).toBe(true);
    expect(jobMatchesPair(PAIRED_INPUT, { ebookFileId: 999, fileHash: 'other' })).toBe(false);
    expect(jobMatchesPair(PAIRED_INPUT, null)).toBe(false);
  });

  it("always matches a job on the book's own EPUB", () => {
    expect(jobMatchesPair({ ...PAIRED_INPUT, epubBookId: null }, null)).toBe(true);
  });
});

describe('read-aloud HTTP contract for paired ebooks', () => {
  it('passes force through to publish only when it is true', async () => {
    const service = { publish: vi.fn().mockResolvedValue({}) };
    const controller = new ReadAloudController(service as never);
    await controller.publish(JOB_ID, { force: true }, OWNER);
    await controller.publish(JOB_ID, {}, OWNER);
    expect(service.publish.mock.calls).toEqual([
      [JOB_ID, OWNER, true],
      [JOB_ID, OWNER, false],
    ]);
  });

  it('accepts a boolean force and a positive ebook record id only', async () => {
    expect(await validate(plainToInstance(PublishReadAloudJobDto, { force: true }))).toHaveLength(0);
    expect(await validate(plainToInstance(PublishReadAloudJobDto, { force: 'yes' }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(CreateReadAloudJobDto, { epubFileId: 401, epubBookId: 40 }))).toHaveLength(0);
    expect(await validate(plainToInstance(CreateReadAloudJobDto, { epubBookId: 0 }))).not.toHaveLength(0);
  });
});

describe('ReadAloudModule wiring for paired ebooks', () => {
  it('registers the paired ebook helper and the pair storage it reads', () => {
    expect(Reflect.getMetadata('providers', ReadAloudModule)).toContain(ReadAloudPairedEpub);
    expect(Reflect.getMetadata('imports', ReadAloudModule)).toContain(ReadAloudPairsDataModule);
  });

  it('injects the helper into the service and the publisher', async () => {
    const stub = (token: unknown) => ({ provide: token, useValue: {} });
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReadAloudService,
        ReadAloudPublisher,
        ReadAloudPresenter,
        ReadAloudPairedEpub,
        ...[ReadAloudJobRepository, ReadAloudWorkerClientService, BookService, UserService, LibraryService, ReadAloudActivityService].map(stub),
        ...[ReadAloudNotifier, ReadAloudWorkspace, GeneratedBookFileService, FileWriteService, ReadAloudPairsRepository, readAloudConfig.KEY].map(
          stub,
        ),
      ],
    }).compile();
    const helper = moduleRef.get(ReadAloudPairedEpub);
    expect((moduleRef.get(ReadAloudService) as unknown as Record<string, unknown>).pairedEpub).toBe(helper);
    expect((moduleRef.get(ReadAloudPublisher) as unknown as Record<string, unknown>).pairedEpub).toBe(helper);
  });
});
