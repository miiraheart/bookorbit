import { BadRequestException, NotFoundException } from '@nestjs/common';

import { buildReadAlongCorpus, ReadAlongIndexView } from './read-aloud-match-index';
import type { ReadAlongBookFile, ReadAlongOutputFile } from './read-aloud-match-index.repository';
import { ReadAloudPairService } from './read-aloud-pair.service';
import { audioFile, CORPUS, DELETER, EDITOR, epubFile, fakePairsRepository } from './read-aloud-pairs.fixtures';
import { emptyReadAlongPairsStore, type ReadAlongPairEntry } from './read-aloud-pairs-store';

const circeEntry: ReadAlongPairEntry = {
  ebookBookId: 2712,
  ebookFileId: 27120,
  fileHash: 'hash-27120',
  pairedAt: '2026-11-26T10:00:00.000Z',
  pairedBy: 7,
  source: 'manual',
  language: 'en',
};

function setup(options: { files?: ReadAlongBookFile[]; outputs?: ReadAlongOutputFile[]; pairs?: Record<string, ReadAlongPairEntry> } = {}) {
  const store = emptyReadAlongPairsStore();
  Object.assign(store.pairs, options.pairs ?? {});
  const pairs = fakePairsRepository(store);
  const files = {
    findBookFiles: vi.fn(() => Promise.resolve(options.files ?? [audioFile(7749, 2238), epubFile(11728, 2614), epubFile(27120, 2712)])),
    findReadAlongOutputs: vi.fn(() => Promise.resolve(options.outputs ?? [])),
  };
  const view = new ReadAlongIndexView(buildReadAlongCorpus(CORPUS), new Set(CORPUS.map((row) => row.id)));
  const index = { forUser: vi.fn(() => Promise.resolve(view)), invalidate: vi.fn() };
  const books = { verifyBookAccess: vi.fn(() => Promise.resolve(undefined)) };
  const service = new ReadAloudPairService(pairs.repo as never, index as never, files as never, books as never);
  return { service, pairs, files, index, books };
}

describe('ReadAloudPairService.pair', () => {
  it('pairs the audiobook with the chosen EPUB, storing its hash and the language from the ebook', async () => {
    const { service, pairs, books, index } = setup();
    const result = await service.pair(2238, { ebookBookId: 2614, ebookFileId: 11728 }, EDITOR);
    expect(books.verifyBookAccess).toHaveBeenCalledWith(2238, EDITOR, 'editor');
    expect(books.verifyBookAccess).toHaveBeenCalledWith(2614, EDITOR);
    expect(result.pair).toMatchObject({ audiobookBookId: 2238, ebookBookId: 2614, ebookFileId: 11728, fileHash: 'hash-11728', language: 'en' });
    expect(result.readAlongStale).toBe(false);
    expect(pairs.state.store.pairs['2238']).toMatchObject({ ebookFileId: 11728, source: 'manual', pairedBy: 7 });
    expect(index.invalidate).toHaveBeenCalled();
  });

  it.each([
    ['a kepub', [audioFile(7749, 2238), epubFile(11728, 2614, { format: 'kepub' })]],
    ['a read-along EPUB', [audioFile(7749, 2238), epubFile(11728, 2614, { mediaOverlayAvailable: true })]],
    ['a file from another book', [audioFile(7749, 2238), epubFile(11728, 2712)]],
    ['a cover file', [audioFile(7749, 2238), epubFile(11728, 2614, { role: 'cover' })]],
  ])('rejects %s', async (_label, files) => {
    const { service, pairs } = setup({ files });
    await expect(service.pair(2238, { ebookBookId: 2614, ebookFileId: 11728 }, EDITOR)).rejects.toBeInstanceOf(BadRequestException);
    expect(pairs.state.writes).toBe(0);
  });

  it('rejects pairing a record with itself and a record without audio', async () => {
    const { service } = setup({ files: [epubFile(11728, 2614), epubFile(1, 2238)] });
    await expect(service.pair(2614, { ebookBookId: 2614, ebookFileId: 11728 }, EDITOR)).rejects.toThrow('cannot be paired with itself');
    await expect(service.pair(2238, { ebookBookId: 2614, ebookFileId: 11728 }, EDITOR)).rejects.toThrow('no audiobook file');
  });

  it('refuses without access to either book and writes nothing', async () => {
    const { service, pairs, books } = setup();
    books.verifyBookAccess.mockRejectedValueOnce(new NotFoundException());
    await expect(service.pair(2238, { ebookBookId: 2614, ebookFileId: 11728 }, EDITOR)).rejects.toBeInstanceOf(NotFoundException);
    books.verifyBookAccess.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new NotFoundException());
    await expect(service.pair(2238, { ebookBookId: 2614, ebookFileId: 11728 }, EDITOR)).rejects.toBeInstanceOf(NotFoundException);
    expect(pairs.state.writes).toBe(0);
  });

  it('rejects a language the model cannot read', async () => {
    const { service } = setup();
    await expect(service.pair(2238, { ebookBookId: 2614, ebookFileId: 11728, language: 'xx' }, EDITOR)).rejects.toBeInstanceOf(BadRequestException);
    const result = await service.pair(2238, { ebookBookId: 2614, ebookFileId: 11728, language: 'fr-FR' }, EDITOR);
    expect(result.pair.language).toBe('fr');
  });

  it('on change with dismissPrevious, dismisses the old ebook in the same write', async () => {
    const { service, pairs } = setup({ pairs: { '2238': circeEntry } });
    await service.pair(2238, { ebookBookId: 2614, ebookFileId: 11728, dismissPrevious: true }, EDITOR);
    expect(pairs.state.writes).toBe(1);
    expect(pairs.state.store.pairs['2238']!.ebookBookId).toBe(2614);
    expect(pairs.state.store.dismissed['2238']).toEqual([2712]);
  });

  it('on change without dismissPrevious, keeps the old ebook suggestible, and pairing a dismissed ebook un-dismisses it', async () => {
    const { service, pairs } = setup({ pairs: { '2238': circeEntry } });
    pairs.state.store.dismissed['2238'] = [2614];
    await service.pair(2238, { ebookBookId: 2614, ebookFileId: 11728 }, EDITOR);
    expect(pairs.state.store.dismissed['2238']).toBeUndefined();
  });

  it('reports a read-along made from another EPUB as stale', async () => {
    const outputs = [{ bookId: 2238, fileId: 900, filename: 'Circe.readaloud.epub', epubFileId: 27120, epubHash: 'hash-27120' }];
    const { service } = setup({ outputs });
    expect((await service.pair(2238, { ebookBookId: 2614, ebookFileId: 11728 }, EDITOR)).readAlongStale).toBe(true);
    expect((await service.pair(2238, { ebookBookId: 2712, ebookFileId: 27120 }, EDITOR)).readAlongStale).toBe(false);
  });
});

