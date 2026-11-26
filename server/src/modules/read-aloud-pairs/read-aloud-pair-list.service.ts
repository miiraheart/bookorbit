import { BadRequestException, Injectable } from '@nestjs/common';
import {
  normalizeWorkToken,
  type AcceptExactResponse,
  type ReadAlongCandidate,
  type ReadAlongCandidatesResponse,
  type ReadAlongListResponse,
  type ReadAlongListSummary,
  type ReadAlongMatchTier,
  type ReadAlongPair,
  type ReadAlongPairedAudiobooksResponse,
  type ReadAlongPairStatus,
  type ReadAlongRow,
} from '@bookorbit/types';

import type { RequestUser } from '../../common/types/request-user';
import { BookService } from '../book/book.service';
import { LibraryService } from '../library/library.service';
import { ReadAlongMatchIndex, type ReadAlongIndexedAudio, type ReadAlongIndexView } from './read-aloud-match-index';
import { madeFromPair, ReadAloudMatchIndexRepository, type ReadAlongOutputFile } from './read-aloud-match-index.repository';
import { readAlongStatus } from './read-aloud-match-score';
import { buildPairEntry, isPlainEpubContent, pairLanguage } from './read-aloud-pair.service';
import { dismissedFor, setReadAlongPair, type ReadAlongPairsStore } from './read-aloud-pairs-store';
import { ReadAloudPairsRepository, type ResolvedReadAlongPair } from './read-aloud-pairs.repository';

export type ListReadAlongQuery = {
  status?: ReadAlongPairStatus;
  tier?: ReadAlongMatchTier;
  libraryId?: number;
  q?: string;
  page?: number;
  pageSize?: number;
};

const STATUS_ORDER: Record<ReadAlongPairStatus, number> = {
  needs_attention: 0,
  suggested: 1,
  ambiguous: 2,
  flagged: 3,
  paired: 4,
  none: 5,
};

type Evaluated = { audio: ReadAlongIndexedAudio; row: ReadAlongRow };

function emptySummary(): ReadAlongListSummary {
  return { paired: 0, needs_attention: 0, suggested: 0, ambiguous: 0, flagged: 0, none: 0, readAlongReady: 0 };
}

function matchesQuery(audio: ReadAlongIndexedAudio, token: string): boolean {
  return normalizeWorkToken(audio.title).includes(token) || audio.authors.some((name) => normalizeWorkToken(name).includes(token));
}

/** Only an exact match on an unflagged, unpaired audiobook that holds no EPUB of its own is paired without a look. */
export function acceptsExact(audio: ReadAlongIndexedAudio, row: ReadAlongRow): boolean {
  return audio.ownEpubFileId === null && row.status === 'suggested' && row.best?.tier === 'exact' && row.best.flags.length === 0;
}

/** Reading the list, one audiobook's candidates, and pairing every exact match at once. */
@Injectable()
export class ReadAloudPairListService {
  constructor(
    private readonly pairs: ReadAloudPairsRepository,
    private readonly index: ReadAlongMatchIndex,
    private readonly files: ReadAloudMatchIndexRepository,
    private readonly books: BookService,
    private readonly libraries: LibraryService,
  ) {}

  async list(query: ListReadAlongQuery, user: RequestUser): Promise<ReadAlongListResponse> {
    const view = await this.index.forUser(user);
    const token = query.q ? normalizeWorkToken(query.q) : '';
    const audio = view.audio.filter(
      (book) => (query.libraryId === undefined || book.libraryId === query.libraryId) && (!token || matchesQuery(book, token)),
    );
    const evaluated = await this.evaluate(view, audio);

    const summary = emptySummary();
    for (const { row } of evaluated) {
      summary[row.status] += 1;
      if (row.readAlong) summary.readAlongReady += 1;
    }
    const filtered = evaluated
      .map(({ row }) => row)
      .filter((row) => (!query.status || row.status === query.status) && (!query.tier || row.best?.tier === query.tier))
      .sort(
        (a, b) =>
          STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
          a.audiobook.title.localeCompare(b.audiobook.title) ||
          a.audiobook.bookId - b.audiobook.bookId,
      );
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    return { items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, summary };
  }

