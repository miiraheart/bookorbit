import type { RequestUser } from '../../common/types/request-user';
import { buildReadAlongCorpus, READ_ALONG_INDEX_TTL_MS, ReadAlongIndexView, ReadAlongMatchIndex } from './read-aloud-match-index';
import { rankReadAlongCandidates } from './read-aloud-match-score';
import { audioRow, CORPUS, EDITOR, epubRow } from './read-aloud-pairs.fixtures';

const allIds = (rows = CORPUS) => new Set(rows.map((row) => row.id));

describe('buildReadAlongCorpus', () => {
  it('splits audio records from plain EPUB records and keeps an audiobook own EPUB on the audio side', () => {
    const corpus = buildReadAlongCorpus([...CORPUS, audioRow(2484, 'A Court of Frost and Starlight', ['Sarah J. Maas'], { epub_file_id: 11013 })]);
    expect(corpus.audio.map((book) => book.bookId)).toEqual([2238, 2494, 2600, 2700, 2484]);
    expect(corpus.audio.at(-1)?.ownEpubFileId).toBe(11013);
    expect(corpus.ebooks.map((book) => book.bookId)).toEqual([2614, 2712, 3757, 5639, 2535, 2601]);
  });

  it('finds the same candidates through the buckets as by scoring every EPUB', () => {
    const rows = [
      ...CORPUS,
      audioRow(2800, 'The Stormlight Archive 3: Oathbringer', ['Brandon Sanderson']),
      epubRow(2801, 16, 'Oathbringer', ['Brandon Sanderson'], { language: 'en' }),
      audioRow(2810, 'Unrelated Title', ['Someone Else'], { isbn13: '9780316556347' }),
      epubRow(2811, 16, 'Circe', ['Madeline Miller'], { isbn13: '9780316556347' }),
      audioRow(2820, 'The Way of Kings Prime', ['Brandon Sanderson']),
      epubRow(2821, 16, 'The Way of Kings', ['Brandon Sanderson'], { hardcover_id: 'wok' }),
      audioRow(2830, 'Empire of Silence', ['Christopher Ruocchio'], { hardcover_id: 'eos' }),
      epubRow(2831, 17, 'Empire of Silence', ['Christopher Ruocchio'], { hardcover_id: 'eos', language: 'en-US' }),
    ];
    const corpus = buildReadAlongCorpus(rows);
    const view = new ReadAlongIndexView(corpus, allIds(rows));
    for (const audio of corpus.audio) {
      expect(view.candidatesFor(audio)).toEqual(rankReadAlongCandidates(audio, corpus.ebooks));
    }
  });
});

describe('ReadAlongIndexView', () => {
  const corpus = buildReadAlongCorpus(CORPUS);

  it('folds the Circe copies into the English library copy', () => {
    const view = new ReadAlongIndexView(corpus, allIds());
    const [best, ...rest] = view.candidatesFor(view.findAudio(2238)!);
    expect(rest).toEqual([]);
    expect(best).toMatchObject({ ebookBookId: 2614, tier: 'exact' });
    expect(best!.otherCopies.map((copy) => copy.ebookBookId).sort()).toEqual([2712, 3757, 5639]);
  });

  it('ranks only what the user may open, so a hidden copy changes nothing they see', () => {
    const hidden = new Set([...allIds()].filter((id) => id !== 3757));
    const view = new ReadAlongIndexView(corpus, hidden);
    const [best] = view.candidatesFor(view.findAudio(2238)!);
    expect(best!.otherCopies.map((copy) => copy.ebookBookId).sort()).toEqual([2712, 5639]);
    expect(view.findEbook(3757)).toBeNull();
    expect(view.search(view.findAudio(2238)!, 'circe', []).flatMap((c) => [c.ebookBookId, ...c.otherCopies.map((o) => o.ebookBookId)])).not.toContain(
      3757,
    );
  });

  it('keeps a language conflict out of suggestions but returns it, flagged, from the hand search', () => {
    const view = new ReadAlongIndexView(corpus, allIds());
    const vicious = view.findAudio(2494)!;
    expect(view.candidatesFor(vicious)).toEqual([]);
    const [found] = view.search(vicious, 'Vicious', []);
    expect(found).toMatchObject({ ebookBookId: 2535, languageMatch: 'conflict' });
    expect(found!.flags).toContain('language_conflict');
  });

  it('keeps a conflicting copy separate in the hand search when another copy agrees', () => {
    const rows = [...CORPUS, epubRow(2620, 16, 'Vicious', ['V. E. Schwab'], { language: 'en' })];
    const view = new ReadAlongIndexView(buildReadAlongCorpus(rows), allIds(rows));
    const vicious = view.findAudio(2494)!;
    expect(view.candidatesFor(vicious).map((candidate) => candidate.ebookBookId)).toEqual([2620]);
    const found = view.search(vicious, 'vicious', []);
    expect(found.map((candidate) => [candidate.ebookBookId, candidate.flags, candidate.otherCopies])).toEqual([
      [2620, [], []],
      [2535, ['language_conflict'], []],
    ]);
  });

  it('leaves dismissed ebooks out of the hand search and scores them only on request', () => {
    const view = new ReadAlongIndexView(corpus, allIds());
    const circe = view.findAudio(2238)!;
    const dismissed = [2614, 2712, 3757, 5639];
    expect(view.search(circe, 'circe', dismissed)).toEqual([]);
    expect(view.scoreDismissed(circe, [2614]).map((candidate) => candidate.ebookBookId)).toEqual([2614]);
  });
});

