import { Test } from '@nestjs/testing';
import { Permission } from '@bookorbit/types';

import { FORBIDDEN_PERMISSION_KEY } from '../../common/decorators/forbid-permission.decorator';
import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';
import { DB } from '../../db';
import { BookService } from '../book/book.service';
import { LibraryService } from '../library/library.service';
import { ReadAlongMatchIndex } from './read-aloud-match-index';
import { ReadAloudMatchIndexRepository } from './read-aloud-match-index.repository';
import { ReadAloudPairListService } from './read-aloud-pair-list.service';
import { ReadAloudPairController } from './read-aloud-pair.controller';
import { EDITOR } from './read-aloud-pairs.fixtures';
import { ReadAloudPairsDataModule } from './read-aloud-pairs-data.module';
import { ReadAloudPairsModule } from './read-aloud-pairs.module';
import { ReadAloudPairsRepository } from './read-aloud-pairs.repository';

describe('ReadAloudPairController', () => {
  it('requires the read-aloud generation permission and refuses demo accounts', () => {
    expect(Reflect.getMetadata(PERMISSION_KEY, ReadAloudPairController)).toBe(Permission.LibraryGenerateReadAloud);
    expect(Reflect.getMetadata(FORBIDDEN_PERMISSION_KEY, ReadAloudPairController)).toMatchObject({ permission: Permission.DemoRestricted });
  });

  it('passes each request to its service with the current user', async () => {
    const pairs = {
      pair: vi.fn(() => Promise.resolve('pair')),
      unpair: vi.fn(() => Promise.resolve('unpair')),
      dismiss: vi.fn(() => Promise.resolve('dismiss')),
      undismiss: vi.fn(() => Promise.resolve('undismiss')),
    };
    const list = {
      list: vi.fn(() => Promise.resolve('list')),
      candidates: vi.fn(() => Promise.resolve('candidates')),
      acceptExact: vi.fn(() => Promise.resolve('accept')),
    };
    const controller = new ReadAloudPairController(pairs as never, list as never);

    await controller.listPairs({ page: 1, pageSize: 50 }, EDITOR);
    await controller.acceptExact({ libraryId: 14 }, EDITOR);
    await controller.candidates(2238, { q: 'circe', showDismissed: true }, EDITOR);
    await controller.pair(2238, { ebookBookId: 2614, ebookFileId: 11728, dismissPrevious: true }, EDITOR);
    await controller.unpair(2238, EDITOR);
    await controller.dismiss(2238, { ebookBookId: 2614 }, EDITOR);
    await controller.undismiss(2238, { ebookBookId: 2614 }, EDITOR);

    expect(list.list).toHaveBeenCalledWith({ page: 1, pageSize: 50 }, EDITOR);
    expect(list.acceptExact).toHaveBeenCalledWith(14, EDITOR, false);
    expect(list.candidates).toHaveBeenCalledWith(2238, { q: 'circe', showDismissed: true }, EDITOR);
    expect(pairs.pair).toHaveBeenCalledWith(2238, { ebookBookId: 2614, ebookFileId: 11728, dismissPrevious: true }, EDITOR);
    expect(pairs.unpair).toHaveBeenCalledWith(2238, EDITOR);
    expect(pairs.dismiss).toHaveBeenCalledWith(2238, 2614, EDITOR);
    expect(pairs.undismiss).toHaveBeenCalledWith(2238, 2614, EDITOR);
  });

  it('resolves every provider of the module from what its imports export', async () => {
    const books = { verifyBookAccess: vi.fn() };
    const libraries = { findAccessibleLibraryIds: vi.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: Reflect.getMetadata('controllers', ReadAloudPairsModule),
      providers: [
        ...Reflect.getMetadata('providers', ReadAloudPairsModule),
        ...Reflect.getMetadata('exports', ReadAloudPairsDataModule),
        { provide: DB, useValue: {} },
        { provide: BookService, useValue: books },
        { provide: LibraryService, useValue: libraries },
      ],
    }).compile();
    const list = moduleRef.get(ReadAloudPairListService) as unknown as Record<string, unknown>;
    const index = moduleRef.get(ReadAlongMatchIndex) as unknown as Record<string, unknown>;
    expect(moduleRef.get(ReadAloudPairController)).toBeInstanceOf(ReadAloudPairController);
    expect(list.books).toBe(books);
    expect(list.libraries).toBe(libraries);
    expect(list.pairs).toBeInstanceOf(ReadAloudPairsRepository);
    expect(index.repo).toBeInstanceOf(ReadAloudMatchIndexRepository);
  });
});