  async candidates(bookId: number, options: { q?: string; showDismissed?: boolean }, user: RequestUser): Promise<ReadAlongCandidatesResponse> {
    await this.books.verifyBookAccess(bookId, user);
    const view = await this.index.forUser(user);
    const audio = view.findAudio(bookId);
    if (!audio) throw new BadRequestException('This book has no audiobook file');
    const [store, [resolved]] = await Promise.all([this.pairs.read(), this.pairs.resolvePairs([bookId])]);
    const dismissed = dismissedFor(store, bookId);
    const pair = visiblePair(view, resolved?.pair);

    const suggested = view.candidatesFor(audio, { dismissedEbookBookIds: dismissed });
    const searched = options.q ? view.search(audio, options.q, dismissed) : [];
    const seen = new Set(suggested.flatMap(coveredIds));
    const candidates = [...suggested, ...searched.filter((candidate) => !coveredIds(candidate).some((id) => seen.has(id)))];
    return {
      pair,
      ...(resolved && !pair ? { pairHidden: true } : {}),
      pairState: resolved?.state ?? null,
      candidates,
      dismissedEbookBookIds: dismissed,
      dismissed: options.showDismissed ? view.scoreDismissed(audio, dismissed) : [],
    };
  }

  /**
   * Pairs each exact match in libraries this user may edit. Starts no job: generating stays a choice
   * per book. A dry run counts the same pairs against the current store and writes nothing.
   */
  async acceptExact(libraryId: number | undefined, user: RequestUser, dryRun = false): Promise<AcceptExactResponse> {
    const [view, editable] = await Promise.all([this.index.forUser(user), this.libraries.findEditableLibraryIds(user)]);
    const editableIds = new Set(editable);
    const scope = view.audio.filter((book) => editableIds.has(book.libraryId) && (libraryId === undefined || book.libraryId === libraryId));
    const targets = (await this.evaluate(view, scope)).filter(({ audio, row }) => acceptsExact(audio, row));
    if (targets.length === 0) return { paired: 0, skipped: 0 };

    const fileRows = await this.files.findBookFiles(targets.map(({ row }) => row.best!.ebookBookId));
    const byId = new Map(fileRows.map((file) => [file.id, file]));
    const entries = targets.flatMap(({ audio, row }) => {
      const best = row.best!;
      const file = byId.get(best.ebookFileId);
      if (!isPlainEpubContent(file, best.ebookBookId)) return [];
      const language = pairLanguage(view, audio.bookId, best.ebookBookId, null);
      return [{ audioId: audio.bookId, entry: buildPairEntry({ ebookBookId: best.ebookBookId, file, user, source: 'accepted', language }) }];
    });
    const apply = (store: ReadAlongPairsStore) => {
      let count = 0;
      for (const { audioId, entry } of entries) {
        if (store.pairs[String(audioId)] || dismissedFor(store, audioId).includes(entry.ebookBookId)) continue;
        setReadAlongPair(store, audioId, entry);
        count += 1;
      }
      return count;
    };
    if (dryRun) {
      const paired = apply(await this.pairs.read());
      return { paired, skipped: targets.length - paired };
    }
    const paired = await this.pairs.update(apply);
    this.index.invalidate();
    return { paired, skipped: targets.length - paired };
  }