describe('ReadAlongMatchIndex', () => {
  function setup(visible: Record<number, number[]>) {
    const repo = {
      loadCorpus: vi.fn(() => Promise.resolve(CORPUS)),
      visibleBookIds: vi.fn((_user: RequestUser, libraryIds: number[]) =>
        Promise.resolve(new Set(CORPUS.filter((row) => libraryIds.includes(row.library_id)).map((row) => row.id))),
      ),
    };
    const libraries = { findAccessibleLibraryIds: vi.fn((user: RequestUser) => Promise.resolve(visible[user.id] ?? [])) };
    return { repo, libraries, index: new ReadAlongMatchIndex(repo as never, libraries as never) };
  }

  afterEach(() => vi.restoreAllMocks());

  it('loads the corpus once for every user and filters it per user', async () => {
    const { repo, index } = setup({ 7: [14, 16], 8: [14, 16, 17, 18] });
    const narrow = await index.forUser(EDITOR);
    const wide = await index.forUser({ ...EDITOR, id: 8 } as RequestUser);
    expect(repo.loadCorpus).toHaveBeenCalledTimes(1);
    expect(narrow.candidatesFor(narrow.findAudio(2238)!)[0]!.otherCopies).toEqual([]);
    expect(wide.candidatesFor(wide.findAudio(2238)!)[0]!.otherCopies).toHaveLength(3);
    expect(narrow.findEbook(2712)).toBeNull();
  });

  it('reloads after five minutes and after invalidate', async () => {
    const { repo, index } = setup({ 7: [14] });
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    await index.forUser(EDITOR);
    now.mockReturnValue(1_000 + READ_ALONG_INDEX_TTL_MS - 1);
    await index.forUser(EDITOR);
    expect(repo.loadCorpus).toHaveBeenCalledTimes(1);
    now.mockReturnValue(1_000 + READ_ALONG_INDEX_TTL_MS);
    await index.forUser(EDITOR);
    expect(repo.loadCorpus).toHaveBeenCalledTimes(2);
    index.invalidate();
    await index.forUser(EDITOR);
    expect(repo.loadCorpus).toHaveBeenCalledTimes(3);
  });

  it('does not keep a failed load', async () => {
    const { repo, index } = setup({ 7: [14] });
    repo.loadCorpus.mockRejectedValueOnce(new Error('db down'));
    await expect(index.forUser(EDITOR)).rejects.toThrow('db down');
    await expect(index.forUser(EDITOR)).resolves.toBeInstanceOf(ReadAlongIndexView);
    expect(repo.loadCorpus).toHaveBeenCalledTimes(2);
  });
});
