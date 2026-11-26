import { BadRequestException } from '@nestjs/common';

import { buildReadAlongCorpus, ReadAlongIndexView } from './read-aloud-match-index';
import type { ReadAlongCorpusRow, ReadAlongOutputFile } from './read-aloud-match-index.repository';
import { ReadAloudPairListService } from './read-aloud-pair-list.service';
import { audioRow, CORPUS, EDITOR, epubFile, epubRow, fakePairsRepository } from './read-aloud-pairs.fixtures';
import { emptyReadAlongPairsStore, type ReadAlongPairEntry, type ReadAlongPairsStore } from './read-aloud-pairs-store';

const ROWS: ReadAlongCorpusRow[] = [
  ...CORPUS,
  audioRow(2254, 'Empire of Silence', ['Christopher Ruocchio']),
  epubRow(2699, 17, 'Empire of Silence', ['Christopher Ruocchio'], { language: 'en-US' }),
  audioRow(2484, 'A Court of Frost and Starlight', ['Sarah J. Maas'], { epub_file_id: 11013 }),
  epubRow(2485, 16, 'A Court of Frost and Starlight', ['Sarah J. Maas'], { language: 'en' }),
];

const empirePair: ReadAlongPairEntry = {
  ebookBookId: 2699,
  ebookFileId: 26990,
  fileHash: 'hash-26990',
  pairedAt: '2026-11-26T10:00:00.000Z',
  pairedBy: 7,
};

function setup(options: { rows?: ReadAlongCorpusRow[]; editable?: number[]; outputs?: ReadAlongOutputFile[]; hidden?: number[] } = {}) {
  const rows = options.rows ?? ROWS;
  const store = emptyReadAlongPairsStore();
  store.pairs['2254'] = empirePair;
  const pairs = fakePairsRepository(store);
  const hidden = new Set(options.hidden ?? []);
  const view = new ReadAlongIndexView(buildReadAlongCorpus(rows), new Set(rows.map((row) => row.id).filter((id) => !hidden.has(id))));
  const index = { forUser: vi.fn(() => Promise.resolve(view)), invalidate: vi.fn() };
  const files = {
    findBookFiles: vi.fn((ids: number[]) => Promise.resolve(ids.map((id) => epubFile(id * 10, id)))),
    findReadAlongOutputs: vi.fn(() => Promise.resolve(options.outputs ?? [])),
    findActiveJobIds: vi.fn(() => Promise.resolve(new Map([[2238, 'job-1']]))),
  };
  const books = { verifyBookAccess: vi.fn(() => Promise.resolve(undefined)) };
  const libraries = { findEditableLibraryIds: vi.fn(() => Promise.resolve(options.editable ?? [14])) };
  const service = new ReadAloudPairListService(pairs.repo as never, index as never, files as never, books as never, libraries as never);
  return { service, pairs, index, files, books, libraries };
}