  /** The audiobooks paired with this ebook that the user may open too, with the read-along made from it, if any. */
  async pairedAudiobooks(ebookBookId: number, user: RequestUser): Promise<ReadAlongPairedAudiobooksResponse> {
    await this.books.verifyBookAccess(ebookBookId, user);
    const resolved = (await this.pairs.resolvePairs()).filter(({ pair, state }) => state === 'ok' && pair.ebookBookId === ebookBookId);
    if (resolved.length === 0) return { audiobooks: [] };
    const view = await this.index.forUser(user);
    const visible = resolved.flatMap(({ pair }) => {
      const audio = view.findAudio(pair.audiobookBookId);
      return audio ? [{ pair, audio }] : [];
    });
    const outputs = await this.files.findReadAlongOutputs(visible.map(({ pair }) => pair.audiobookBookId));
    return {
      audiobooks: visible.map(({ pair, audio }) => {
        const latest = outputs.filter((output) => output.bookId === pair.audiobookBookId).at(-1);
        const fromPair = latest && (latest.epubFileId === null || madeFromPair(latest, pair));
        return { bookId: audio.bookId, title: audio.title, readAlongFileId: fromPair ? latest.fileId : null };
      }),
    };
  }

  private async evaluate(view: ReadAlongIndexView, audio: readonly ReadAlongIndexedAudio[]): Promise<Evaluated[]> {
    if (audio.length === 0) return [];
    const ids = audio.map((book) => book.bookId);
    const [store, resolved, outputs, activeJobs] = await Promise.all([
      this.pairs.read(),
      this.pairs.resolvePairs(ids),
      this.files.findReadAlongOutputs(ids),
      this.files.findActiveJobIds(ids),
    ]);
    const pairById = new Map(resolved.map((entry) => [entry.pair.audiobookBookId, entry]));
    const outputsById = new Map<number, ReadAlongOutputFile[]>();
    for (const output of outputs) outputsById.set(output.bookId, [...(outputsById.get(output.bookId) ?? []), output]);

    return audio.map((book) => {
      const candidates = view.candidatesFor(book, { dismissedEbookBookIds: dismissedFor(store, book.bookId) });
      const resolvedPair = pairById.get(book.bookId);
      const pair = visiblePair(view, resolvedPair?.pair);
      return {
        audio: book,
        row: {
          audiobook: {
            bookId: book.bookId,
            title: book.title,
            authors: book.authors,
            libraryName: book.libraryName,
            durationSeconds: book.durationSeconds ?? null,
            language: book.language ?? null,
          },
          status: statusOf(resolvedPair, candidates),
          pair,
          ...(resolvedPair && !pair ? { pairHidden: true } : {}),
          best: candidates[0] ?? null,
          candidateCount: candidates.length,
          readAlong: readAlongOf(outputsById.get(book.bookId) ?? [], resolvedPair),
          activeJobId: activeJobs.get(book.bookId) ?? null,
        },
      };
    });
  }
}

/** A pair to an ebook this user cannot open is reported as paired, without naming that ebook. */
function visiblePair(view: ReadAlongIndexView, pair: ReadAlongPair | undefined): ReadAlongPair | null {
  return pair && view.isVisible(pair.ebookBookId) ? pair : null;
}

function coveredIds(candidate: ReadAlongCandidate): number[] {
  return [candidate.ebookBookId, ...candidate.otherCopies.map((copy) => copy.ebookBookId)];
}

function statusOf(resolved: ResolvedReadAlongPair | undefined, candidates: readonly ReadAlongCandidate[]): ReadAlongPairStatus {
  if (resolved) return resolved.state === 'ok' ? 'paired' : 'needs_attention';
  return readAlongStatus(candidates);
}

/** The newest read-along; stale when a pair exists and that read-along is known to come from another EPUB. */
function readAlongOf(outputs: readonly ReadAlongOutputFile[], resolved: ResolvedReadAlongPair | undefined): ReadAlongRow['readAlong'] {
  const latest = outputs.at(-1);
  if (!latest) return null;
  const stale = resolved !== undefined && latest.epubFileId !== null && !madeFromPair(latest, resolved.pair);
  return { fileId: latest.fileId, stale };
}
