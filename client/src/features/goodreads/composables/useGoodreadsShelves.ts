import { computed, ref, shallowRef, watch, type Ref } from 'vue'
import { GOODREADS_CARD_CAP, type BookCard, type GoodreadsOverview, type GoodreadsShelfRow, type GoodreadsSort } from '@bookorbit/types'
import { fetchGoodreadsOverview, fetchGoodreadsShelf } from '../api/goodreads.api'

const PAGE_SIZE = 50

/** The copies the server looked up for one page, in the same order and with the same cap it uses. */
function lookedUpIds(items: readonly GoodreadsShelfRow[]): number[] {
  return [...new Set(items.flatMap((item) => item.bookIds))].slice(0, GOODREADS_CARD_CAP)
}

/** The overview (sources, tabs and counts) plus one shelf's rows, loaded a page at a time. */
export function useGoodreadsShelves(source: Ref<string | null>, shelf: Ref<string | null>, sort: Ref<GoodreadsSort>, search: Ref<string>) {
  const overview = ref<GoodreadsOverview | null>(null)
  const rows = ref<GoodreadsShelfRow[]>([])
  const total = ref(0)
  const cardsById = shallowRef<ReadonlyMap<number, BookCard>>(new Map())
  /** A copy in here with no card was hidden from this user or no longer exists; one outside it was never asked for. */
  const checkedIds = shallowRef<ReadonlySet<number>>(new Set())
  const loading = ref(false)
  const error = ref(false)
  let generation = 0

  /**
   * The cards as the library composables expect them. Writing a shorter list drops the missing
   * copies from their rows too, so a deleted or merged-away copy leaves the page at once.
   */
  const books = computed<BookCard[]>({
    get: () => [...cardsById.value.values()],
    set: (next) => {
      const kept = new Map(next.map((card) => [card.id, card]))
      const removed = new Set([...cardsById.value.keys()].filter((id) => !kept.has(id)))
      cardsById.value = kept
      if (removed.size === 0) return
      rows.value = rows.value.map((row) =>
        row.bookIds.some((id) => removed.has(id)) ? { ...row, bookIds: row.bookIds.filter((id) => !removed.has(id)) } : row,
      )
    },
  })

  async function loadOverview(): Promise<void> {
    try {
      overview.value = await fetchGoodreadsOverview()
      error.value = false
    } catch {
      error.value = true
    }
  }

  async function loadRows(append = false): Promise<void> {
    const sourceId = source.value
    const name = shelf.value
    if (!sourceId || !name) {
      rows.value = []
      total.value = 0
      cardsById.value = new Map()
      checkedIds.value = new Set()
      return
    }
    const mine = ++generation
    loading.value = true
    try {
      const page = await fetchGoodreadsShelf({
        source: sourceId,
        shelf: name,
        sort: sort.value,
        q: search.value,
        offset: append ? rows.value.length : 0,
        limit: PAGE_SIZE,
      })
      if (mine !== generation) return
      rows.value = append ? [...rows.value, ...page.items] : page.items
      const cards = new Map(append ? cardsById.value : [])
      for (const card of page.cards) cards.set(card.id, card)
      cardsById.value = cards
      checkedIds.value = new Set([...(append ? checkedIds.value : []), ...lookedUpIds(page.items)])
      total.value = page.total
      error.value = false
    } catch {
      if (mine === generation) error.value = true
    } finally {
      if (mine === generation) loading.value = false
    }
  }

  function patchRow(key: string, patch: Partial<GoodreadsShelfRow>): void {
    rows.value = rows.value.map((row) => (row.key === key ? { ...row, ...patch } : row))
  }

  /** Owned on the snapshot, yet the server sent no card for any copy it looked up. */
  function isUnavailable(row: GoodreadsShelfRow): boolean {
    return row.bookIds.length > 0 && row.bookIds.every((id) => checkedIds.value.has(id) && !cardsById.value.has(id))
  }

  watch([source, shelf, sort, search], () => void loadRows(false))

  return { overview, rows, total, cardsById, books, checkedIds, loading, error, loadOverview, loadRows, patchRow, isUnavailable }
}
