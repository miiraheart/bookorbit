<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { refDebounced } from '@vueuse/core'
import { toast } from 'vue-sonner'
import { BookMarked, BookPlus, Check, LayoutGrid, List, Pencil, Plus, RefreshCw, Search, Star, Trash2, XCircle } from '@lucide/vue'
import { useRouter } from 'vue-router'
import { useLocalStorage } from '@vueuse/core'
import { GOODREADS_LIST_SHELF, type GoodreadsShelfRow, type GoodreadsSort, type GoodreadsSourceSummary } from '@bookorbit/types'
import PageTitleRow from '@/components/page-header/PageTitleRow.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { usePermissions } from '@/features/auth/composables/usePermissions'
import BookCoverArtwork from '@/features/book/components/BookCoverArtwork.vue'
import BookCoverImage from '@/features/book/components/BookCoverImage.vue'
import { useRequestLanguageDefault } from '@/features/book-requests/composables/useRequestDestinationDefault'
import { formatDate, formatRelativeTimeFromNow } from '@/i18n/formatters'
import { errorMessage } from '@/lib/api-json'
import {
  addGoodreadsSource,
  cancelGoodreadsRequests,
  removeGoodreadsSource,
  renameGoodreadsSource,
  requestGoodreadsBook,
  requestGoodreadsSync,
} from '../api/goodreads.api'
import GoodreadsBookSheet from '../components/GoodreadsBookSheet.vue'
import { useGoodreadsShelves } from '../composables/useGoodreadsShelves'
import { GOODREADS_MESSAGE_ROOT, goodreadsShelfLabelKey, installGoodreadsMessages } from '../i18n'
import { cancelSummary, cancellableRequestIds, requestRows, requestableRows } from '../lib/bulk'

installGoodreadsMessages()

const { t } = useI18n()

function gt(key: string, params: Record<string, unknown> = {}): string {
  return t(`${GOODREADS_MESSAGE_ROOT}.${key}`, params)
}
const { hasPermission } = usePermissions()
const language = useRequestLanguageDefault()

const source = ref<string | null>(null)
const shelf = ref<string | null>(null)
const sort = ref<GoodreadsSort>('newest')
const searchText = ref('')
const search = refDebounced(searchText, 250)
const syncing = ref(false)
const requestingKey = ref<string | null>(null)
const selectedKeys = ref<Set<string>>(new Set())
const bulkBusy = ref(false)
const cancelConfirmOpen = ref(false)
const newSourceUrl = ref('')
const addingSource = ref(false)
const renamingId = ref<string | null>(null)
const renameText = ref('')
const removeTarget = ref<GoodreadsSourceSummary | null>(null)
const viewMode = useLocalStorage<'grid' | 'list'>('goodreads.viewMode', 'grid')
const sheetRow = ref<GoodreadsShelfRow | null>(null)
const router = useRouter()

const { overview, rows, total, loading, error, loadOverview, loadRows, patchRow } = useGoodreadsShelves(source, shelf, sort, search)

const canRequest = computed(() => hasPermission('book_request_access'))
const sources = computed(() => overview.value?.sources ?? [])
const currentSource = computed(() => sources.value.find((entry) => entry.id === source.value) ?? null)
const shelves = computed(() => currentSource.value?.shelves ?? [])
const selectedRows = computed(() => rows.value.filter((row) => selectedKeys.value.has(row.key)))
const pageSelection = computed(() => {
  const count = rows.value.filter((row) => selectedKeys.value.has(row.key)).length
  return count === 0 ? 'none' : count === rows.value.length ? 'all' : 'some'
})
const canBulkRequest = computed(() => canRequest.value && requestableRows(selectedRows.value).length > 0)
const bulkCancelIds = computed(() => cancellableRequestIds(selectedRows.value))
const syncLabel = computed(() => {
  const synced = overview.value?.lastSyncedAt
  return synced ? gt('lastSynced', { time: formatRelativeTimeFromNow(synced) }) : gt('neverSynced')
})
const syncPending = computed(() => {
  const requested = overview.value?.syncRequestedAt
  if (!requested) return null
  const synced = overview.value?.lastSyncedAt
  return !synced || requested > synced ? gt('syncPending', { time: formatRelativeTimeFromNow(requested) }) : null
})
const emptyText = computed(() => {
  if (currentSource.value && !currentSource.value.lastSyncedAt) return gt('notSyncedSource')
  return search.value.trim() ? gt('emptySearch') : gt('empty')
})

