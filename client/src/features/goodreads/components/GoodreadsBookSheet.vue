<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { BookPlus, ExternalLink, Loader2, Star } from '@lucide/vue'
import type { GoodreadsShelfRow, MetadataCandidate } from '@bookorbit/types'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import BookCoverArtwork from '@/features/book/components/BookCoverArtwork.vue'
import { useMetadataSearch } from '@/features/book/composables/useMetadataSearch'
import { providerIconPathSafe } from '@/features/book/lib/provider-icons'
import { formatDate, formatLanguageName } from '@/i18n/formatters'
import { GOODREADS_MESSAGE_ROOT } from '../i18n'

/**
 * A book from a Goodreads shelf that is not in the library, shown the way the request search shows
 * a candidate: the same metadata search over the configured providers, ISBN first, then title and author.
 */
const props = defineProps<{ row: GoodreadsShelfRow | null; canRequest: boolean; busy: boolean }>()
const emit = defineEmits<{ close: []; request: [row: GoodreadsShelfRow] }>()

const { t } = useI18n()
function gt(key: string, params: Record<string, unknown> = {}): string {
  return t(`${GOODREADS_MESSAGE_ROOT}.${key}`, params)
}

const { results, isStreaming, hasSearched, loadProviders, search } = useMetadataSearch()
const chosenIndex = ref(0)
let providersLoaded = false

const candidates = computed<MetadataCandidate[]>(() => results.value.filter((candidate) => candidate.title || candidate.description))
const candidate = computed<MetadataCandidate | null>(() => candidates.value[chosenIndex.value] ?? candidates.value[0] ?? null)
const goodreadsUrl = computed(() => (props.row?.goodreadsId ? `https://www.goodreads.com/book/show/${props.row.goodreadsId}` : null))
const coverSrc = computed(() => candidate.value?.coverUrl ?? props.row?.coverUrl ?? null)
const requestable = computed(
  () => props.canRequest && props.row !== null && props.row.bookIds.length === 0 && (!props.row.request || ['cancelled', 'rejected'].includes(props.row.request.status)),
)

async function lookUp(row: GoodreadsShelfRow) {
  chosenIndex.value = 0
  if (!providersLoaded) {
    await loadProviders()
    providersLoaded = true
  }
  if (row.isbn13) {
    await search({ isbn: row.isbn13, mediaKind: 'ebook', resultsPerProvider: 3 })
    if (candidates.value.length > 0) return
  }
  await search({ title: row.title, author: row.authors[0] ?? '', mediaKind: 'ebook', resultsPerProvider: 3 })
}

watch(
  () => props.row?.key,
  () => {
    if (props.row) void lookUp(props.row)
  },
  { immediate: true },
)

function handleOpenChange(open: boolean) {
  if (!open) emit('close')
}

function handleRequest() {
  if (props.row) emit('request', props.row)
}
</script>

