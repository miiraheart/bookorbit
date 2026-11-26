<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Loader2, Star } from '@lucide/vue'
import type { BookCard, GoodreadsShelfRow, MetadataCandidate } from '@bookorbit/types'
import BookFormatChip from '@/features/book/components/BookFormatChip.vue'
import BookTaxonomyPill from '@/features/book/components/detail/details/BookTaxonomyPill.vue'
import { useSafeHtml } from '@/features/book/composables/useSafeHtml'
import { bookFormatEntries } from '@/features/book/lib/book-formats'
import { formatDate } from '@/i18n/formatters'
import { GOODREADS_MESSAGE_ROOT, goodreadsShelfLabel } from '../../i18n'
import { titleWithoutSeries } from '../../lib/related'

/** The centre column of a Goodreads book page, laid out like the library's Details tab. */
const props = defineProps<{
  row: GoodreadsShelfRow
  candidate: MetadataCandidate | null
  lookingUp: boolean
  cards: BookCard[]
  seriesLabel: string | null
}>()

const { t } = useI18n()
function gt(key: string, params: Record<string, unknown> = {}): string {
  return t(`${GOODREADS_MESSAGE_ROOT}.${key}`, params)
}

const expanded = ref(false)
const title = computed(() => props.candidate?.title ?? titleWithoutSeries(props.row.title))
const authors = computed(() => (props.candidate?.authors?.length ? props.candidate.authors : props.row.authors).join(', '))
const safeDescription = useSafeHtml(() => props.candidate?.description)
const genres = computed(() => props.candidate?.genres?.slice(0, 10) ?? [])
const formats = computed(() => bookFormatEntries(props.cards.flatMap((card) => card.files)))
const readOn = computed(() => (props.row.readAt ? gt('readOn', { date: formatDate(new Date(props.row.readAt), { dateStyle: 'medium' }) }) : null))

function toggleDescription() {
  expanded.value = !expanded.value
}
</script>

<template>
  <div
    class="flex min-w-0 flex-col gap-2.5 @min-[46rem]/book-detail:col-start-2 @min-[46rem]/book-detail:row-start-1 @min-[46rem]/book-detail:self-start"
  >
    <div>
      <h1 class="text-xl font-bold leading-tight @min-[46rem]/book-detail:text-2xl" data-testid="goodreads-detail-title">{{ title }}</h1>
      <p v-if="candidate?.subtitle" class="mt-1 text-base leading-snug text-muted-foreground">{{ candidate.subtitle }}</p>
      <div class="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p v-if="authors" class="text-sm">
          <span class="text-muted-foreground">{{ gt('detail.by') }}</span>
          <span class="ml-1 font-medium text-foreground">{{ authors }}</span>
        </p>
        <template v-if="seriesLabel">
          <span class="text-xs text-muted-foreground">·</span>
          <span class="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium" data-testid="goodreads-detail-series">{{ seriesLabel }}</span>
        </template>
      </div>
      <div class="mt-2.5 flex flex-wrap items-center gap-2">
        <span v-if="row.rating" class="flex items-center gap-0.5" :aria-label="gt('rating', { rating: row.rating })">
          <Star v-for="n in 5" :key="n" class="size-3.5" :class="n <= (row.rating ?? 0) ? 'fill-current text-primary' : 'text-muted-foreground/40'" />
        </span>
        <span v-for="shelf in row.shelves" :key="shelf" class="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium">{{
          goodreadsShelfLabel(shelf, t)
        }}</span>
        <BookFormatChip
          v-for="entry in formats"
          :key="entry.key"
          :format-key="entry.key"
          :primary="entry.primary"
          class="rounded-xs px-2 py-0.5 text-[10px] tracking-wider"
        />
      </div>
    </div>

    <div v-if="genres.length" class="flex flex-wrap gap-1.5" data-testid="goodreads-detail-genres">
      <BookTaxonomyPill v-for="genre in genres" :key="genre" kind="genre" :name="genre" />
    </div>

    <p v-if="lookingUp" class="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 class="size-4 animate-spin" aria-hidden="true" />{{ gt('detail.searching') }}
    </p>

    <section class="rounded-xl border border-border bg-card px-4 py-3.5" data-testid="goodreads-detail-synopsis">
      <div class="flex items-baseline gap-3">
        <p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ gt('detail.synopsis') }}</p>
        <button
          v-if="safeDescription"
          type="button"
          class="ml-auto shrink-0 text-[11px] font-semibold text-primary transition-colors hover:underline"
          :aria-expanded="expanded"
          @click="toggleDescription"
        >
          {{ expanded ? gt('detail.showLess') : gt('detail.showMore') }}
        </button>
      </div>
      <div
        v-if="safeDescription"
        class="description-content mt-2 text-sm leading-relaxed text-foreground"
        :class="{ 'synopsis-copy--clamped': !expanded }"
        v-html="safeDescription"
      />
      <p v-else-if="!lookingUp" class="mt-2 text-sm italic text-muted-foreground">{{ gt('detail.noMetadata') }}</p>
    </section>

    <section class="rounded-xl border border-border bg-card px-4 py-3.5" data-testid="goodreads-detail-reading">
      <p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ gt('detail.yourReading') }}</p>
      <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span v-if="readOn">{{ readOn }}</span>
        <span>{{ gt('firstSeen', { date: formatDate(new Date(row.firstSeenAt), { dateStyle: 'medium' }) }) }}</span>
        <span v-if="!row.rating" class="text-muted-foreground">{{ gt('detail.unrated') }}</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.synopsis-copy--clamped {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 6;
}
</style>
