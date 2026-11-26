import { computed, ref, shallowRef } from 'vue'
import type { ReadAlongListSummary, ReadAlongPairStatus, ReadAlongRow } from '@bookorbit/types'

import { errorMessage } from '@/lib/api-json'
import { acceptExact, listReadAlong } from '../api/read-along-pairs.api'

export const READ_ALONG_PAGE_SIZE = 50

export function useReadAlongList() {
  const items = shallowRef<ReadAlongRow[]>([])
  const summary = shallowRef<ReadAlongListSummary | null>(null)
  const total = ref(0)
  const page = ref(1)
  const status = ref<ReadAlongPairStatus | undefined>(undefined)
  const libraryId = ref<number | undefined>(undefined)
  const query = ref('')
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref<string | null>(null)
  const accepting = ref(false)

  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / READ_ALONG_PAGE_SIZE)))

  let generation = 0

  async function fetchList(): Promise<void> {
    const current = ++generation
    loading.value = true
    error.value = null
    try {
      const result = await listReadAlong({
        status: status.value,
        libraryId: libraryId.value,
        q: query.value.trim() || undefined,
        page: page.value,
        pageSize: READ_ALONG_PAGE_SIZE,
      })
      if (current !== generation) return
      if (result.items.length === 0 && page.value > 1 && result.total > 0) {
        page.value = Math.ceil(result.total / READ_ALONG_PAGE_SIZE)
        return fetchList()
      }
      items.value = result.items
      total.value = result.total
      summary.value = result.summary
      loaded.value = true
    } catch (reason) {
      if (current !== generation) return
      error.value = errorMessage(reason, 'tools.readAlong.errors.list')
    } finally {
      if (current === generation) loading.value = false
    }
  }

  function setStatus(next: ReadAlongPairStatus | undefined): Promise<void> {
    status.value = next
    page.value = 1
    return fetchList()
  }

  function setLibrary(next: number | undefined): Promise<void> {
    libraryId.value = next
    page.value = 1
    return fetchList()
  }

  function setQuery(next: string): Promise<void> {
    query.value = next
    page.value = 1
    return fetchList()
  }

  function setPage(next: number): Promise<void> {
    page.value = Math.min(Math.max(1, next), totalPages.value)
    return fetchList()
  }

  async function countExact(): Promise<number> {
    const result = await listReadAlong({ status: 'suggested', tier: 'exact', libraryId: libraryId.value, page: 1, pageSize: 1 })
    return result.total
  }

  async function pairAllExact(): Promise<{ paired: number; skipped: number } | null> {
    if (accepting.value) return null
    accepting.value = true
    error.value = null
    try {
      const result = await acceptExact(libraryId.value)
      await fetchList()
      return result
    } catch (reason) {
      error.value = errorMessage(reason, 'tools.readAlong.errors.acceptExact')
      return null
    } finally {
      accepting.value = false
    }
  }

  return {
    items,
    summary,
    total,
    page,
    totalPages,
    status,
    libraryId,
    query,
    loading,
    loaded,
    error,
    accepting,
    fetchList,
    setStatus,
    setLibrary,
    setQuery,
    setPage,
    countExact,
    pairAllExact,
  }
}
