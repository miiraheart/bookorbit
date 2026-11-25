import { ref, watch, type Ref } from 'vue'
import type { GoodreadsOverview, GoodreadsShelfRow, GoodreadsSort } from '@bookorbit/types'
import { fetchGoodreadsOverview, fetchGoodreadsShelf } from '../api/goodreads.api'

const PAGE_SIZE = 50

/** The overview (sources, tabs and counts) plus one shelf's rows, loaded a page at a time. */
export function useGoodreadsShelves(source: Ref<string | null>, shelf: Ref<string | null>, sort: Ref<GoodreadsSort>, search: Ref<string>) {
  const overview = ref<GoodreadsOverview | null>(null)
  const rows = ref<GoodreadsShelfRow[]>([])
  const total = ref(0)
  const loading = ref(false)
  const error = ref(false)
  let generation = 0

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

  watch([source, shelf, sort, search], () => void loadRows(false))

  return { overview, rows, total, loading, error, loadOverview, loadRows, patchRow }
}
