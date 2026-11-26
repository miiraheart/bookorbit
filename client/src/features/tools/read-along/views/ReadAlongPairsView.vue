<script setup lang="ts">
import { computed, onActivated, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useDebounceFn } from '@vueuse/core'
import { AlertCircle, CheckCheck, FolderTree, Headphones, Loader2, Search } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Permission, type ReadAlongPairStatus, type ReadAlongRow as ReadAlongRowData, type UnpairEbookResponse } from '@bookorbit/types'

import { Button } from '@/components/ui/button'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { Input } from '@/components/ui/input'
import PaginationNav from '@/components/PaginationNav.vue'
import { Select } from '@/components/ui/select'
import { usePermissions } from '@/features/auth/composables/usePermissions'
import { useLibraries } from '@/features/library/composables/useLibraries'
import { errorMessage } from '@/lib/api-json'
import { pairEbook, unpairEbook } from '@/features/read-along-pairs/api/read-along-pairs.api'
import PairEbookSheet from '@/features/read-along-pairs/components/PairEbookSheet.vue'
import ReadAlongCreateLauncher from '@/features/read-along-pairs/components/ReadAlongCreateLauncher.vue'
import UnpairReadAlongOffer from '@/features/read-along-pairs/components/UnpairReadAlongOffer.vue'
import { useReadAlongList } from '@/features/read-along-pairs/composables/useReadAlongList'
import ReadAlongRow from '../components/ReadAlongRow.vue'
import ReadAlongSummaryBand from '../components/ReadAlongSummaryBand.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { hasPermission, isDemoRestrictedAccount } = usePermissions()
const { libraries, fetchLibraries } = useLibraries()
const list = useReadAlongList()

const canUseTool = computed(() => hasPermission(Permission.LibraryGenerateReadAloud) && !isDemoRestrictedAccount.value)
const sheetBookId = ref<number | null>(null)
const sheetOpen = ref(false)
const busyBookId = ref<number | null>(null)
const createBookId = ref<number | null>(null)
const createLanguage = ref<string | null>(null)
const unpaired = ref<{ bookId: number; result: UnpairEbookResponse } | null>(null)
const exactConfirmOpen = ref(false)
const exactCount = ref(0)
const searchText = ref('')

const sheetTitle = computed(() => list.items.value.find((row) => row.audiobook.bookId === sheetBookId.value)?.audiobook.title ?? null)
const libraryValue = computed(() => (list.libraryId.value === undefined ? '' : String(list.libraryId.value)))
const showEmpty = computed(() => list.loaded.value && list.items.value.length === 0)

function openSheet(bookId: number): void {
  sheetBookId.value = bookId
  sheetOpen.value = true
}

function consumeBookQuery(): void {
  const id = Number(route.query.book)
  if (!Number.isSafeInteger(id) || id <= 0) return
  openSheet(id)
  const query = { ...route.query }
  delete query.book
  void router.replace({ query })
}

function refresh(): void {
  if (!canUseTool.value) return
  void list.fetchList()
  consumeBookQuery()
}

onMounted(() => {
  if (!canUseTool.value) return
  void fetchLibraries()
  refresh()
})

// The tools pages are kept alive, so coming back must re-read pairs changed elsewhere.
let activations = 0
onActivated(() => {
  if (activations++ > 0) refresh()
})

watch(
  () => route.query.book,
  () => {
    if (canUseTool.value && route.name === 'tools-read-along') consumeBookQuery()
  },
)

const runSearch = useDebounceFn((value: string) => list.setQuery(value), 300)

function handleSearch(value: string | number): void {
  searchText.value = String(value)
  void runSearch(searchText.value)
}

function handleLibrary(value: string | number): void {
  void list.setLibrary(value === '' ? undefined : Number(value))
}

function handleFilter(status: ReadAlongPairStatus | undefined): void {
  void list.setStatus(status)
}

function handlePage(page: number): void {
  void list.setPage(page)
}

async function handleQuickPair(row: ReadAlongRowData): Promise<void> {
  const best = row.best
  if (!best || busyBookId.value !== null) return
  busyBookId.value = row.audiobook.bookId
  try {
    await pairEbook(row.audiobook.bookId, { ebookBookId: best.ebookBookId, ebookFileId: best.ebookFileId })
    toast.success(t('tools.readAlong.toast.paired', { title: row.audiobook.title }))
    await list.fetchList()
  } catch (reason) {
    toast.error(errorMessage(reason, 'tools.readAlong.errors.pair'))
  } finally {
    busyBookId.value = null
  }
}

function handleChoose(row: ReadAlongRowData): void {
  openSheet(row.audiobook.bookId)
}

async function handleUnpair(row: ReadAlongRowData): Promise<void> {
  if (busyBookId.value !== null) return
  busyBookId.value = row.audiobook.bookId
  try {
    const result = await unpairEbook(row.audiobook.bookId)
    unpaired.value = result.readAlongs.length > 0 ? { bookId: row.audiobook.bookId, result } : null
    toast.success(t('tools.readAlong.toast.unpaired', { title: row.audiobook.title }))
    await list.fetchList()
  } catch (reason) {
    toast.error(errorMessage(reason, 'tools.readAlong.errors.unpair'))
  } finally {
    busyBookId.value = null
  }
}

function handleUnpairDone(deleted: boolean): void {
  unpaired.value = null
  if (deleted) void list.fetchList()
}

