import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ReadAlongPair, ReadAloudCandidateFile, ReadAloudJobInput } from '@bookorbit/types';
import { isContentBookFile, READ_ALOUD_PAIR_CHANGED_ERROR } from '@bookorbit/types';

import type { RequestUser } from '../../common/types/request-user';
import { sanitizeLogValue } from '../../common/utils/log-sanitize.utils';
import type { ReadAloudJobRow } from '../../db/schema';
import { BookService } from '../book/book.service';
import { madeFromPair } from '../read-aloud-pairs/read-aloud-match-index.repository';
import { ReadAloudPairsRepository } from '../read-aloud-pairs/read-aloud-pairs.repository';
import { errorMessage, ReadAloudJobError } from './read-aloud-errors';
import { ReadAloudJobRepository, type ReadAloudJobPayload, type ReadAloudSourceFile } from './read-aloud-job.repository';

/** The plain EPUB an audiobook is paired with, in the ebook's own record. */
export type PairedEpub = {
  pair: ReadAlongPair;
  file: ReadAloudSourceFile;
  folderPath: string;
  libraryName: string | null;
};

type SourceSelection = Pick<ReadAloudJobInput, 'epubFileId' | 'epubBookId' | 'audioFileIds'>;

/** The job's EPUB from the record it lives in and its audio from the job's own book, in one list. */
export async function findJobSourceFiles(
  jobs: Pick<ReadAloudJobRepository, 'findSourceFiles'>,
  bookId: number,
  input: SourceSelection,
): Promise<ReadAloudSourceFile[]> {
  if (input.epubBookId == null) return jobs.findSourceFiles(bookId, [input.epubFileId, ...input.audioFileIds]);
  const [epub, audio] = await Promise.all([
    jobs.findSourceFiles(input.epubBookId, [input.epubFileId]),
    jobs.findSourceFiles(bookId, input.audioFileIds),
  ]);
  return [...epub, ...audio];
}

export function pairedEpubCandidate(paired: PairedEpub): ReadAloudCandidateFile {
  return {
    id: paired.file.id,
    filename: paired.file.filename,
    format: 'epub',
    sizeBytes: paired.file.sizeBytes,
    durationSeconds: null,
    bookId: paired.pair.ebookBookId,
    libraryName: paired.libraryName,
    language: paired.pair.language,
  };
}

/** Whether the job read the EPUB the audiobook is paired with now, by file id or by content. A job on the book's own EPUB always did. */
export function jobMatchesPair(input: ReadAloudJobPayload, pair: Pick<ReadAlongPair, 'ebookFileId' | 'fileHash'> | null): boolean {
  if (input.epubBookId == null) return true;
  if (!pair) return false;
  return madeFromPair({ epubFileId: input.epubFileId, epubHash: input.sourceHashes[String(input.epubFileId)] ?? null }, pair);
}

function isPlainEpub(file: ReadAloudSourceFile): boolean {
  return isContentBookFile(file) && file.format?.toLowerCase() === 'epub' && !file.mediaOverlayAvailable;
}

/**
 * Read Aloud's view of the audiobook to ebook pairs: which paired EPUB a job may read, and whether
 * a job still reads the EPUB its audiobook is paired with.
 */
@Injectable()
export class ReadAloudPairedEpub {
  private readonly logger = new Logger(ReadAloudPairedEpub.name);

  constructor(
    private readonly pairs: ReadAloudPairsRepository,
    private readonly books: BookService,
    private readonly jobs: ReadAloudJobRepository,
  ) {}

  /** Null when there is no usable pair, its file is gone or not a plain EPUB, or the user cannot open the ebook. */
  async resolve(audiobookBookId: number, user: RequestUser): Promise<PairedEpub | null> {
    try {
      return await this.lookup(audiobookBookId, user);
    } catch (error) {
      this.logger.warn(
        `[read_aloud.paired_epub] [fail] bookId=${audiobookBookId} error="${sanitizeLogValue(errorMessage(error))}" - paired ebook could not be resolved`,
      );
      return null;
    }
  }

  /**
   * A job reading a paired EPUB runs only while its requester can open that ebook. A fresh run also
   * stops when the audiobook was paired with another ebook, which saves hours of work on text nobody
   * wants. A re-sync or an approved publish keeps its cached work; publishing asks about the pair.
   */
  async assertRunnable(row: ReadAloudJobRow, user: RequestUser): Promise<void> {
    const input = row.input as ReadAloudJobPayload;
    if (input.epubBookId == null) return;
    if (!(await this.canOpen(input.epubBookId, user))) {
      throw new ReadAloudJobError('source_missing', 'The requesting account can no longer reach the paired ebook');
    }
    if (!row.publishApproved && row.resumeFrom == null && (await this.pairChanged(row))) {
      throw new ReadAloudJobError('source_missing', 'The audiobook is no longer paired with the ebook this job reads');
    }
  }

  async pairChanged(row: Pick<ReadAloudJobRow, 'bookId' | 'input'>): Promise<boolean> {
    const input = row.input as ReadAloudJobPayload;
    if (input.epubBookId == null) return false;
    const [stored] = await this.pairs.resolvePairs([row.bookId]);
    return !jobMatchesPair(input, stored?.pair ?? null);
  }

  /** Refuses with `pair_changed` when the audiobook was paired with another ebook since, unless the person publishes anyway. */
  async assertPublishable(row: ReadAloudJobRow, force: boolean): Promise<void> {
    if (force || !(await this.pairChanged(row))) return;
    throw new ConflictException({
      errorCode: READ_ALOUD_PAIR_CHANGED_ERROR,
      message: 'The audiobook was paired with another ebook after this read-along was made',
    });
  }

  private async lookup(audiobookBookId: number, user: RequestUser): Promise<PairedEpub | null> {
    const [stored] = await this.pairs.resolvePairs([audiobookBookId]);
    if (!stored || stored.state !== 'ok') return null;
    const { pair } = stored;
    if (!(await this.canOpen(pair.ebookBookId, user))) return null;
    const [[file], placement] = await Promise.all([
      this.jobs.findSourceFiles(pair.ebookBookId, [pair.ebookFileId]),
      this.jobs.findBookPlacement(pair.ebookBookId),
    ]);
    if (!file || !isPlainEpub(file) || !placement || placement.status === 'missing') return null;
    return { pair, file, folderPath: placement.folderPath, libraryName: placement.libraryName };
  }

  private async canOpen(bookId: number, user: RequestUser): Promise<boolean> {
    try {
      await this.books.verifyBookAccess(bookId, user);
      return true;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) return false;
      throw error;
    }
  }
}
