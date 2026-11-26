import {
  getCoverMedia,
  getPrimaryBookFile,
  isAudioFormat,
  isContentBookFile,
  READER_OPENABLE_FORMATS,
  type BookCard,
  type BookFileRef,
  type GoodreadsShelfRow,
} from '@bookorbit/types'
import type { RouteLocationRaw } from 'vue-router'

import { bookFormatEntries } from '@/features/book/lib/book-formats'

export type CopyKind = 'ebook' | 'audio' | 'both' | 'other'

export interface RowCopies {
  ebook: BookCard | null
  audio: BookCard | null
  primary: BookCard | null
  others: BookCard[]
}

export interface OpenableEntry {
  key: string
  audio: boolean
  readAlong: boolean
  file: BookFileRef
}

type OverlayFile = Pick<BookFileRef, 'format' | 'mediaOverlay'> & { mediaOverlayAvailable?: boolean | null }

const SPLIT_PART = /\(part \d+ of \d+\)/i

function contentFiles(card: BookCard): BookFileRef[] {
  return card.files.filter(isContentBookFile)
}

function media(card: BookCard) {
  return getCoverMedia(contentFiles(card))
}

function hasOverlay(file: OverlayFile): boolean {
  return file.format?.toLowerCase() === 'epub' && (file.mediaOverlay?.available === true || file.mediaOverlayAvailable === true)
}

function hasAudioTrack(card: BookCard): boolean {
  return contentFiles(card).some((file) => isAudioFormat(file.format!))
}

function isSplitPart(card: BookCard): boolean {
  return SPLIT_PART.test(card.title ?? '')
}

export function rowCards(row: Pick<GoodreadsShelfRow, 'bookIds'>, cardsById: ReadonlyMap<number, BookCard>): BookCard[] {
  return row.bookIds.flatMap((id) => cardsById.get(id) ?? [])
}

export function classifyCard(card: BookCard): CopyKind {
  const { hasEbook, hasAudio } = media(card)
  if (hasEbook && hasAudio) return 'both'
  if (hasEbook) return 'ebook'
  if (hasAudio) return 'audio'
  return 'other'
}

/**
 * The ebook prefers a narrated EPUB. The audio copy must hold a real audio track, a narrated EPUB
 * alone is not one, and a whole audiobook wins over a "(Part 2 of 3)" split.
 */
export function pickCopies(cards: readonly BookCard[]): RowCopies {
  const ebooks = cards.filter((card) => media(card).hasEbook)
  const ebook = ebooks.find((card) => contentFiles(card).some(hasOverlay)) ?? ebooks[0] ?? null
  const audios = cards.filter(hasAudioTrack)
  const audio = audios.find((card) => !isSplitPart(card)) ?? audios[0] ?? null
  return {
    ebook,
    audio,
    primary: ebook ?? audio ?? cards[0] ?? null,
    others: cards.filter((card) => card !== ebook && card !== audio),
  }
}

export function ownedFormats(cards: readonly BookCard[]): { ebook: boolean; audio: boolean } {
  return { ebook: cards.some((card) => media(card).hasEbook), audio: cards.some(hasAudioTrack) }
}

/** The same route the library card opens, so the reader mounts the player that fits the file. */
export function readerLocation(card: Pick<BookCard, 'id'>, file: Pick<BookFileRef, 'id' | 'format'>, mode?: 'peek'): RouteLocationRaw {
  return {
    name: 'reader',
    params: { bookId: card.id, fileId: file.id },
    query: mode === 'peek' ? { format: file.format ?? 'epub', mode } : { format: file.format ?? 'epub' },
  }
}

/** One entry per edition the reader can open; an audiobook opens from its first track. */
export function openableEntries(card: BookCard): OpenableEntry[] {
  return bookFormatEntries(card.files)
    .map((entry) => ({ key: entry.key, audio: entry.audio, readAlong: entry.readAlong, file: entry.files[0]! }))
    .filter((entry) => READER_OPENABLE_FORMATS.has(entry.file.format!.toLowerCase()))
}

/** The file the card's own Read or Play button opens. */
export function primaryOpenableFile(card: BookCard): BookFileRef | null {
  return getPrimaryBookFile(openableEntries(card).map((entry) => entry.file))
}
