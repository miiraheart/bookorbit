<script setup lang="ts">
import { provide, ref, toRef } from 'vue'
import { BookMarked, RefreshCw } from '@lucide/vue'
import PageTitleRow from '@/components/page-header/PageTitleRow.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { Button } from '@/components/ui/button'
import { COVER_ASPECT_RATIO_KEY } from '@/features/book/lib/cover-aspect-ratio'
import type { CoverAspectRatio } from '@bookorbit/types'
import GoodreadsBookDialogs from '../components/GoodreadsBookDialogs.vue'
import GoodreadsBookSheet from '../components/GoodreadsBookSheet.vue'
import GoodreadsGrid from '../components/GoodreadsGrid.vue'
import GoodreadsList from '../components/GoodreadsList.vue'
import GoodreadsToolbar from '../components/GoodreadsToolbar.vue'
import { useGoodreadsLibrary } from '../composables/useGoodreadsLibrary'
import { useGoodreadsPage } from '../composables/useGoodreadsPage'
import { installGoodreadsMessages } from '../i18n'

installGoodreadsMessages()

const page = useGoodreadsPage()
const gt = page.gt
const library = useGoodreadsLibrary({
  books: toRef(page, 'books'),
  rows: toRef(page, 'rows'),
  cardsById: toRef(page, 'cardsById'),
  selectedKeys: toRef(page, 'selectedKeys'),
  reload: () => void page.loadRows(false),
})
provide(COVER_ASPECT_RATIO_KEY, ref<CoverAspectRatio>('2/3'))

function handleCancelConfirmClose() {
  page.setCancelConfirmOpen(false)
}
</script>

<template>
  <div class="flex w-full flex-col gap-4 pt-2 pb-4">
    <PageTitleRow class="shrink-0" :eyebrow="gt('eyebrow')" :title="gt('title')" :icon="BookMarked">
      <template #actions>
        <div class="flex shrink-0 items-center gap-3">
          <span class="text-xs text-muted-foreground" :class="{ 'max-sm:hidden': !page.syncPending }" data-testid="goodreads-sync-label">{{
            page.syncPending ?? page.syncLabel
          }}</span>
          <Button variant="outline" size="sm" :disabled="page.syncing || !!page.syncPending" data-testid="goodreads-sync" @click="page.handleSync">
            <RefreshCw class="size-3.5" :class="{ 'animate-spin': page.syncing || page.syncPending }" aria-hidden="true" />
            <span class="max-sm:hidden">{{ gt('syncNow') }}</span>
          </Button>
        </div>
      </template>
    </PageTitleRow>

    <p v-if="page.error && !page.overview" class="rounded-xl border border-border bg-card p-6 text-sm text-destructive">{{ gt('loadFailed') }}</p>

    <GoodreadsToolbar v-else-if="page.overview" :page="page">
      <p v-if="!page.loading && page.rows.length === 0" class="p-6 text-sm text-muted-foreground">{{ page.emptyText }}</p>
      <GoodreadsGrid v-else-if="page.viewMode === 'grid'" :page="page" :library="library" />
      <GoodreadsList v-else :page="page" :library="library" />

      <div v-if="page.rows.length < page.total" class="border-t border-border p-3 text-center">
        <Button variant="ghost" size="sm" :disabled="page.loading" @click="page.handleMore">{{ gt('more') }}</Button>
      </div>
    </GoodreadsToolbar>

    <GoodreadsBookSheet
      :row="page.sheetRow"
      :can-request="page.canRequest"
      :owned="page.sheetRow !== null && library.shownCard(page.sheetRow) !== null"
      :busy="page.requestingKey !== null"
      @close="page.closeSheet"
      @request="page.handleSheetRequest"
    />
    <ConfirmDialog
      :open="page.cancelConfirmOpen"
      :title="gt('cancelTitle', { count: page.bulkCancelIds.length })"
      :description="gt('cancelDescription')"
      :confirm-label="gt('bulkCancel')"
      :busy="page.bulkBusy"
      @confirm="page.handleBulkCancel"
      @cancel="handleCancelConfirmClose"
    />
    <GoodreadsBookDialogs :library="library" />
  </div>
</template>