describe('ReadAloudPairListService.list', () => {
  it('returns every audiobook with its status, best candidate and job, sorted by what needs a decision', async () => {
    const { service } = setup();
    const result = await service.list({}, EDITOR);
    expect(result.items.map((row) => [row.audiobook.bookId, row.status])).toEqual([
      [2484, 'suggested'],
      [2238, 'suggested'],
      [2600, 'flagged'],
      [2254, 'paired'],
      [2700, 'none'],
      [2494, 'none'],
    ]);
    const circe = result.items.find((row) => row.audiobook.bookId === 2238)!;
    expect(circe).toMatchObject({ best: { ebookBookId: 2614, tier: 'exact' }, candidateCount: 1, activeJobId: 'job-1', readAlong: null });
    expect(result.summary).toEqual({ paired: 1, needs_attention: 0, suggested: 2, ambiguous: 0, flagged: 1, none: 2, readAlongReady: 0 });
    expect(result.total).toBe(6);
  });

  it('filters by status, tier, library and text, and pages after filtering', async () => {
    const { service } = setup();
    expect((await service.list({ status: 'flagged' }, EDITOR)).items.map((row) => row.audiobook.bookId)).toEqual([2600]);
    expect((await service.list({ tier: 'exact' }, EDITOR)).items.map((row) => row.audiobook.bookId)).toEqual([2484, 2238, 2254]);
    expect((await service.list({ q: 'madeline' }, EDITOR)).items.map((row) => row.audiobook.bookId)).toEqual([2238]);
    expect((await service.list({ libraryId: 99 }, EDITOR)).total).toBe(0);
    const page = await service.list({ page: 2, pageSize: 4 }, EDITOR);
    expect(page.items.map((row) => row.audiobook.bookId)).toEqual([2700, 2494]);
    expect(page.total).toBe(6);
  });

  it('lists a pair whose EPUB cannot be found first, as needing attention', async () => {
    const { service, pairs } = setup();
    const resolve = pairs.repo.resolvePairs;
    pairs.repo.resolvePairs = (ids) => resolve(ids).then((rows) => rows.map((row) => ({ ...row, state: 'needs_attention' as const })));
    const result = await service.list({}, EDITOR);
    expect(result.items[0]).toMatchObject({ audiobook: { bookId: 2254 }, status: 'needs_attention', pair: { ebookBookId: 2699 } });
    expect(result.summary).toMatchObject({ needs_attention: 1, paired: 0 });
  });

  it('marks a read-along made from another EPUB than the paired one as stale', async () => {
    const outputs = [{ bookId: 2254, fileId: 900, filename: 'x.readaloud.epub', epubFileId: 1, epubHash: 'old' }];
    const { service } = setup({ outputs });
    const empire = (await service.list({ status: 'paired' }, EDITOR)).items[0]!;
    expect(empire.readAlong).toEqual({ fileId: 900, stale: true });
  });
});