describe('ReadAloudPairService.unpair', () => {
  it('removes the pair and reports read-alongs made from that EPUB, matched by file id or hash, without deleting', async () => {
    const outputs = [
      { bookId: 2238, fileId: 900, filename: 'a.readaloud.epub', epubFileId: 27120, epubHash: null },
      { bookId: 2238, fileId: 901, filename: 'b.readaloud.epub', epubFileId: 5, epubHash: 'hash-27120' },
      { bookId: 2238, fileId: 902, filename: 'c.readaloud.epub', epubFileId: 6, epubHash: 'other' },
    ];
    const { service, pairs, books } = setup({ pairs: { '2238': circeEntry }, outputs });
    const result = await service.unpair(2238, DELETER);
    expect(books.verifyBookAccess).toHaveBeenCalledWith(2238, DELETER, 'editor');
    expect(pairs.state.store.pairs['2238']).toBeUndefined();
    expect(result.removed).toMatchObject({ ebookBookId: 2712 });
    expect(result.readAlongs.map((file) => file.fileId)).toEqual([900, 901]);
    expect(result.canDeleteReadAlong).toBe(true);
  });

  it('reports nothing to delete when there was no pair, and no delete right without the permission', async () => {
    const { service, files } = setup();
    expect(await service.unpair(2238, EDITOR)).toEqual({ removed: null, readAlongs: [], canDeleteReadAlong: false });
    expect(files.findReadAlongOutputs).not.toHaveBeenCalled();
  });
});

describe('ReadAloudPairService dismissals', () => {
  it('dismisses and un-dismisses a candidate', async () => {
    const { service, pairs, books, index } = setup();
    expect(await service.dismiss(2238, 2614, EDITOR)).toEqual({ dismissedEbookBookIds: [2614] });
    expect(await service.dismiss(2238, 2712, EDITOR)).toEqual({ dismissedEbookBookIds: [2614, 2712] });
    expect(books.verifyBookAccess).toHaveBeenCalledWith(2238, EDITOR, 'editor');
    expect(books.verifyBookAccess).toHaveBeenCalledWith(2614, EDITOR);
    expect(await service.undismiss(2238, 2614, EDITOR)).toEqual({ dismissedEbookBookIds: [2712] });
    expect(await service.undismiss(2238, 2712, EDITOR)).toEqual({ dismissedEbookBookIds: [] });
    expect(pairs.state.store.dismissed).toEqual({});
    expect(index.invalidate).toHaveBeenCalledTimes(4);
  });

  it('refuses to dismiss the audiobook itself', async () => {
    const { service } = setup();
    await expect(service.dismiss(2238, 2238, EDITOR)).rejects.toBeInstanceOf(BadRequestException);
  });
});