<template>
  <Sheet :open="row !== null" @update:open="handleOpenChange">
    <SheetContent side="right" class="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg" data-testid="goodreads-book-sheet">
      <template v-if="row">
        <SheetHeader class="border-b border-border p-4">
          <SheetTitle>{{ candidate?.title ?? row.title }}</SheetTitle>
          <SheetDescription>{{ (candidate?.authors ?? row.authors).join(', ') }}</SheetDescription>
        </SheetHeader>

        <div class="flex flex-col gap-4 p-4">
          <div class="flex gap-4">
            <div class="aspect-[2/3] w-32 shrink-0 overflow-hidden rounded-md border border-border">
              <BookCoverArtwork
                :src="coverSrc"
                :has-cover="coverSrc !== null"
                :title="row.title"
                :authors="row.authors"
                :seed="row.key"
                frame-aspect-ratio="2/3"
              />
            </div>
            <dl class="grid min-w-0 flex-1 grid-cols-[auto_1fr] content-start gap-x-3 gap-y-1 text-sm">
              <template v-if="candidate?.seriesName">
                <dt class="text-muted-foreground">{{ gt('detail.series') }}</dt>
                <dd class="truncate">{{ candidate.seriesName }}<span v-if="candidate.seriesIndex"> #{{ candidate.seriesIndex }}</span></dd>
              </template>
              <template v-if="candidate?.publishedYear || candidate?.publishedDate">
                <dt class="text-muted-foreground">{{ gt('detail.published') }}</dt>
                <dd>{{ candidate.publishedYear ?? candidate.publishedDate }}</dd>
              </template>
              <template v-if="candidate?.publisher">
                <dt class="text-muted-foreground">{{ gt('detail.publisher') }}</dt>
                <dd class="truncate">{{ candidate.publisher }}</dd>
              </template>
              <template v-if="candidate?.language">
                <dt class="text-muted-foreground">{{ gt('detail.language') }}</dt>
                <dd>{{ formatLanguageName(candidate.language) }}</dd>
              </template>
              <template v-if="candidate?.pageCount">
                <dt class="text-muted-foreground">{{ gt('detail.pages') }}</dt>
                <dd>{{ candidate.pageCount }}</dd>
              </template>
              <template v-if="candidate?.isbn13 ?? row.isbn13">
                <dt class="text-muted-foreground">ISBN</dt>
                <dd>{{ candidate?.isbn13 ?? row.isbn13 }}</dd>
              </template>
              <dt class="text-muted-foreground">{{ gt('detail.onGoodreads') }}</dt>
              <dd>
                <span v-if="row.rating" class="inline-flex items-center gap-0.5" :aria-label="gt('rating', { rating: row.rating })">
                  <Star v-for="n in row.rating" :key="n" class="size-3 fill-current text-primary" aria-hidden="true" />
                </span>
                <span>{{ gt('firstSeen', { date: formatDate(new Date(row.firstSeenAt), { dateStyle: 'medium' }) }) }}</span>
              </dd>
            </dl>
          </div>

          <div class="flex flex-wrap gap-2">
            <Button v-if="requestable" size="sm" :disabled="busy" data-testid="goodreads-sheet-request" @click="handleRequest">
              <BookPlus class="size-3.5" aria-hidden="true" />{{ gt('request') }}
            </Button>
            <RouterLink
              v-else-if="row.request"
              :to="{ name: 'book-request-detail', params: { id: row.request.id } }"
              class="flex h-8 items-center rounded-md border border-border px-3 text-sm hover:bg-accent"
              >{{ t(`bookRequests.status.${row.request.status}`) }}</RouterLink
            >
            <a
              v-if="goodreadsUrl"
              :href="goodreadsUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-accent"
              data-testid="goodreads-sheet-link"
            >
              <ExternalLink class="size-3.5" aria-hidden="true" />{{ gt('detail.openGoodreads') }}
            </a>
          </div>

          <p v-if="isStreaming && !candidate" class="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 class="size-4 animate-spin" aria-hidden="true" />{{ gt('detail.searching') }}
          </p>
          <p v-else-if="hasSearched && !isStreaming && !candidate" class="text-sm text-muted-foreground">{{ gt('detail.noMetadata') }}</p>

          <template v-if="candidate">
            <p v-if="candidate.description" class="text-sm whitespace-pre-line text-foreground" data-testid="goodreads-sheet-description">
              {{ candidate.description }}
            </p>
            <div v-if="candidate.genres?.length" class="flex flex-wrap gap-1">
              <span v-for="genre in candidate.genres.slice(0, 8)" :key="genre" class="rounded-full border border-border px-2 text-xs">{{ genre }}</span>
            </div>
          </template>

          <div v-if="candidates.length > 1" class="flex flex-col gap-1 border-t border-border pt-3">
            <p class="text-xs text-muted-foreground">{{ gt('detail.otherEditions') }}</p>
            <button
              v-for="(entry, index) in candidates.slice(0, 8)"
              :key="`${entry.provider}:${entry.providerId}`"
              type="button"
              class="flex items-center gap-2 rounded-md px-2 py-1 text-start text-sm hover:bg-accent"
              :class="index === chosenIndex ? 'bg-accent' : ''"
              @click="chosenIndex = index"
            >
              <img v-if="providerIconPathSafe(entry.provider)" :src="providerIconPathSafe(entry.provider) ?? ''" alt="" class="size-4" />
              <span class="truncate">{{ entry.title }}</span>
              <span class="ms-auto shrink-0 text-xs text-muted-foreground">{{ [entry.publishedYear, entry.language].filter(Boolean).join(' · ') }}</span>
            </button>
          </div>
        </div>
      </template>
    </SheetContent>
  </Sheet>
</template>
