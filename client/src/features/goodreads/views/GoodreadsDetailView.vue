<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { ArrowLeft, Loader2 } from '@lucide/vue'
import GoodreadsDetailCover from '../components/detail/GoodreadsDetailCover.vue'
import GoodreadsDetailMain from '../components/detail/GoodreadsDetailMain.vue'
import GoodreadsDetailRail from '../components/detail/GoodreadsDetailRail.vue'
import GoodreadsRelatedRows from '../components/detail/GoodreadsRelatedRows.vue'
import { useGoodreadsBookLookup } from '../composables/useGoodreadsBookLookup'
import { useGoodreadsItem } from '../composables/useGoodreadsItem'
import { GOODREADS_MESSAGE_ROOT, installGoodreadsMessages } from '../i18n'
import { titleSeries } from '../lib/related'

installGoodreadsMessages()

/** A Goodreads book's own page, in the library's Details layout, read by source and key so it survives a reload. */
const route = useRoute()
const { t } = useI18n()
function gt(key: string, params: Record<string, unknown> = {}): string {
  return t(`${GOODREADS_MESSAGE_ROOT}.${key}`, params)
}

const item = useGoodreadsItem(
  () => String(route.params.source ?? ''),
  () => String(route.params.key ?? ''),
)
const { row, related, cardsById, cards, libraryCopy, owned, requestableKinds, loading, missing, requesting } = item
const lookup = useGoodreadsBookLookup(() => row.value)
const { candidate, busy, coverSrc } = lookup

const series = computed(() => {
  if (!row.value) return null
  const fromTitle = titleSeries(row.value.title)
  const name = fromTitle?.name ?? candidate.value?.seriesName ?? null
  if (!name) return null
  const index = fromTitle ? fromTitle.index : candidate.value?.seriesIndex
  return { name, label: index != null ? `${name} #${index}` : name }
})

function handleReload() {
  void item.load()
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden rounded-lg border border-border/70 bg-card/60 shadow-sm" data-testid="goodreads-detail">
    <header class="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
      <RouterLink
        :to="{ name: 'goodreads' }"
        class="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        data-testid="goodreads-detail-back"
      >
        <ArrowLeft class="size-4" aria-hidden="true" />{{ gt('title') }}
      </RouterLink>
    </header>

    <main class="flex-1 overflow-x-hidden overflow-y-auto p-4 sm:px-6 sm:py-4">
      <p v-if="loading && !row" class="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 class="size-4 animate-spin" aria-hidden="true" />{{ gt('detail.loading') }}
      </p>
      <p v-else-if="missing" class="text-sm text-muted-foreground" data-testid="goodreads-detail-missing">{{ gt('detail.notFound') }}</p>
      <div v-else-if="row" class="@container/book-detail">
        <div
          class="flex flex-col gap-5 @min-[46rem]/book-detail:grid @min-[46rem]/book-detail:content-start @min-[46rem]/book-detail:grid-cols-[clamp(12rem,23cqi,17rem)_minmax(16rem,1fr)_clamp(15rem,26cqi,19.25rem)] @min-[46rem]/book-detail:gap-x-6 @min-[46rem]/book-detail:gap-y-5"
        >
          <GoodreadsDetailCover
            :row="row"
            :cover-src="coverSrc"
            :requestable-kinds="requestableKinds"
            :requesting="requesting"
            :library-copy="libraryCopy"
            @request="item.request"
            @reload="handleReload"
          />
          <GoodreadsDetailMain :row="row" :candidate="candidate" :looking-up="busy" :cards="cards" :series-label="series?.label ?? null" />
          <GoodreadsDetailRail :row="row" :candidate="candidate" :owned="owned" />
        </div>
        <GoodreadsRelatedRows :related="related" :cards-by-id="cardsById" :series-name="series?.name ?? null" :author="row.authors[0] ?? null" />
      </div>
    </main>
  </div>
</template>
