import { ConflictException } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '../../db/schema';
import { bookFiles, books } from '../../db/schema';

type Tx = Parameters<Parameters<NodePgDatabase<typeof schema>['transaction']>[0]>[0];

/**
 * Inserts the book row for a folder, or takes over the one a watcher scan inserted for the same
 * folder after this transaction looked and found none. A plain insert would hit the unique index
 * and abort the whole filing. The scan's row is only taken while it holds no content file other
 * than the one being filed; anything else is a different book and stays a conflict.
 */
export async function insertOrAdoptBookRow(
  tx: Tx,
  values: { libraryId: number; libraryFolderId: number; folderPath: string },
  absolutePath: string,
): Promise<{ id: number } | null> {
  const [inserted] = await tx
    .insert(books)
    .values({ ...values, status: 'present' })
    .onConflictDoNothing({ target: [books.libraryId, books.folderPath] })
    .returning({ id: books.id });
  if (inserted) return inserted;

  const [raced] = await tx
    .select({ id: books.id })
    .from(books)
    .where(and(eq(books.libraryId, values.libraryId), eq(books.folderPath, values.folderPath)))
    .for('update', { of: books })
    .limit(1);
  if (!raced) return null;

  const [otherContent] = await tx
    .select({ id: bookFiles.id })
    .from(bookFiles)
    .where(and(eq(bookFiles.bookId, raced.id), eq(bookFiles.role, 'content'), ne(bookFiles.absolutePath, absolutePath)))
    .limit(1);
  if (otherContent) throw new ConflictException('Another book took this folder while the file was being filed. Try again.');

  await tx.update(books).set({ status: 'present', updatedAt: new Date() }).where(eq(books.id, raced.id));
  return raced;
}
