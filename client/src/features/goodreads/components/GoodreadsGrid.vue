<script setup lang="ts">
import { computed } from 'vue'
import type { BookRequestMediaKind, GoodreadsShelfRow } from '@bookorbit/types'
import { useDisplaySettings } from '@/composables/useDisplaySettings'
import GoodreadsOwnedItem from './GoodreadsOwnedItem.vue'
import GoodreadsRemoteCard from './GoodreadsRemoteCard.vue'
import type { GoodreadsLibrary } from '../composables/useGoodreadsLibrary'
import type { GoodreadsPage } from '../composables/useGoodreadsPage'

/** The shelf as cover cards, sized by the same cover size and gap settings as a library grid. */
const props = defineProps<{ page: GoodreadsPage; library: GoodreadsLibrary }>()

const { portraitCoverSize, portraitGridGap, cardInfoMode } = useDisplaySettings()
const gridStyle = computed(() => ({
  gap: `${portraitGridGap.value}px`,
  gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${portraitCoverSize.value}px), 1fr))`,
}))
const showLabel = computed(() => cardInfoMode.value === 'below-cover')
const selectionMode = computed(() => props.page.selectedKeys.size > 0)
const requestBusy = computed(() => props.page.requestingKey !== null || props.page.bulkBusy)

function handleShown(row: GoodreadsShelfRow, bookId: number) {
  props.library.setShown(row.key, bookId)
}

function handleRequest(row: GoodreadsShelfRow, kind: BookRequestMediaKind) {
  void props.page.handleRequest(row, kind)
}
</script>

<template>
  <ul class="grid w-full items-start p-3" :style="gridStyle" data-testid="goodreads-grid">
    <li v-for="row in page.rows" :key="row.key" class="relative flex min-w-0 flex-col gap-1.5" data-testid="goodreads-card">
      <GoodreadsOwnedItem
        v-if="library.shownCard(row)"
        variant="grid"
        :row="row"
        :cards="library.cardsOf(row)"
        :shown-id="library.shownCard(row)?.id ?? null"
        :show-label="showLabel"
        :selection-mode="selectionMode"
        :selected="page.selectedKeys.has(row.key)"
        @update:shown-id="handleShown(row, $event)"
        @action="library.handleBookAction"
        @update:book="library.handleTableBookUpdate"
        @select="page.handleToggleRow(row.key)"
        @toggle="page.handleToggleRow(row.key)"
        @copies="library.openOwnedSheet(row)"
      />
      <GoodreadsRemoteCard
        v-else
        :row="row"
        :can-request="page.canRequest"
        :busy="requestBusy"
        :unavailable="page.isUnavailable(row)"
        :show-label="showLabel"
        :selection-mode="selectionMode"
        :selected="page.selectedKeys.has(row.key)"
        @open="page.handleOpen(row)"
        @request="handleRequest(row, $event)"
        @toggle="page.handleToggleRow(row.key)"
      />
    </li>
  </ul>
</template>
