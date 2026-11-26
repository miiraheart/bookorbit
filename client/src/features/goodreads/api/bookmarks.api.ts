import type { AudiobookBookmark } from '@bookorbit/types'
import type { Bookmark } from '@/features/reader/epub/composables/useBookmarks'
import { apiJson } from '@/lib/api-json'

/** Every EPUB bookmark of the book: without a readerFileId the server sends them unprojected. */
export function fetchEbookBookmarks(bookId: number): Promise<Bookmark[]> {
  return apiJson<Bookmark[]>(`/api/v1/books/${bookId}/bookmarks`, undefined, 'goodreads.bookmarksFailed')
}

export function fetchAudioBookmarks(bookId: number): Promise<AudiobookBookmark[]> {
  return apiJson<AudiobookBookmark[]>(`/api/v1/audiobooks/${bookId}/bookmarks`, undefined, 'goodreads.bookmarksFailed')
}