describe('ReadAloudPairListService.candidates', () => {
  it('returns the pair, the candidates, and a language conflict only from the hand search', async () => {
    const { service, books } = setup();
    const plain = await service.candidates(2494, {}, EDITOR);
    expect(books.verifyBookAccess).toHaveBeenCalledWith(2494, EDITOR);
    expect(plain).toMatchObject({ pair: null, pairState: null, candidates: [], dismissed: [] });
    const searched = await service.candidates(2494, { q: 'vicious' }, EDITOR);
    expect(searched.candidates.map((candidate) => [candidate.ebookBookId, candidate.flags])).toEqual([[2535, ['language_conflict']]]);
  });

  it('offers a conflicting copy from the hand search even when another copy of the work is suggested', async () => {
    const { service } = setup({ rows: [...ROWS, epubRow(2620, 16, 'Vicious', ['V. E. Schwab'], { language: 'en' })] });
    const result = await service.candidates(2494, { q: 'vicious' }, EDITOR);
    expect(result.candidates.map((candidate) => [candidate.ebookBookId, candidate.flags])).toEqual([
      [2620, []],
      [2535, ['language_conflict']],
    ]);
  });

  it('does not repeat a suggested work or its copies in the search results', async () => {
    const { service } = setup();
    const result = await service.candidates(2238, { q: 'circe' }, EDITOR);
    expect(result.candidates.map((candidate) => candidate.ebookBookId)).toEqual([2614]);
  });

  it('hides dismissed ebooks and lists them when asked', async () => {
    const { service, pairs } = setup();
    pairs.state.store.dismissed['2238'] = [2614, 2712, 3757, 5639];
    const hidden = await service.candidates(2238, {}, EDITOR);
    expect(hidden.candidates).toEqual([]);
    expect(hidden.dismissedEbookBookIds).toEqual([2614, 2712, 3757, 5639]);
    const shown = await service.candidates(2238, { showDismissed: true }, EDITOR);
    expect(shown.dismissed.map((candidate) => candidate.ebookBookId)).toEqual([2614, 2712, 3757, 5639]);
  });

  it('reports the stored pair', async () => {
    const { service } = setup();
    expect(await service.candidates(2254, {}, EDITOR)).toMatchObject({ pair: { ebookBookId: 2699 }, pairState: 'ok' });
  });

  it('rejects a book that is not an audiobook', async () => {
    const { service } = setup();
    await expect(service.candidates(2614, {}, EDITOR)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ReadAloudPairListService.acceptExact', () => {
  it('pairs only unflagged exact matches without an EPUB of their own, and starts no job', async () => {
    const { service, pairs, index } = setup();
    const result = await service.acceptExact(undefined, EDITOR);
    expect(result).toEqual({ paired: 1, skipped: 0 });
    expect(Object.keys(pairs.state.store.pairs).sort()).toEqual(['2238', '2254']);
    expect(pairs.state.store.pairs['2238']).toMatchObject({ ebookBookId: 2614, ebookFileId: 26140, source: 'accepted', language: 'en' });
    expect(pairs.state.store.pairs['2600']).toBeUndefined();
    expect(pairs.state.store.pairs['2484']).toBeUndefined();
    expect(index.invalidate).toHaveBeenCalled();
  });

  it('pairs nothing in libraries the user cannot edit or outside the chosen library', async () => {
    expect(await setup({ editable: [16] }).service.acceptExact(undefined, EDITOR)).toEqual({ paired: 0, skipped: 0 });
    expect(await setup().service.acceptExact(16, EDITOR)).toEqual({ paired: 0, skipped: 0 });
  });

  it('counts on a dry run with the same rules and writes nothing', async () => {
    const { service, pairs, index } = setup();
    expect(await service.acceptExact(undefined, EDITOR, true)).toEqual({ paired: 1, skipped: 0 });
    expect(await setup({ editable: [16] }).service.acceptExact(undefined, EDITOR, true)).toEqual({ paired: 0, skipped: 0 });
    expect(pairs.state.writes).toBe(0);
    expect(index.invalidate).not.toHaveBeenCalled();
  });

  it('skips a row paired or dismissed by someone else after it was read', async () => {
    const { service, pairs } = setup();
    const original = pairs.repo.update;
    pairs.repo.update = <T>(apply: (store: ReadAlongPairsStore) => T) => {
      pairs.state.store.pairs['2238'] = { ...empirePair, ebookBookId: 2712, ebookFileId: 27120 };
      return original(apply);
    };
    expect(await service.acceptExact(undefined, EDITOR)).toEqual({ paired: 0, skipped: 1 });
    expect(pairs.state.store.pairs['2238']!.ebookBookId).toBe(2712);
  });
});

describe('ReadAloudPairListService with an ebook the user cannot open', () => {
  it('reports the pair without naming the hidden ebook', async () => {
    const { service } = setup({ hidden: [2699] });
    const row = (await service.list({}, EDITOR)).items.find((item) => item.audiobook.bookId === 2254)!;
    expect(row).toMatchObject({ status: 'paired', pair: null, pairHidden: true });
    expect(await service.candidates(2254, {}, EDITOR)).toMatchObject({ pair: null, pairHidden: true, pairState: 'ok' });
  });
});

describe('ReadAloudPairListService.pairedAudiobooks', () => {
  const output = (epubFileId: number | null): ReadAlongOutputFile => ({
    bookId: 2254,
    fileId: 9,
    filename: 'Empire.readaloud.epub',
    epubFileId,
    epubHash: null,
  });

  it('lists the audiobooks paired with an ebook and the read-along made from it', async () => {
    expect(await setup().service.pairedAudiobooks(2699, EDITOR)).toEqual({
      audiobooks: [{ bookId: 2254, title: 'Empire of Silence', readAlongFileId: null }],
    });
    expect((await setup({ outputs: [output(26990)] }).service.pairedAudiobooks(2699, EDITOR)).audiobooks[0]!.readAlongFileId).toBe(9);
    expect((await setup({ outputs: [output(1)] }).service.pairedAudiobooks(2699, EDITOR)).audiobooks[0]!.readAlongFileId).toBeNull();
  });

  it('checks the ebook and leaves out audiobooks the user cannot open', async () => {
    const { service, books } = setup({ hidden: [2254] });
    expect(await service.pairedAudiobooks(2699, EDITOR)).toEqual({ audiobooks: [] });
    expect(books.verifyBookAccess).toHaveBeenCalledWith(2699, EDITOR);
    expect(await setup().service.pairedAudiobooks(2614, EDITOR)).toEqual({ audiobooks: [] });
  });
});