function handleCreate(row: ReadAlongRowData): void {
  if (createBookId.value !== null) return
  createLanguage.value = row.audiobook.language ?? row.pair?.language ?? null
  createBookId.value = row.audiobook.bookId
}

function handleRegenerate(bookId: number): void {
  const row = list.items.value.find((candidate) => candidate.audiobook.bookId === bookId)
  createLanguage.value = row?.audiobook.language ?? row?.pair?.language ?? null
  createBookId.value = bookId
}

function handleCreateDone(result: { created: boolean; note: string | null }): void {
  createBookId.value = null
  if (result.created) {
    toast.success(t('tools.readAlong.toast.created'))
    void list.fetchList()
  } else if (result.note) toast.info(result.note)
}

function handleSheetChanged(): void {
  void list.fetchList()
}

async function handleAskExact(): Promise<void> {
  try {
    exactCount.value = await list.countExact()
    exactConfirmOpen.value = true
  } catch (reason) {
    toast.error(errorMessage(reason, 'tools.readAlong.errors.list'))
  }
}

async function handleConfirmExact(): Promise<void> {
  const result = await list.pairAllExact()
  exactConfirmOpen.value = false
  if (result) toast.success(t('tools.readAlong.toast.acceptedExact', { count: result.paired }))
}

function handleCancelExact(): void {
  exactConfirmOpen.value = false
}
</script>

<template>
  <div v-if="!canUseTool" role="alert" class="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
    {{ t('tools.readAlong.accessDenied') }}
  </div>

  <div v-else class="flex h-full min-h-0 w-full flex-col gap-3">
    <section class="flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-2">
      <label class="relative min-w-0 flex-1 basis-56">
        <Search class="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <span class="sr-only">{{ t('tools.readAlong.search') }}</span>
        <Input
          class="h-8 ps-8 text-[12.5px]"
          :model-value="searchText"
          :placeholder="t('tools.readAlong.search')"
          @update:model-value="handleSearch"
        />
      </label>
      <label class="flex items-center gap-1.5">
        <span class="sr-only">{{ t('tools.readAlong.library') }}</span>
        <FolderTree class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <Select class="h-8 w-auto min-w-[9rem] text-[12.5px]" :model-value="libraryValue" @update:model-value="handleLibrary">
          <option value="">{{ t('tools.readAlong.allLibraries') }}</option>
          <option v-for="library in libraries" :key="library.id" :value="String(library.id)">{{ library.name }}</option>
        </Select>
      </label>
      <Button size="sm" :disabled="list.accepting.value || list.loading.value" data-testid="read-along-accept-exact" @click="handleAskExact">
        <CheckCheck aria-hidden="true" />{{ t('tools.readAlong.acceptExact.action') }}
      </Button>
    </section>

    <div
      v-if="list.error.value"
      role="alert"
      class="flex shrink-0 items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      <AlertCircle class="size-4 shrink-0" aria-hidden="true" />{{ list.error.value }}
    </div>

    <ReadAlongSummaryBand :summary="list.summary.value" :active-status="list.status.value" @filter="handleFilter" />
    <p class="shrink-0 text-[12px] text-muted-foreground">{{ t('tools.readAlong.hint') }}</p>

    <UnpairReadAlongOffer v-if="unpaired" :result="unpaired.result" @done="handleUnpairDone" />

    <div v-if="list.loading.value && !list.loaded.value" class="flex flex-1 items-center justify-center" role="status">
      <Loader2 class="size-6 animate-spin text-muted-foreground" aria-hidden="true" /><span class="sr-only">{{ t('common.loading') }}</span>
    </div>
    <section
      v-else-if="showEmpty"
      class="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 bg-card/20 p-10 text-center"
    >
      <Headphones class="size-6 text-muted-foreground" aria-hidden="true" />
      <p class="text-sm text-muted-foreground">{{ t('tools.readAlong.empty') }}</p>
    </section>
    <ul v-else class="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-card" data-testid="read-along-rows">
      <ReadAlongRow
        v-for="row in list.items.value"
        :key="row.audiobook.bookId"
        :row="row"
        :busy="busyBookId === row.audiobook.bookId"
        :creating="createBookId === row.audiobook.bookId"
        @pair="handleQuickPair"
        @choose="handleChoose"
        @unpair="handleUnpair"
        @create="handleCreate"
      />
    </ul>

    <PaginationNav
      v-if="list.totalPages.value > 1"
      class="shrink-0"
      :page="list.page.value"
      :total-pages="list.totalPages.value"
      @update:page="handlePage"
    />

    <PairEbookSheet
      v-model:open="sheetOpen"
      :book-id="sheetBookId"
      :title="sheetTitle"
      @changed="handleSheetChanged"
      @regenerate="handleRegenerate"
    />
    <ReadAlongCreateLauncher :book-id="createBookId" :default-language="createLanguage" @done="handleCreateDone" />
    <ConfirmDialog
      :open="exactConfirmOpen"
      :title="t('tools.readAlong.acceptExact.title')"
      :description="t('tools.readAlong.acceptExact.description', { count: exactCount })"
      :confirm-label="t('tools.readAlong.acceptExact.confirm', { count: exactCount })"
      :confirm-disabled="exactCount === 0"
      :busy="list.accepting.value"
      :destructive="false"
      @confirm="handleConfirmExact"
      @cancel="handleCancelExact"
    />
  </div>
</template>