function sourceLabel(entry: GoodreadsSourceSummary): string {
  return entry.own && entry.name === 'My shelves' ? gt('ownSource') : entry.name
}

function shelfLabel(name: string): string {
  if (name === GOODREADS_LIST_SHELF) return gt('listShelf')
  const key = goodreadsShelfLabelKey(name)
  return key ? t(key) : name
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

/** Owned: the library's own book page, as a library card opens it. Not owned: the provider lookup sheet. */
function handleOpen(row: GoodreadsShelfRow) {
  if (row.bookIds.length > 0) {
    void router.push({ name: 'book-detail', params: { bookId: ownedBookId(row) } })
    return
  }
  sheetRow.value = row
}

async function handleSheetRequest(row: GoodreadsShelfRow) {
  await handleRequest(row)
  const updated = rows.value.find((entry) => entry.key === row.key)
  if (updated && sheetRow.value?.key === row.key) sheetRow.value = updated
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

async function handleSync() {
  syncing.value = true
  try {
    overview.value = await requestGoodreadsSync()
    toast.success(gt('syncQueued'))
  } catch (reason) {
    toast.error(errorMessage(reason, 'goodreads.syncFailed'))
  } finally {
    syncing.value = false
  }
}

async function handleRequest(row: GoodreadsShelfRow) {
  if (requestingKey.value) return
  requestingKey.value = row.key
  try {
    const created = await requestGoodreadsBook(row, language.resolveLanguage(null))
    if (created) patchRow(row.key, { request: created })
    toast.success(gt('requested', { title: row.title }))
  } catch (reason) {
    toast.error(errorMessage(reason, 'goodreads.requestFailed'))
    void loadRows(false)
  } finally {
    requestingKey.value = null
  }
}

async function handleBulkRequest() {
  if (bulkBusy.value) return
  bulkBusy.value = true
  try {
    const summary = await requestRows(
      selectedRows.value,
      (row) => requestGoodreadsBook(row, language.resolveLanguage(null)),
      (row, created) => {
        if (created) patchRow(row.key, { request: created })
      },
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

async function handleAddSource() {
  if (!newSourceUrl.value.trim() || addingSource.value) return
  addingSource.value = true
  try {
    overview.value = await addGoodreadsSource(newSourceUrl.value)
    newSourceUrl.value = ''
    toast.success(gt('sourceAdded'))
  } catch (reason) {
    toast.error(errorMessage(reason, 'goodreads.sourceAddFailed'))
  } finally {
    addingSource.value = false
  }
}

function handleStartRename(entry: GoodreadsSourceSummary) {
  renamingId.value = entry.id
  renameText.value = entry.name
}

async function handleRename() {
  const id = renamingId.value
  if (!id || !renameText.value.trim()) return
  try {
    overview.value = await renameGoodreadsSource(id, renameText.value.trim())
  } catch (reason) {
    toast.error(errorMessage(reason, 'goodreads.sourceRenameFailed'))
  } finally {
    renamingId.value = null
  }
}

async function handleRemove() {
  const target = removeTarget.value
  if (!target) return
  try {
    overview.value = await removeGoodreadsSource(target.id)
  } catch (reason) {
    toast.error(errorMessage(reason, 'goodreads.sourceRemoveFailed'))
  } finally {
    removeTarget.value = null
  }
}
</script>

<template>
  <div class="flex w-full flex-col gap-4 pt-2 pb-4">
    <PageTitleRow class="shrink-0" :eyebrow="gt('eyebrow')" :title="gt('title')" :icon="BookMarked">
      <template #actions>
        <div class="flex shrink-0 items-center gap-3">
          <span class="text-xs text-muted-foreground max-sm:hidden" data-testid="goodreads-sync-label">{{ syncPending ?? syncLabel }}</span>
          <Button variant="outline" size="sm" :disabled="syncing" data-testid="goodreads-sync" @click="handleSync">
            <RefreshCw class="size-3.5" :class="{ 'animate-spin': syncing }" aria-hidden="true" />
            <span class="max-sm:hidden">{{ gt('syncNow') }}</span>
          </Button>
        </div>
      </template>
    </PageTitleRow>

    <p v-if="error && !overview" class="rounded-xl border border-border bg-card p-6 text-sm text-destructive">{{ gt('loadFailed') }}</p>

    <template v-else-if="overview">
      <section class="flex flex-col gap-3 rounded-xl border border-border bg-card p-3" data-testid="goodreads-sources">
        <div class="flex flex-wrap items-center gap-2">
          <template v-for="entry in sources" :key="entry.id">
            <form v-if="renamingId === entry.id" class="flex items-center gap-1" @submit.prevent="handleRename">
              <Input v-model="renameText" class="h-8 w-48" :aria-label="gt('renamePrompt')" />
              <Button type="submit" size="sm" variant="outline"><Check class="size-3.5" aria-hidden="true" /></Button>
            </form>
            <div v-else class="flex items-center">
              <button
                type="button"
                :aria-pressed="entry.id === source"
                :data-testid="`goodreads-source-${entry.id}`"
                class="flex h-8 items-center gap-2 rounded-full border px-3 text-sm transition-colors"
                :class="entry.id === source ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground hover:bg-accent'"
                @click="handleSelectSource(entry.id)"
              >
                <span>{{ sourceLabel(entry) }}</span>
                <span class="text-xs opacity-80">{{ entry.total }}</span>
                <span v-if="entry.newCount > 0" class="rounded-full bg-background/20 px-1.5 text-xs font-medium">{{
                  gt('newCount', { count: entry.newCount })
                }}</span>
              </button>
              <template v-if="!entry.own && entry.id === source">
                <Button variant="ghost" size="sm" :aria-label="gt('renameSource')" :title="gt('renameSource')" @click="handleStartRename(entry)">
                  <Pencil class="size-3.5" aria-hidden="true" />
                </Button>
                <Button variant="ghost" size="sm" :aria-label="gt('removeSource')" :title="gt('removeSource')" @click="removeTarget = entry">
                  <Trash2 class="size-3.5" aria-hidden="true" />
                </Button>
              </template>
            </div>
          </template>
        </div>
        <form class="flex w-full max-w-xl items-center gap-2" data-testid="goodreads-add-source" @submit.prevent="handleAddSource">
          <Input v-model="newSourceUrl" :placeholder="gt('addSourcePlaceholder')" :aria-label="gt('addSourcePlaceholder')" />
          <Button type="submit" size="sm" variant="outline" :disabled="addingSource || !newSourceUrl.trim()">
            <Plus class="size-3.5" aria-hidden="true" />{{ gt('addSource') }}
          </Button>
        </form>
        <p v-if="currentSource?.lastError" class="text-xs text-destructive">{{ gt('sourceError', { error: currentSource.lastError }) }}</p>
      </section>

      <nav v-if="shelves.length > 0" class="flex flex-wrap gap-2" role="tablist" :aria-label="gt('title')">
        <button
          v-for="entry in shelves"
          :key="entry.name"
          type="button"
          role="tab"
          :aria-selected="entry.name === shelf"
          :data-testid="`goodreads-tab-${entry.name}`"
          class="flex h-8 items-center gap-2 rounded-full border px-3 text-sm transition-colors"
          :class="entry.name === shelf ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground hover:bg-accent'"
          @click="handleSelectShelf(entry.name)"
        >
          <span>{{ shelfLabel(entry.name) }}</span>
          <span class="text-xs opacity-80">{{ entry.count }}</span>
          <span v-if="entry.newCount > 0" class="text-xs font-medium">+{{ entry.newCount }}</span>
        </button>
      </nav>

      <section class="rounded-xl border border-border bg-card" :aria-busy="loading">
        <div class="flex flex-wrap items-center gap-3 border-b border-border p-3">
          <div class="relative w-full max-w-sm">
            <Search class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input v-model="searchText" class="pl-8" :placeholder="gt('search')" :aria-label="gt('search')" />
          </div>
          <Select v-model="sort" class="w-40" :aria-label="gt('sortLabel')" data-testid="goodreads-sort">
            <option value="newest">{{ gt('sortNewest') }}</option>
            <option value="title">{{ gt('sortTitle') }}</option>
            <option value="author">{{ gt('sortAuthor') }}</option>
          </Select>
          <div class="flex items-center rounded-md border border-border" role="group">
            <Button
              variant="ghost"
              size="sm"
              :aria-pressed="viewMode === 'grid'"
              :aria-label="gt('viewGrid')"
              :title="gt('viewGrid')"
              :class="viewMode === 'grid' ? 'bg-accent' : ''"
              data-testid="goodreads-view-grid"
              @click="viewMode = 'grid'"
            >
              <LayoutGrid class="size-3.5" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              :aria-pressed="viewMode === 'list'"
              :aria-label="gt('viewList')"
              :title="gt('viewList')"
              :class="viewMode === 'list' ? 'bg-accent' : ''"
              data-testid="goodreads-view-list"
              @click="viewMode = 'list'"
            >
              <List class="size-3.5" aria-hidden="true" />
            </Button>
          </div>
          <span class="ml-auto shrink-0 text-xs text-muted-foreground">{{ gt('books', { count: total }) }}</span>
        </div>

        <div v-if="rows.length > 0" class="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2" data-testid="goodreads-bulk-toolbar">
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              class="size-4 cursor-pointer rounded-xs border-border accent-primary"
              :checked="pageSelection === 'all'"
              :indeterminate.prop="pageSelection === 'some'"
              data-testid="goodreads-select-all"
              @change="handleToggleAll"
            />
            {{ gt('selectAll') }}
          </label>
          <span class="text-xs text-muted-foreground">{{ gt('selected', { count: selectedRows.length }) }}</span>
          <div class="ml-auto flex items-center gap-2">
            <Button size="sm" :disabled="bulkBusy || !canBulkRequest" data-testid="goodreads-bulk-request" @click="handleBulkRequest">
              <BookPlus class="size-3.5" aria-hidden="true" />{{ gt('bulkRequest') }}
            </Button>
            <Button
              size="sm"
              variant="outline"
              :disabled="bulkBusy || bulkCancelIds.length === 0"
              data-testid="goodreads-bulk-cancel"
              @click="cancelConfirmOpen = true"
            >
              <XCircle class="size-3.5" aria-hidden="true" />{{ gt('bulkCancel') }}
            </Button>
          </div>
        </div>

        <p v-if="!loading && rows.length === 0" class="p-6 text-sm text-muted-foreground">{{ emptyText }}</p>

        <ul v-else-if="viewMode === 'grid'" class="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-4 p-3" data-testid="goodreads-grid">
          <li v-for="row in rows" :key="row.key" class="group relative flex flex-col gap-1.5" data-testid="goodreads-card">
            <button
              type="button"
              class="relative aspect-[2/3] w-full overflow-hidden rounded-md border border-border transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
              :aria-label="gt('openBook', { title: row.title })"
              data-testid="goodreads-open"
              @click="handleOpen(row)"
            >
              <BookCoverImage v-if="row.bookIds.length > 0" :book-id="ownedBookId(row)" type="thumbnail" :alt="row.title" class="size-full object-cover" />
              <BookCoverArtwork
                v-else
                :src="row.coverUrl"
                :has-cover="row.coverUrl !== null"
                :title="row.title"
                :authors="row.authors"
                :seed="row.key"
                frame-aspect-ratio="2/3"
              />
              <span
                v-if="row.isNew"
                class="absolute top-1.5 left-1.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground uppercase"
                data-testid="goodreads-new-badge"
                >{{ gt('newBadge') }}</span
              >
              <span
                v-if="row.bookIds.length > 0"
                class="absolute right-1.5 bottom-1.5 flex items-center gap-1 rounded-full bg-background/90 px-1.5 text-[11px]"
                ><Check class="size-3 text-primary" aria-hidden="true" />{{ gt('inLibrary') }}</span
              >
              <span
                v-else-if="row.request"
                class="absolute right-1.5 bottom-1.5 rounded-full bg-background/90 px-1.5 text-[11px]"
                >{{ statusLabel(row) }}</span
              >
            </button>
            <input
              type="checkbox"
              class="absolute top-1.5 right-1.5 size-4 cursor-pointer rounded-xs border-border accent-primary opacity-0 group-hover:opacity-100 checked:opacity-100 focus-visible:opacity-100"
              :checked="selectedKeys.has(row.key)"
              :aria-label="gt('selectBook', { title: row.title })"
              data-testid="goodreads-row-select"
              @change="handleToggleRow(row.key)"
            />
            <p class="line-clamp-2 text-sm leading-tight font-medium text-foreground">{{ row.title }}</p>
            <p class="truncate text-xs text-muted-foreground">{{ row.authors.join(', ') }}</p>
            <span v-if="row.rating" class="flex items-center gap-0.5" :aria-label="gt('rating', { rating: row.rating })">
              <Star v-for="n in row.rating" :key="n" class="size-3 fill-current text-primary" aria-hidden="true" />
            </span>
          </li>
        </ul>

        <ul v-else class="divide-y divide-border">
          <li v-for="row in rows" :key="row.key" class="flex items-center gap-3 p-3" data-testid="goodreads-row">
            <input
              type="checkbox"
              class="size-4 shrink-0 cursor-pointer rounded-xs border-border accent-primary"
              :checked="selectedKeys.has(row.key)"
              :aria-label="gt('selectBook', { title: row.title })"
              data-testid="goodreads-row-select"
              @change="handleToggleRow(row.key)"
            />
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-3 rounded-md text-start hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
              :aria-label="gt('openBook', { title: row.title })"
              data-testid="goodreads-open"
              @click="handleOpen(row)"
            >
            <div class="h-16 w-11 shrink-0 overflow-hidden rounded-sm border border-border">
              <BookCoverImage v-if="row.bookIds.length > 0" :book-id="ownedBookId(row)" type="thumbnail" :alt="row.title" class="size-full object-cover" />
              <BookCoverArtwork
                v-else
                :src="row.coverUrl"
                :has-cover="row.coverUrl !== null"
                :title="row.title"
                :authors="row.authors"
                :seed="row.key"
                frame-aspect-ratio="2/3"
              />
            </div>

            <div class="min-w-0 flex-1">
              <p class="flex items-center gap-2 truncate text-sm font-medium text-foreground">
                <span class="truncate">{{ row.title }}</span>
                <span
                  v-if="row.isNew"
                  class="shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground uppercase"
                  data-testid="goodreads-new-badge"
                  >{{ gt('newBadge') }}</span
                >
              </p>
              <p class="truncate text-xs text-muted-foreground">{{ row.authors.join(', ') }}</p>
              <div class="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span v-if="row.rating" class="flex items-center gap-0.5" :aria-label="gt('rating', { rating: row.rating })">
                  <Star v-for="n in row.rating" :key="n" class="size-3 fill-current text-primary" aria-hidden="true" />
                </span>
                <span v-if="readDate(row)">{{ readDate(row) }}</span>
                <span data-testid="goodreads-first-seen">{{ firstSeen(row) }}</span>
              </div>
            </div>
            </button>

            <RouterLink
              v-if="row.bookIds.length > 0"
              :to="{ name: 'book-detail', params: { bookId: row.bookIds[0] } }"
              class="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-foreground hover:bg-accent"
              data-testid="goodreads-in-library"
            >
              <Check class="size-3.5 text-primary" aria-hidden="true" />{{ gt('inLibrary') }}
            </RouterLink>
            <RouterLink
              v-else-if="row.request"
              :to="{ name: 'book-request-detail', params: { id: row.request.id } }"
              class="flex h-8 shrink-0 items-center rounded-md border border-border px-3 text-sm text-foreground hover:bg-accent"
              data-testid="goodreads-request-state"
            >
              {{ statusLabel(row) }}
            </RouterLink>
            <Button
              v-else-if="canRequest"
              size="sm"
              :disabled="requestingKey !== null || bulkBusy"
              data-testid="goodreads-request"
              @click="handleRequest(row)"
            >
              <BookPlus class="size-3.5" aria-hidden="true" />{{ gt('request') }}
            </Button>
          </li>
        </ul>

        <div v-if="rows.length < total" class="border-t border-border p-3 text-center">
          <Button variant="ghost" size="sm" :disabled="loading" @click="handleMore">{{ gt('more') }}</Button>
        </div>
      </section>
    </template>

    <GoodreadsBookSheet :row="sheetRow" :can-request="canRequest" :busy="requestingKey !== null" @close="sheetRow = null" @request="handleSheetRequest" />
    <ConfirmDialog
      :open="cancelConfirmOpen"
      :title="gt('cancelTitle', { count: bulkCancelIds.length })"
      :description="gt('cancelDescription')"
      :confirm-label="gt('bulkCancel')"
      :busy="bulkBusy"
      @confirm="handleBulkCancel"
      @cancel="cancelConfirmOpen = false"
    />
    <ConfirmDialog
      :open="removeTarget !== null"
      :title="gt('removeTitle', { name: removeTarget ? sourceLabel(removeTarget) : '' })"
      :description="gt('removeDescription')"
      :confirm-label="gt('removeSource')"
      @confirm="handleRemove"
      @cancel="removeTarget = null"
    />
  </div>
</template>
