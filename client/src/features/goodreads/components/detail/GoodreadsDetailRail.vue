<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { BOOK_REQUEST_MEDIA_KINDS, type BookRequestMediaKind, type GoodreadsShelfRow, type MetadataCandidate } from '@bookorbit/types'
import { formatDate, formatLanguageName } from '@/i18n/formatters'
import { GOODREADS_MESSAGE_ROOT } from '../../i18n'

/** The right rail of a Goodreads book page: its details, then where each format stands. */
const props = defineProps<{
  row: GoodreadsShelfRow
  candidate: MetadataCandidate | null
  owned: { ebook: boolean; audio: boolean }
}>()

const { t } = useI18n()
function gt(key: string, params: Record<string, unknown> = {}): string {
  return t(`${GOODREADS_MESSAGE_ROOT}.${key}`, params)
}

const facts = computed(() => {
  const candidate = props.candidate
  const published = candidate?.publishedDate ?? (candidate?.publishedYear ? String(candidate.publishedYear) : null)
  return [
    { key: 'publisher', label: gt('detail.publisher'), value: candidate?.publisher ?? null },
    { key: 'published', label: gt('detail.published'), value: published },
    { key: 'language', label: gt('detail.language'), value: candidate?.language ? formatLanguageName(candidate.language) : null },
    { key: 'pages', label: gt('detail.pages'), value: candidate?.pageCount ? String(candidate.pageCount) : null },
    { key: 'isbn', label: 'ISBN', value: candidate?.isbn13 ?? props.row.isbn13 },
    { key: 'goodreads', label: gt('detail.goodreadsId'), value: props.row.goodreadsId },
    { key: 'added', label: gt('detail.added'), value: formatDate(new Date(props.row.firstSeenAt), { dateStyle: 'medium' }) },
  ]
})

const KIND_LABEL: Record<BookRequestMediaKind, string> = { ebook: 'copyEbook', audiobook: 'copyAudio' }

const requestLines = computed(() =>
  BOOK_REQUEST_MEDIA_KINDS.map((kind) => {
    const state = props.row.requests[kind]
    const isOwned = kind === 'ebook' ? props.owned.ebook : props.owned.audio
    const status = state ? t(`bookRequests.status.${state.status}`) : isOwned ? gt('inLibrary') : gt('detail.notRequested')
    return { kind, label: gt(KIND_LABEL[kind]), status, id: state?.id ?? null }
  }),
)
</script>

<template>
  <div
    class="flex min-w-0 flex-col gap-3 @min-[46rem]/book-detail:col-start-3 @min-[46rem]/book-detail:row-start-1 @min-[46rem]/book-detail:self-start"
  >
    <section class="flex flex-col rounded-xl border border-border bg-card px-4 pt-3 pb-2" data-testid="goodreads-detail-facts">
      <h3 class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ gt('detail.details') }}</h3>
      <dl class="flex flex-col">
        <div v-for="fact in facts" :key="fact.key" class="flex items-baseline justify-between gap-3 border-b border-border py-[6px] last:border-b-0">
          <dt class="shrink-0 text-[11px] font-medium text-muted-foreground">{{ fact.label }}</dt>
          <dd class="truncate text-[13px] font-medium" :title="fact.value ?? undefined">{{ fact.value ?? '-' }}</dd>
        </div>
      </dl>
    </section>

    <section class="flex flex-col rounded-xl border border-border bg-card px-4 pt-3 pb-2" data-testid="goodreads-detail-requests">
      <h3 class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{{ gt('detail.requests') }}</h3>
      <dl class="flex flex-col">
        <div
          v-for="line in requestLines"
          :key="line.kind"
          class="flex items-baseline justify-between gap-3 border-b border-border py-[6px] last:border-b-0"
          :data-testid="`goodreads-detail-request-state-${line.kind}`"
        >
          <dt class="shrink-0 text-[11px] font-medium text-muted-foreground">{{ line.label }}</dt>
          <dd class="truncate text-[13px] font-medium">
            <RouterLink
              v-if="line.id !== null"
              :to="{ name: 'book-request-detail', params: { id: line.id } }"
              class="hover:text-primary hover:underline underline-offset-2"
              >{{ line.status }}</RouterLink
            >
            <span v-else>{{ line.status }}</span>
          </dd>
        </div>
      </dl>
    </section>
  </div>
</template>
