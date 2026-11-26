import type { BookCard, GoodreadsShelfItem } from '@bookorbit/types';

import type { RequestUser } from '../../common/types/request-user';
import type { BookService } from '../book/book.service';

/** A full page of rows with many copies each stays one bounded card query. */
export const GOODREADS_CARD_CAP = 400;

/** Every owned copy on the page once, in row order, at most `cap` of them. */
export function shelfCardIds(items: readonly Pick<GoodreadsShelfItem, 'bookIds'>[], cap = GOODREADS_CARD_CAP): number[] {
  return [...new Set(items.flatMap((item) => item.bookIds))].slice(0, cap);
}

/** Library cards for the page's copies; ids this user may not see, or that no longer exist, are left out. */
export async function loadShelfCards(
  books: Pick<BookService, 'findCardsByIds'>,
  user: RequestUser,
  items: readonly Pick<GoodreadsShelfItem, 'bookIds'>[],
): Promise<BookCard[]> {
  const ids = shelfCardIds(items);
  return ids.length === 0 ? [] : books.findCardsByIds(user, ids);
}
