import { BadRequestException, Injectable } from '@nestjs/common';
import {
  isAudioFormat,
  READ_ALOUD_QUARTZNET_LANGUAGES,
  type PairEbookRequest,
  type PairEbookResponse,
  type ReadAlongDismissalsResponse,
  type ReadAlongPairSource,
  type UnpairEbookResponse,
} from '@bookorbit/types';

import type { RequestUser } from '../../common/types/request-user';
import { BookService } from '../book/book.service';
import { canReplaceReadAlong } from '../read-aloud/read-aloud-presenter.service';
import { ReadAlongMatchIndex, type ReadAlongIndexView } from './read-aloud-match-index';
import { madeFromPair, ReadAloudMatchIndexRepository, type ReadAlongBookFile } from './read-aloud-match-index.repository';
import { normalizeReadAlongLanguage, resolveReadAlongLanguage } from './read-aloud-match-keys';
import {
  dismissedFor,
  dismissReadAlongCandidate,
  removeReadAlongPair,
  setReadAlongPair,
  toReadAlongPair,
  undismissReadAlongCandidate,
  type ReadAlongPairEntry,
} from './read-aloud-pairs-store';
import { ReadAloudPairsRepository } from './read-aloud-pairs.repository';

const QUARTZNET_LANGUAGES = new Set<string>(READ_ALOUD_QUARTZNET_LANGUAGES);

export function isPlainEpubContent(file: ReadAlongBookFile | undefined, ebookBookId: number): file is ReadAlongBookFile {
  return (
    file !== undefined &&
    file.bookId === ebookBookId &&
    file.role === 'content' &&
    file.format?.toLowerCase() === 'epub' &&
    !file.mediaOverlayAvailable
  );
}

/**
 * The language a job should use when the audiobook does not say: the one chosen, else the ebook's
 * own tag or its library's language. Null when the audiobook already carries a usable tag.
 */
export function pairLanguage(view: ReadAlongIndexView, audiobookBookId: number, ebookBookId: number, chosen: string | null): string | null {
  if (chosen) return chosen;
  const audio = view.findAudio(audiobookBookId);
  if (audio && normalizeReadAlongLanguage(audio.language)) return null;
  const ebook = view.findEbook(ebookBookId);
  return ebook ? resolveReadAlongLanguage(ebook).code : null;
}

export function buildPairEntry(input: {
  ebookBookId: number;
  file: ReadAlongBookFile;
  user: RequestUser;
  source: ReadAlongPairSource;
  language: string | null;
}): ReadAlongPairEntry {
  return {
    ebookBookId: input.ebookBookId,
    ebookFileId: input.file.id,
    fileHash: input.file.fileHash,
    pairedAt: new Date().toISOString(),
    pairedBy: input.user.id,
    source: input.source,
    language: input.language,
  };
}

/**
 * Pair writes. Each one is a single update of the stored pairs, so a change and the dismissal of
 * the old ebook land together or not at all. Editing the audiobook's library is required; the
 * ebook only has to be visible, as for any other link to a book.
 */
@Injectable()
export class ReadAloudPairService {
  constructor(
    private readonly pairs: ReadAloudPairsRepository,
    private readonly index: ReadAlongMatchIndex,
    private readonly files: ReadAloudMatchIndexRepository,
    private readonly books: BookService,
  ) {}

  async pair(bookId: number, dto: PairEbookRequest, user: RequestUser): Promise<PairEbookResponse> {
    if (dto.ebookBookId === bookId) throw new BadRequestException('An audiobook cannot be paired with itself');
    const chosen = this.chosenLanguage(dto.language);
    await this.books.verifyBookAccess(bookId, user, 'editor');
    await this.books.verifyBookAccess(dto.ebookBookId, user);

    const rows = await this.files.findBookFiles([bookId, dto.ebookBookId]);
    if (!rows.some((file) => file.bookId === bookId && file.role === 'content' && isAudioFormat(file.format ?? ''))) {
      throw new BadRequestException('This book has no audiobook file');
    }
    const file = rows.find((row) => row.id === dto.ebookFileId);
    if (!isPlainEpubContent(file, dto.ebookBookId)) throw new BadRequestException('Select a plain EPUB file of that ebook');

    const view = await this.index.forUser(user);
    const entry = buildPairEntry({
      ebookBookId: dto.ebookBookId,
      file,
      user,
      source: 'manual',
      language: pairLanguage(view, bookId, dto.ebookBookId, chosen),
    });
    await this.pairs.update((store) => {
      const previous = store.pairs[String(bookId)];
      if (dto.dismissPrevious && previous && previous.ebookBookId !== dto.ebookBookId) {
        dismissReadAlongCandidate(store, bookId, previous.ebookBookId);
      }
      undismissReadAlongCandidate(store, bookId, dto.ebookBookId);
      setReadAlongPair(store, bookId, entry);
    });
    this.index.invalidate();

    const outputs = await this.files.findReadAlongOutputs([bookId]);
    return {
      pair: toReadAlongPair(bookId, entry),
      readAlongStale: outputs.some((output) => output.epubFileId !== null && !madeFromPair(output, entry)),
    };
  }

  /** Removes the pair only. Read-alongs made from that EPUB are reported so the person can choose to delete them. */
  async unpair(bookId: number, user: RequestUser): Promise<UnpairEbookResponse> {
    await this.books.verifyBookAccess(bookId, user, 'editor');
    const removed = await this.pairs.update((store) => removeReadAlongPair(store, bookId));
    this.index.invalidate();
    const outputs = removed ? await this.files.findReadAlongOutputs([bookId]) : [];
    return {
      removed: removed ? toReadAlongPair(bookId, removed) : null,
      readAlongs: removed ? outputs.filter((output) => madeFromPair(output, removed)).map(({ fileId, filename }) => ({ fileId, filename })) : [],
      canDeleteReadAlong: canReplaceReadAlong(user),
    };
  }

  async dismiss(bookId: number, ebookBookId: number, user: RequestUser): Promise<ReadAlongDismissalsResponse> {
    if (ebookBookId === bookId) throw new BadRequestException('An audiobook cannot be paired with itself');
    await this.books.verifyBookAccess(bookId, user, 'editor');
    await this.books.verifyBookAccess(ebookBookId, user);
    const ids = await this.pairs.update((store) => {
      dismissReadAlongCandidate(store, bookId, ebookBookId);
      return dismissedFor(store, bookId);
    });
    this.index.invalidate();
    return { dismissedEbookBookIds: ids };
  }

  async undismiss(bookId: number, ebookBookId: number, user: RequestUser): Promise<ReadAlongDismissalsResponse> {
    await this.books.verifyBookAccess(bookId, user, 'editor');
    const ids = await this.pairs.update((store) => {
      undismissReadAlongCandidate(store, bookId, ebookBookId);
      return dismissedFor(store, bookId);
    });
    this.index.invalidate();
    return { dismissedEbookBookIds: ids };
  }

  private chosenLanguage(value: string | undefined): string | null {
    if (value === undefined) return null;
    const code = normalizeReadAlongLanguage(value);
    if (!code || !QUARTZNET_LANGUAGES.has(code)) throw new BadRequestException(`Read-along does not support language "${value}"`);
    return code;
  }
}
