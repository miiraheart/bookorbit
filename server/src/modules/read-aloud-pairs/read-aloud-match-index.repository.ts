import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { AUDIO_FORMAT_LIST, READ_ALOUD_ACTIVE_JOB_STATUSES } from '@bookorbit/types';

import type { RequestUser } from '../../common/types/request-user';
import { DB } from '../../db';
import { books } from '../../db/schema';
import { duplicateScopeWhere, type Db } from '../book-duplicates/book-duplicates.repository';

/** One record that holds audio or a plain EPUB, as the matcher reads it. */
export type ReadAlongCorpusRow = {
  id: number;
  library_id: number;
  library_name: string | null;
  title: string | null;
  subtitle: string | null;
  isbn10: string | null;
  isbn13: string | null;
  hardcover_id: string | null;
  open_library_id: string | null;
  goodreads_id: string | null;
  language: string | null;
  series_name: string | null;
  series_index: string | null;
  abridged: boolean | null;
  metadata_score: number | null;
  authors: string[];
  has_audio: boolean;
  audio_seconds: number | null;
  epub_file_id: number | null;
  has_overlay: boolean;
};

export type ReadAlongBookFile = {
  id: number;
  bookId: number;
  format: string | null;
  role: string;
  fileHash: string | null;
  mediaOverlayAvailable: boolean;
};

/** A read-along EPUB in an audiobook record and the EPUB its newest completed job was made from, when known. */
export type ReadAlongOutputFile = {
  bookId: number;
  fileId: number;
  filename: string;
  epubFileId: number | null;
  epubHash: string | null;
};

export function madeFromPair(file: ReadAlongOutputFile, pair: { ebookFileId: number; fileHash: string | null }): boolean {
  return file.epubFileId === pair.ebookFileId || (pair.fileHash !== null && file.epubHash === pair.fileHash);
}

const AUDIO_FORMATS = sql.param([...AUDIO_FORMAT_LIST]);
const ACTIVE_STATUSES = sql.param([...READ_ALOUD_ACTIVE_JOB_STATUSES]);

@Injectable()
export class ReadAloudMatchIndexRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Every present record with an audio content file or a plain EPUB content file. */
  async loadCorpus(): Promise<ReadAlongCorpusRow[]> {
    const result = await this.db.execute<ReadAlongCorpusRow>(sql`
      SELECT
        b.id, b.library_id, l.name AS library_name,
        m.title, m.subtitle, m.isbn10, m.isbn13, m.hardcover_id, m.open_library_id, m.goodreads_id,
        m.language, m.series_name, m.series_index, m.abridged, m.metadata_score,
        ARRAY(
          SELECT a.name FROM book_authors ba JOIN authors a ON a.id = ba.author_id
          WHERE ba.book_id = b.id ORDER BY ba.display_order, a.id
        ) AS authors,
        f.has_audio, f.audio_seconds, f.epub_file_id, f.has_overlay
      FROM books b
      JOIN libraries l ON l.id = b.library_id
      LEFT JOIN book_metadata m ON m.book_id = b.id
      JOIN LATERAL (
        SELECT
          coalesce(bool_or(lower(bf.format) = ANY(${AUDIO_FORMATS}::text[])), false) AS has_audio,
          sum(bf.duration_seconds) FILTER (WHERE lower(bf.format) = ANY(${AUDIO_FORMATS}::text[]))::float8 AS audio_seconds,
          (array_agg(bf.id ORDER BY bf.sort_order NULLS LAST, bf.id)
            FILTER (WHERE lower(bf.format) = 'epub' AND NOT bf.media_overlay_available))[1] AS epub_file_id,
          coalesce(bool_or(lower(bf.format) = 'epub' AND bf.media_overlay_available), false) AS has_overlay
        FROM book_files bf
        WHERE bf.book_id = b.id AND bf.role = 'content'
      ) f ON true
      WHERE b.status NOT IN ('missing', 'processing')
        AND (f.has_audio OR f.epub_file_id IS NOT NULL)
    `);
    return result.rows;
  }

  /** Book ids this user may open in these libraries, content filters included. */
  async visibleBookIds(user: RequestUser, libraryIds: number[]): Promise<Set<number>> {
    if (libraryIds.length === 0) return new Set();
    const rows = await this.db
      .select({ id: books.id })
      .from(books)
      .where(duplicateScopeWhere(this.db, libraryIds, user));
    return new Set(rows.map((row) => row.id));
  }

  async findBookFiles(bookIds: readonly number[]): Promise<ReadAlongBookFile[]> {
    if (bookIds.length === 0) return [];
    const result = await this.db.execute<{
      id: number;
      book_id: number;
      format: string | null;
      role: string;
      file_hash: string | null;
      media_overlay_available: boolean;
    }>(sql`
      SELECT id, book_id, format, role, file_hash, media_overlay_available
      FROM book_files WHERE book_id = ANY(${sql.param([...new Set(bookIds)])}::int[])
    `);
    return result.rows.map((row) => ({
      id: row.id,
      bookId: row.book_id,
      format: row.format,
      role: row.role,
      fileHash: row.file_hash,
      mediaOverlayAvailable: row.media_overlay_available,
    }));
  }

  async findReadAlongOutputs(bookIds: readonly number[]): Promise<ReadAlongOutputFile[]> {
    if (bookIds.length === 0) return [];
    const result = await this.db.execute<{
      book_id: number;
      file_id: number;
      filename: string;
      epub_file_id: string | null;
      epub_hash: string | null;
    }>(sql`
      SELECT f.book_id, f.id AS file_id, regexp_replace(f.absolute_path, '^.*/', '') AS filename,
        j.input ->> 'epubFileId' AS epub_file_id,
        j.input -> 'sourceHashes' ->> (j.input ->> 'epubFileId') AS epub_hash
      FROM book_files f
      LEFT JOIN LATERAL (
        SELECT rj.input FROM read_aloud_jobs rj
        WHERE rj.output_file_id = f.id AND rj.status IN ('completed', 'completed_with_warnings')
        ORDER BY rj.completed_at DESC NULLS LAST LIMIT 1
      ) j ON true
      WHERE f.book_id = ANY(${sql.param([...new Set(bookIds)])}::int[])
        AND f.media_overlay_available AND lower(f.format) = 'epub'
      ORDER BY f.book_id, f.id
    `);
    return result.rows.map((row) => ({
      bookId: row.book_id,
      fileId: row.file_id,
      filename: row.filename,
      epubFileId: row.epub_file_id === null ? null : Number(row.epub_file_id),
      epubHash: row.epub_hash,
    }));
  }

  async findActiveJobIds(bookIds: readonly number[]): Promise<Map<number, string>> {
    if (bookIds.length === 0) return new Map();
    const result = await this.db.execute<{ book_id: number; id: string }>(sql`
      SELECT DISTINCT ON (book_id) book_id, id::text AS id FROM read_aloud_jobs
      WHERE book_id = ANY(${sql.param([...new Set(bookIds)])}::int[]) AND status = ANY(${ACTIVE_STATUSES}::text[])
      ORDER BY book_id, created_at DESC
    `);
    return new Map(result.rows.map((row) => [row.book_id, row.id]));
  }
}
