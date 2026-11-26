<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BookCard, GoodreadsShelfRow } from '@bookorbit/types'
import BookCoverArtwork from '@/features/book/components/BookCoverArtwork.vue'
import BookCoverSurface from '@/features/book/components/BookCoverSurface.vue'
import { GOODREADS_MESSAGE_ROOT } from '../../i18n'
import { goodreadsRowLocation, seriesRows, titleWithoutSeries } from '../../lib/related'

type RelatedTab = 'series' | 'author'

/** The bottom rows of a Goodreads book page: the rest of its series and its author's other books on the same source. */
const props = defineProps<{
  related: GoodreadsShelfRow[]
  cardsById: ReadonlyMap<number, BookCard>
  seriesName: string | null
  author: string | null
}>()

const { t } = useI18n()
function gt(key: string, params: Record<string, unknown> = {}): string {
  return t(`${GOODREADS_MESSAGE_ROOT}.${key}`, params)
}

const inSeries = computed(() => seriesRows(props.related, props.seriesName))
const tabs = computed(() => {
  const list: { id: RelatedTab; label: string; rows: GoodreadsShelfRow[] }[] = []
  if (inSeries.value.length) list.push({ id: 'series', label: gt('detail.moreInSeries', { series: props.seriesName ?? '' }), rows: inSeries.value })
  if (props.related.length) list.push({ id: 'author', label: gt('detail.byAuthor', { author: props.author ?? '' }), rows: props.related })
  return list
})
const active = ref<RelatedTab>('series')
const current = computed(() => tabs.value.find((tab) => tab.id === active.value) ?? tabs.value[0] ?? null)

watch(
  () => props.related,
  () => {
    active.value = 'series'
  },
)

function select(id: RelatedTab) {
  active.value = id
}
</script>

<template>
  <section v-if="current" class="mt-8 border-t border-border pt-6" data-testid="goodreads-detail-related">
    <div class="mb-3 flex flex-wrap items-center gap-4">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="text-[11px] font-semibold uppercase tracking-widest transition-colors"
        :class="tab.id === current.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'"
        :aria-pressed="tab.id === current.id"
        :data-testid="`goodreads-related-tab-${tab.id}`"
        @click="select(tab.id)"
      >
        {{ tab.label }}
      </button>
    </div>
    <ul class="flex gap-3 overflow-x-auto pb-2">
      <li v-for="entry in current.rows" :key="entry.key" class="w-28 shrink-0">
        <RouterLink :to="goodreadsRowLocation(entry, cardsById)" class="group flex flex-col gap-1.5" data-testid="goodreads-related-item">
          <BookCoverSurface
            class="book-cover-surface--spine-fitted relative w-full overflow-hidden rounded-sm"
            :interactive="true"
            :style="{ aspectRatio: '2/3' }"
          >
            <BookCoverArtwork
              :src="entry.coverUrl"
              :has-cover="entry.coverUrl !== null"
              :title="entry.title"
              :author-line="entry.authors.join(', ') || null"
              :seed="entry.key"
              :alt="entry.title"
              frame-aspect-ratio="2/3"
              :spine="true"
              :authors="entry.authors"
            />
            <span
              v-if="entry.bookIds.length > 0"
              class="absolute top-1.5 right-1.5 z-10 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white"
              >{{ gt('inLibrary') }}</span
            >
          </BookCoverSurface>
          <span class="line-clamp-2 text-xs font-medium leading-tight text-foreground group-hover:text-primary">{{
            titleWithoutSeries(entry.title)
          }}</span>
        </RouterLink>
      </li>
    </ul>
  </section>
</template>
