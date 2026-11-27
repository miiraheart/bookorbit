import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { refDebounced, useLocalStorage, useSessionStorage } from '@vueuse/core'
import { toast } from 'vue-sonner'
import { useRouter } from 'vue-router'
import type { BookRequestMediaKind, GoodreadsOverview, GoodreadsRequestState, GoodreadsShelfRow, GoodreadsSort } from '@bookorbit/types'
import { usePermissions } from '@/features/auth/composables/usePermissions'
import { useRequestLanguageDefault } from '@/features/book-requests/composables/useRequestDestinationDefault'
import { formatDate } from '@/i18n/formatters'
import { errorMessage } from '@/lib/api-json'
import { cancelGoodreadsRequests, requestGoodreadsBook } from '../api/goodreads.api'
import { useReadAlongAccess } from './useReadAlongAccess'
import { useGoodreadsShelves } from './useGoodreadsShelves'
import { useGoodreadsSync } from './useGoodreadsSync'
import { GOODREADS_MESSAGE_ROOT, goodreadsShelfLabel } from '../i18n'
import { cancelSummary, cancellableRequestIds, requestRows, requestableRows } from '../lib/bulk'

export type GoodreadsViewMode = 'grid' | 'list'

/** Everything the Goodreads page shows and does, outside the library actions of owned copies. */
export function useGoodreadsPage() {
  const { t } = useI18n()

  function gt(key: string, params: Record<string, unknown> = {}): string {
    return t(`${GOODREADS_MESSAGE_ROOT}.${key}`, params)
  }
  const { hasPermission } = usePermissions()
  const language = useRequestLanguageDefault()

  const source = useSessionStorage<string | null>('goodreads.source', null)
  const shelf = useSessionStorage<string | null>('goodreads.shelf', null)
  const sort = ref<GoodreadsSort>('newest')
  const searchText = ref('')
  const search = refDebounced(searchText, 250)
  const requestingKey = ref<string | null>(null)
  const selectedKeys = ref<Set<string>>(new Set())
  const bulkBusy = ref(false)
  const cancelConfirmOpen = ref(false)
  const readAlongRow = ref<GoodreadsShelfRow | null>(null)
  const viewMode = useLocalStorage<GoodreadsViewMode>('goodreads.viewMode', 'grid')
  const router = useRouter()

  const shelvesState = useGoodreadsShelves(source, shelf, sort, search)
  const { overview, rows, loadOverview, loadRows, patchRow } = shelvesState

  const canRequest = computed(() => hasPermission('book_request_access'))
  const readAlongAccess = useReadAlongAccess()
  const sources = computed(() => overview.value?.sources ?? [])
  const currentSource = computed(() => sources.value.find((entry) => entry.id === source.value) ?? null)
  const shelves = computed(() => currentSource.value?.shelves ?? [])
  const selectedRows = computed(() => rows.value.filter((row) => selectedKeys.value.has(row.key)))
  const pageSelection = computed(() => {
    const count = rows.value.filter((row) => selectedKeys.value.has(row.key)).length
    return count === 0 ? 'none' : count === rows.value.length ? 'all' : 'some'
  })
  const canBulkRequest = computed(() => canRequest.value && requestableRows(selectedRows.value, 'ebook').length > 0)
  const bulkCancelIds = computed(() => cancellableRequestIds(selectedRows.value))
  const emptyText = computed(() => {
    if (currentSource.value && !currentSource.value.lastSyncedAt) return gt('notSyncedSource')
    return search.value.trim() ? gt('emptySearch') : gt('empty')
  })

  function shelfLabel(name: string): string {
    return goodreadsShelfLabel(name, t)
  }

  function readDate(row: GoodreadsShelfRow): string | null {
    return row.readAt ? gt('readOn', { date: formatDate(new Date(row.readAt), { dateStyle: 'medium' }) }) : null
  }

  function firstSeen(row: GoodreadsShelfRow): string {
    return gt('firstSeen', { date: formatDate(new Date(row.firstSeenAt), { dateStyle: 'medium' }) })
  }

  function statusLabel(row: GoodreadsShelfRow): string {
    return row.request ? t(`bookRequests.status.${row.request.status}`) : ''
  }

  watch(sources, (list) => {
    if (!source.value || !list.some((entry) => entry.id === source.value)) source.value = list[0]?.id ?? null
  })

  watch(shelves, (list) => {
    if (!shelf.value || !list.some((entry) => entry.name === shelf.value)) shelf.value = list[0]?.name ?? null
  })

  watch([source, shelf, sort, search], () => {
    selectedKeys.value = new Set()
  })

  onMounted(async () => {
    void language.load()
    await loadOverview()
    if (shelf.value) await loadRows(false)
  })

  function handleSelectSource(id: string) {
    source.value = id
    shelf.value = null
  }

  function handleSelectShelf(name: string) {
    shelf.value = name
  }

  function handleMore() {
    void loadRows(true)
  }

  /** Only read for owned rows, which always have at least one copy. */
  function ownedBookId(row: GoodreadsShelfRow): number {
    return row.bookIds[0] ?? 0
  }

  /** Owned: the library's own book page, as a library card opens it. Not owned: the book's Goodreads page. */
  function handleOpen(row: GoodreadsShelfRow) {
    if (row.bookIds.length > 0 && !shelvesState.isUnavailable(row)) {
      void router.push({ name: 'book-detail', params: { bookId: ownedBookId(row) } })
      return
    }
    void router.push({ name: 'goodreads-book', params: { source: row.source, key: row.key } })
  }

  function handleToggleRow(key: string) {
    const next = new Set(selectedKeys.value)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    selectedKeys.value = next
  }

  /** Only the rows on screen, which already respect the search and the shelf. */
  function handleToggleAll() {
    selectedKeys.value = pageSelection.value === 'all' ? new Set() : new Set(rows.value.map((row) => row.key))
  }

  function recordRequest(key: string, kind: BookRequestMediaKind, created: GoodreadsRequestState | null) {
    const current = rows.value.find((entry) => entry.key === key)
    if (created && current) patchRow(key, { request: created, requests: { ...current.requests, [kind]: created } })
  }

  async function handleRequest(row: GoodreadsShelfRow, kind: BookRequestMediaKind = 'ebook') {
    if (requestingKey.value) return
    requestingKey.value = row.key
    try {
      recordRequest(row.key, kind, await requestGoodreadsBook(row, language.resolveLanguage(null), kind))
      toast.success(gt('requested', { title: row.title }))
    } catch (reason) {
      toast.error(errorMessage(reason, 'goodreads.requestFailed'))
      void loadRows(false)
    } finally {
      requestingKey.value = null
    }
  }

  async function handleBulkRequest(kind: BookRequestMediaKind = 'ebook') {
    if (bulkBusy.value) return
    bulkBusy.value = true
    try {
      const summary = await requestRows(
        selectedRows.value,
        kind,
        (row) => requestGoodreadsBook(row, language.resolveLanguage(null), kind),
        (row, created) => recordRequest(row.key, kind, created),
      )
      const message = gt('bulkRequested', {
        requested: summary.requested,
        owned: summary.owned,
        already: summary.alreadyRequested,
        failed: summary.failed,
      })
      if (summary.failed > 0) toast.error(message)
      else toast.success(message)
      selectedKeys.value = new Set()
    } finally {
      bulkBusy.value = false
    }
  }

  async function handleBulkCancel() {
    if (bulkBusy.value) return
    bulkBusy.value = true
    const chosen = selectedRows.value
    try {
      const result = await cancelGoodreadsRequests(bulkCancelIds.value)
      const summary = cancelSummary(chosen, result.updated.length, result.failed.length)
      toast.success(gt('bulkCancelled', { ...summary }))
      selectedKeys.value = new Set()
    } catch (reason) {
      toast.error(errorMessage(reason, 'goodreads.cancelFailed'))
    } finally {
      bulkBusy.value = false
      cancelConfirmOpen.value = false
      void loadRows(false)
    }
  }

  function setSearchText(value: string | number) {
    searchText.value = String(value)
  }

  function setSort(value: string | number) {
    sort.value = value as GoodreadsSort
  }

  function setViewMode(value: GoodreadsViewMode) {
    viewMode.value = value
  }

  function setOverview(value: GoodreadsOverview) {
    overview.value = value
  }

  function openReadAlong(row: GoodreadsShelfRow | null) {
    readAlongRow.value = row
  }

  function setCancelConfirmOpen(value: boolean) {
    cancelConfirmOpen.value = value
  }

  const sync = useGoodreadsSync({ overview, sources, gt, loadOverview, loadRows })

  return reactive({
    ...shelvesState,
    ...sync,
    gt,
    source,
    shelf,
    sort,
    searchText,
    search,
    requestingKey,
    selectedKeys,
    bulkBusy,
    cancelConfirmOpen,
    readAlongRow,
    viewMode,
    canRequest,
    readAlongAccess,
    sources,
    currentSource,
    shelves,
    selectedRows,
    pageSelection,
    canBulkRequest,
    bulkCancelIds,
    emptyText,
    shelfLabel,
    readDate,
    firstSeen,
    statusLabel,
    ownedBookId,
    handleSelectSource,
    handleSelectShelf,
    handleMore,
    handleOpen,
    handleToggleRow,
    handleToggleAll,
    handleRequest,
    handleBulkRequest,
    handleBulkCancel,
    setSearchText,
    setSort,
    setViewMode,
    setOverview,
    setCancelConfirmOpen,
    openReadAlong,
  })
}

export type GoodreadsPage = ReturnType<typeof useGoodreadsPage>
