<script setup lang="ts">
import { computed } from 'vue'
import { Check, Star } from '@lucide/vue'
import type { GoodreadsShelfRow } from '@bookorbit/types'
import { useDisplaySettings } from '@/composables/useDisplaySettings'
import BookCoverArtwork from '@/features/book/components/BookCoverArtwork.vue'
import BookCoverImage from '@/features/book/components/BookCoverImage.vue'
import GoodreadsOwnedItem from './GoodreadsOwnedItem.vue'
import type { GoodreadsLibrary } from '../composables/useGoodreadsLibrary'
import type { GoodreadsPage } from '../composables/useGoodreadsPage'

/** The shelf as cover cards, sized by the same cover size and gap settings as a library grid. */
const props = defineProps<{ page: GoodreadsPage; library: GoodreadsLibrary }>()

const gt = props.page.gt
const { portraitCoverSize, portraitGridGap, cardInfoMode } = useDisplaySettings()
const gridStyle = computed(() => ({
  gap: `${portraitGridGap.value}px`,
  gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${portraitCoverSize.value}px), 1fr))`,
}))
const showLabel = computed(() => cardInfoMode.value === 'below-cover')
const selectionMode = computed(() => props.page.selectedKeys.size > 0)

function handleShown(row: GoodreadsShelfRow, bookId: number) {
  props.library.setShown(row.key, bookId)
}
</script>

<template>
  <ul class="grid w-full items-start p-3" :style="gridStyle" data-testid="goodreads-grid">
    <li
      v-for="row in page.rows"
      :key="row.key"
      class="relative flex min-w-0 flex-col gap-1.5"
      :class="{ group: !library.shownCard(row) }"
      data-testid="goodreads-card"
    >
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
      />
      <template v-else>
        <button
          type="button"
          class="relative aspect-[2/3] w-full overflow-hidden rounded-md border border-border transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
          :aria-label="gt('openBook', { title: row.title })"
          data-testid="goodreads-open"
          @click="page.handleOpen(row)"
        >
          <BookCoverImage
            v-if="row.bookIds.length > 0 && !page.isUnavailable(row)"
            :book-id="page.ownedBookId(row)"
            type="thumbnail"
            :alt="row.title"
            class="size-full object-cover"
          />
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
            v-if="page.isUnavailable(row)"
            class="absolute right-1.5 bottom-1.5 rounded-full bg-background/90 px-1.5 text-[11px]"
            data-testid="goodreads-unavailable"
            >{{ gt('unavailableCopy') }}</span
          >
          <span
            v-else-if="row.bookIds.length > 0"
            class="absolute right-1.5 bottom-1.5 flex items-center gap-1 rounded-full bg-background/90 px-1.5 text-[11px]"
            ><Check class="size-3 text-primary" aria-hidden="true" />{{ gt('inLibrary') }}</span
          >
          <span v-else-if="row.request" class="absolute right-1.5 bottom-1.5 rounded-full bg-background/90 px-1.5 text-[11px]">{{
            page.statusLabel(row)
          }}</span>
        </button>
        <input
          type="checkbox"
          class="absolute top-1.5 right-1.5 size-4 cursor-pointer rounded-xs border-border accent-primary opacity-0 group-hover:opacity-100 checked:opacity-100 focus-visible:opacity-100"
          :checked="page.selectedKeys.has(row.key)"
          :aria-label="gt('selectBook', { title: row.title })"
          data-testid="goodreads-row-select"
          @change="page.handleToggleRow(row.key)"
        />
        <p class="line-clamp-2 text-sm leading-tight font-medium text-foreground">{{ row.title }}</p>
        <p class="truncate text-xs text-muted-foreground">{{ row.authors.join(', ') }}</p>
        <span v-if="row.rating" class="flex items-center gap-0.5" :aria-label="gt('rating', { rating: row.rating })">
          <Star v-for="n in row.rating" :key="n" class="size-3 fill-current text-primary" aria-hidden="true" />
        </span>
      </template>
    </li>
  </ul>
</template>
