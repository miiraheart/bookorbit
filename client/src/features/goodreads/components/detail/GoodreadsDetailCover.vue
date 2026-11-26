<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { BookPlus, ExternalLink, Headphones, Library, Loader2 } from '@lucide/vue'
import type { BookCard, BookRequestMediaKind, GoodreadsShelfRow } from '@bookorbit/types'
import BookCoverArtwork from '@/features/book/components/BookCoverArtwork.vue'
import BookCoverSurface from '@/features/book/components/BookCoverSurface.vue'
import { GOODREADS_MESSAGE_ROOT, goodreadsRequestKeys } from '../../i18n'

/**
 * The cover column of a Goodreads book page. The `read-along-pair` slot sits above the single
 * requests and receives the row and a reload callback, for the action that requests both halves.
 */
const props = defineProps<{
  row: GoodreadsShelfRow
  coverSrc: string | null
  requestableKinds: BookRequestMediaKind[]
  requesting: BookRequestMediaKind | null
  libraryCopy: BookCard | null
}>()

const emit = defineEmits<{ request: [kind: BookRequestMediaKind]; reload: [] }>()

defineSlots<{ 'read-along-pair'?: (props: { row: GoodreadsShelfRow; reload: () => void }) => unknown }>()

const { t } = useI18n()
function gt(key: string, params: Record<string, unknown> = {}): string {
  return t(`${GOODREADS_MESSAGE_ROOT}.${key}`, params)
}

const goodreadsUrl = computed(() => (props.row.goodreadsId ? `https://www.goodreads.com/book/show/${props.row.goodreadsId}` : null))

function handleRequest(kind: BookRequestMediaKind) {
  emit('request', kind)
}

function handleReload() {
  emit('reload')
}
</script>

<template>
  <div
    data-testid="goodreads-detail-cover"
    class="flex min-w-0 flex-col gap-4 @min-[46rem]/book-detail:col-start-1 @min-[46rem]/book-detail:row-start-1 @min-[46rem]/book-detail:self-start"
  >
    <div class="w-28 shrink-0 sm:w-36 @min-[46rem]/book-detail:w-full">
      <BookCoverSurface
        class="book-cover-surface--spine-fitted relative w-full overflow-hidden rounded-lg shadow-lg shadow-black/40"
        :style="{ aspectRatio: '2/3' }"
      >
        <BookCoverArtwork
          :src="coverSrc"
          :has-cover="coverSrc !== null"
          :title="row.title"
          :author-line="row.authors.join(', ') || null"
          :seed="row.key"
          :alt="row.title"
          frame-aspect-ratio="2/3"
          loading="eager"
          backdrop-class="blur-lg brightness-50"
          :spine="true"
          :authors="row.authors"
        />
      </BookCoverSurface>
    </div>

    <div class="flex flex-col gap-2">
      <slot name="read-along-pair" :row="row" :reload="handleReload" />
      <button
        v-for="kind in requestableKinds"
        :key="kind"
        type="button"
        class="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="requesting !== null"
        :data-testid="`goodreads-detail-request-${kind}`"
        @click="handleRequest(kind)"
      >
        <Loader2 v-if="requesting === kind" class="size-4 animate-spin" aria-hidden="true" />
        <component :is="kind === 'ebook' ? BookPlus : Headphones" v-else class="size-4" aria-hidden="true" />
        {{ gt(goodreadsRequestKeys(kind).request) }}
      </button>
      <RouterLink
        v-if="libraryCopy"
        :to="{ name: 'book-detail', params: { bookId: libraryCopy.id }, query: { tab: 'details' } }"
        class="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
        data-testid="goodreads-detail-library"
      >
        <Library class="size-4" aria-hidden="true" />{{ gt('openDetails') }}
      </RouterLink>
      <a
        v-if="goodreadsUrl"
        :href="goodreadsUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        data-testid="goodreads-detail-goodreads"
      >
        <ExternalLink class="size-4" aria-hidden="true" />{{ gt('detail.openGoodreads') }}
      </a>
    </div>
  </div>
</template>
