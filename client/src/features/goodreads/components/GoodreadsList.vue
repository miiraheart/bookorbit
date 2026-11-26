<script setup lang="ts">
import { computed } from 'vue'
import type { BookRequestMediaKind, GoodreadsShelfRow } from '@bookorbit/types'
import GoodreadsOwnedItem from './GoodreadsOwnedItem.vue'
import GoodreadsRemoteRow from './GoodreadsRemoteRow.vue'
import type { GoodreadsLibrary } from '../composables/useGoodreadsLibrary'
import type { GoodreadsPage } from '../composables/useGoodreadsPage'

/** The shelf as rows: owned copies as library list rows, the rest with their Goodreads details. */
const props = defineProps<{ page: GoodreadsPage; library: GoodreadsLibrary }>()

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
  <ul class="divide-y divide-border">
    <li v-for="row in page.rows" :key="row.key" class="flex items-center gap-3 p-3" data-testid="goodreads-row">
      <GoodreadsOwnedItem
        v-if="library.shownCard(row)"
        class="flex-1"
        variant="list"
        :row="row"
        :cards="library.cardsOf(row)"
        :shown-id="library.shownCard(row)?.id ?? null"
        :selection-mode="selectionMode"
        :selected="page.selectedKeys.has(row.key)"
        @update:shown-id="handleShown(row, $event)"
        @action="library.handleBookAction"
        @select="page.handleToggleRow(row.key)"
        @toggle="page.handleToggleRow(row.key)"
      />
      <GoodreadsRemoteRow
        v-else
        :row="row"
        :can-request="page.canRequest"
        :busy="requestBusy"
        :unavailable="page.isUnavailable(row)"
        :selection-mode="selectionMode"
        :selected="page.selectedKeys.has(row.key)"
        :read-date="page.readDate(row)"
        :first-seen="page.firstSeen(row)"
        @open="page.handleOpen(row)"
        @request="handleRequest(row, $event)"
        @toggle="page.handleToggleRow(row.key)"
      />
    </li>
  </ul>
</template>
