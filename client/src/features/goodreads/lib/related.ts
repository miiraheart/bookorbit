import type { BookCard, GoodreadsShelfRow } from '@bookorbit/types'
import type { RouteLocationRaw } from 'vue-router'
import { pickCopies, rowCards } from './copies'

/** Goodreads appends the series to the title: "Dark Age (Red Rising Saga, #5)". */
const TITLE_SERIES = /\s*\(([^()#]+?),?\s*#(\d+(?:\.\d+)?)[^()]*\)\s*$/

export interface TitleSeries {
  name: string
  index: number
}

function fold(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLowerCase()
}

export function titleSeries(title: string): TitleSeries | null {
  const match = TITLE_SERIES.exec(title)
  return match ? { name: match[1]!.trim(), index: Number(match[2]) } : null
}

export function titleWithoutSeries(title: string): string {
  return title.replace(TITLE_SERIES, '').trim() || title
}

/** The related rows in the named series, in series order. */
export function seriesRows(related: readonly GoodreadsShelfRow[], seriesName: string | null | undefined): GoodreadsShelfRow[] {
  const wanted = fold(seriesName ?? '')
  if (!wanted) return []
  return related
    .map((row) => ({ row, series: titleSeries(row.title) }))
    .filter((entry) => entry.series && fold(entry.series.name) === wanted)
    .sort((a, b) => a.series!.index - b.series!.index)
    .map((entry) => entry.row)
}

/** The copy the library would show for a row, if this user can see one. */
export function shownCopy(row: Pick<GoodreadsShelfRow, 'bookIds'>, cardsById: ReadonlyMap<number, BookCard>): BookCard | null {
  return pickCopies(rowCards(row, cardsById)).primary
}

/** An owned row opens its library page on the shown copy; any other row opens its Goodreads page. */
export function goodreadsRowLocation(row: GoodreadsShelfRow, cardsById: ReadonlyMap<number, BookCard>): RouteLocationRaw {
  const copy = shownCopy(row, cardsById)
  if (copy) return { name: 'book-detail', params: { bookId: copy.id }, query: { tab: 'details' } }
  return { name: 'goodreads-book', params: { source: row.source, key: row.key } }
}
