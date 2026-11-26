<script setup lang="ts">
import { computed } from 'vue'
import { BookPlus, Check, Star } from '@lucide/vue'
import type { GoodreadsShelfRow } from '@bookorbit/types'
import { Button } from '@/components/ui/button'
import BookCoverArtwork from '@/features/book/components/BookCoverArtwork.vue'
import BookCoverImage from '@/features/book/components/BookCoverImage.vue'
import GoodreadsOwnedItem from './GoodreadsOwnedItem.vue'
import type { GoodreadsLibrary } from '../composables/useGoodreadsLibrary'
import type { GoodreadsPage } from '../composables/useGoodreadsPage'

/** The shelf as rows: owned copies as library list rows, the rest with their Goodreads details. */
const props = defineProps<{ page: GoodreadsPage; library: GoodreadsLibrary }>()

const gt = props.page.gt
const selectionMode = computed(() => props.page.selectedKeys.size > 0)

function handleShown(row: GoodreadsShelfRow, bookId: number) {
  props.library.setShown(row.key, bookId)
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
      <template v-else>
        <input
          type="checkbox"
          class="size-4 shrink-0 cursor-pointer rounded-xs border-border accent-primary"
          :checked="page.selectedKeys.has(row.key)"
          :aria-label="gt('selectBook', { title: row.title })"
          data-testid="goodreads-row-select"
          @change="page.handleToggleRow(row.key)"
        />
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-3 rounded-md text-start hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
          :aria-label="gt('openBook', { title: row.title })"
          data-testid="goodreads-open"
          @click="page.handleOpen(row)"
        >
          <div class="relative h-16 w-11 shrink-0 overflow-hidden rounded-sm border border-border">
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
              <span v-if="page.readDate(row)">{{ page.readDate(row) }}</span>
              <span data-testid="goodreads-first-seen">{{ page.firstSeen(row) }}</span>
            </div>
          </div>
        </button>

        <span
          v-if="page.isUnavailable(row)"
          class="flex h-8 shrink-0 items-center rounded-md border border-border px-3 text-sm text-muted-foreground"
          data-testid="goodreads-unavailable"
          >{{ gt('unavailableCopy') }}</span
        >
        <RouterLink
          v-else-if="row.bookIds.length > 0"
          :to="{ name: 'book-detail', params: { bookId: page.ownedBookId(row) } }"
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
          {{ page.statusLabel(row) }}
        </RouterLink>
        <Button
          v-else-if="page.canRequest"
          size="sm"
          :disabled="page.requestingKey !== null || page.bulkBusy"
          data-testid="goodreads-request"
          @click="page.handleRequest(row)"
        >
          <BookPlus class="size-3.5" aria-hidden="true" />{{ gt('request') }}
        </Button>
      </template>
    </li>
  </ul>
</template>
