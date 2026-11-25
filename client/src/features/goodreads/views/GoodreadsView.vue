<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { refDebounced } from '@vueuse/core'
import { toast } from 'vue-sonner'
import { BookMarked, BookPlus, Check, RefreshCw, Search, Star } from '@lucide/vue'
import type { GoodreadsShelfRow } from '@bookorbit/types'
import PageTitleRow from '@/components/page-header/PageTitleRow.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePermissions } from '@/features/auth/composables/usePermissions'
import { useRequestLanguageDefault } from '@/features/book-requests/composables/useRequestDestinationDefault'
import { formatDate, formatRelativeTimeFromNow } from '@/i18n/formatters'
import { errorMessage } from '@/lib/api-json'
import { requestGoodreadsBook, requestGoodreadsSync } from '../api/goodreads.api'
import { useGoodreadsShelves } from '../composables/useGoodreadsShelves'
import { GOODREADS_MESSAGE_ROOT, goodreadsShelfLabelKey, installGoodreadsMessages } from '../i18n'

installGoodreadsMessages()

const { t } = useI18n()

function gt(key: string, params: Record<string, unknown> = {}): string {
  return t(`${GOODREADS_MESSAGE_ROOT}.${key}`, params)
}
const { hasPermission } = usePermissions()
const language = useRequestLanguageDefault()

const shelf = ref<string | null>(null)
const searchText = ref('')
const search = refDebounced(searchText, 250)
const syncing = ref(false)
const requestingKey = ref<string | null>(null)

const { overview, rows, total, loading, error, loadOverview, loadRows, patchRow } = useGoodreadsShelves(shelf, search)

const canRequest = computed(() => hasPermission('book_request_access'))
const shelves = computed(() => overview.value?.shelves ?? [])
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
const emptyText = computed(() => (search.value.trim() ? gt('emptySearch') : gt('empty')))

function shelfLabel(name: string): string {
  const key = goodreadsShelfLabelKey(name)
  return key ? t(key) : name
}

function readDate(row: GoodreadsShelfRow): string | null {
  return row.readAt ? gt('readOn', { date: formatDate(new Date(row.readAt), { dateStyle: 'medium' }) }) : null
}

function statusLabel(row: GoodreadsShelfRow): string {
  return row.request ? t(`bookRequests.status.${row.request.status}`) : ''
}

watch(shelves, (list) => {
  if (!shelf.value || !list.some((entry) => entry.name === shelf.value)) shelf.value = list[0]?.name ?? null
})

onMounted(async () => {
  void language.load()
  await loadOverview()
  if (shelf.value) await loadRows(false)
})

function handleSelectShelf(name: string) {
  shelf.value = name
}

function handleMore() {
  void loadRows(true)
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
    <p v-else-if="overview && overview.total === 0" class="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
      {{ gt('noSnapshot') }}
    </p>

    <template v-else-if="overview">
      <nav class="flex flex-wrap gap-2" role="tablist" :aria-label="gt('title')">
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
        </button>
      </nav>

      <section class="rounded-xl border border-border bg-card" :aria-busy="loading">
        <div class="flex items-center gap-3 border-b border-border p-3">
          <div class="relative w-full max-w-sm">
            <Search class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input v-model="searchText" class="pl-8" :placeholder="gt('search')" :aria-label="gt('search')" />
          </div>
          <span class="ml-auto shrink-0 text-xs text-muted-foreground">{{ gt('books', { count: total }) }}</span>
        </div>

        <p v-if="!loading && rows.length === 0" class="p-6 text-sm text-muted-foreground">{{ emptyText }}</p>

        <ul v-else class="divide-y divide-border">
          <li v-for="row in rows" :key="row.key" class="flex items-center gap-3 p-3" data-testid="goodreads-row">
            <img
              v-if="row.coverUrl"
              :src="row.coverUrl"
              :alt="row.title"
              loading="lazy"
              class="h-16 w-11 shrink-0 rounded-sm border border-border object-cover"
              referrerpolicy="no-referrer"
            />
            <div v-else class="flex h-16 w-11 shrink-0 items-center justify-center rounded-sm border border-border bg-muted">
              <BookMarked class="size-4 text-muted-foreground" aria-hidden="true" />
            </div>

            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-foreground">{{ row.title }}</p>
              <p class="truncate text-xs text-muted-foreground">{{ row.authors.join(', ') }}</p>
              <div class="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span v-if="row.rating" class="flex items-center gap-0.5" :aria-label="gt('rating', { rating: row.rating })">
                  <Star v-for="n in row.rating" :key="n" class="size-3 fill-current text-primary" aria-hidden="true" />
                </span>
                <span v-if="readDate(row)">{{ readDate(row) }}</span>
              </div>
            </div>

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
              :disabled="requestingKey !== null"
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
  </div>
</template>
