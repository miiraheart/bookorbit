<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ExternalLink, Loader2 } from '@lucide/vue'
import type { BookCard, BookDetail, GoodreadsShelfRow } from '@bookorbit/types'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import BookCoverArtwork from '@/features/book/components/BookCoverArtwork.vue'
import { useBookDetail } from '@/features/book/composables/useBookDetail'
import { useCoverVersions } from '@/features/book/composables/useCoverVersions'
import { hasChaptersTab } from '@/features/book/lib/book-detail-tabs'
import GoodreadsBookmarks from './GoodreadsBookmarks.vue'
import GoodreadsCopyActions from './GoodreadsCopyActions.vue'
import { GOODREADS_MESSAGE_ROOT } from '../i18n'

const HighlightsTab = defineAsyncComponent(() => import('@/features/book/components/detail/tabs/HighlightsTab.vue'))
const ReadingLogTab = defineAsyncComponent(() => import('@/features/book/components/detail/tabs/ReadingLogTab.vue'))
const ChaptersTab = defineAsyncComponent(() => import('@/features/book/components/detail/tabs/ChaptersTab.vue'))
const FilesTab = defineAsyncComponent(() => import('@/features/book/components/detail/tabs/FilesTab.vue'))

type SheetTab = 'bookmarks' | 'highlights' | 'reading-log' | 'chapters' | 'files'

/**
 * The owned copies of one Goodreads row: open any edition of any copy, and the bookmarks,
 * highlights, reading log, chapters and files of the copy picked here, from the book page's own tabs.
 */
const props = defineProps<{ row: GoodreadsShelfRow | null; cards: BookCard[]; bookId: number | null; open: boolean }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; 'update:bookId': [bookId: number]; 'update:book': [book: BookCard] }>()

const { t } = useI18n()
function gt(key: string, params: Record<string, unknown> = {}): string {
  return t(`${GOODREADS_MESSAGE_ROOT}.${key}`, params)
}

const { detail, loading, error, fetch } = useBookDetail()
const { coverUrl } = useCoverVersions()
const tab = ref<SheetTab>('bookmarks')

const selected = computed(() => props.cards.find((card) => card.id === props.bookId) ?? null)
const current = computed<BookDetail | null>(() => (detail.value && detail.value.id === props.bookId ? detail.value : null))
const coverSrc = computed(() => {
  const card = selected.value
  return card?.hasCover ? coverUrl(card.id, 'thumbnail', card.coverVersion) : (props.row?.coverUrl ?? null)
})
const tabs = computed<{ tab: SheetTab; label: string }[]>(() => [
  { tab: 'bookmarks', label: gt('tabBookmarks') },
  { tab: 'highlights', label: t('book.detail.tabs.highlights') },
  { tab: 'reading-log', label: t('book.detail.tabs.readingLog') },
  ...(hasChaptersTab(current.value) ? [{ tab: 'chapters' as const, label: t('book.detail.tabs.chapters') }] : []),
  { tab: 'files', label: t('book.detail.tabs.files') },
])
const activeTab = computed<SheetTab>(() => (tabs.value.some((entry) => entry.tab === tab.value) ? tab.value : 'bookmarks'))

watch(
  () => [props.open, props.bookId] as const,
  ([open, bookId]) => {
    if (open && bookId !== null) void fetch(bookId)
  },
  { immediate: true },
)

function refetch() {
  if (props.bookId !== null) void fetch(props.bookId)
}

function handleSaved(book: BookDetail) {
  detail.value = book
  if (selected.value) emit('update:book', { ...selected.value, readStatus: book.readStatus })
}

function handleOpenChange(open: boolean) {
  emit('update:open', open)
}

function handleSelect(bookId: number) {
  emit('update:bookId', bookId)
}

function handleTab(next: SheetTab) {
  tab.value = next
}
</script>

<template>
  <Sheet :open="open" @update:open="handleOpenChange">
    <SheetContent side="right" class="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl" data-testid="goodreads-owned-sheet">
      <template v-if="row">
        <SheetHeader class="border-b border-border p-4">
          <div class="flex gap-4">
            <div class="relative aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-md border border-border">
              <BookCoverArtwork
                :src="coverSrc"
                :has-cover="coverSrc !== null"
                :title="row.title"
                :authors="row.authors"
                :seed="row.key"
                frame-aspect-ratio="2/3"
              />
            </div>
            <div class="flex min-w-0 flex-col gap-1">
              <SheetTitle>{{ row.title }}</SheetTitle>
              <SheetDescription>{{ row.authors.join(', ') }}</SheetDescription>
              <RouterLink
                v-if="bookId !== null"
                :to="{ name: 'book-detail', params: { bookId } }"
                class="mt-1 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                data-testid="goodreads-owned-details"
              >
                <ExternalLink class="size-3.5" aria-hidden="true" />{{ gt('openDetails') }}
              </RouterLink>
            </div>
          </div>
        </SheetHeader>

        <div class="flex flex-col gap-4 p-4">
          <GoodreadsCopyActions :cards="cards" :selected-id="bookId" @select="handleSelect" />

          <div class="flex flex-col gap-3">
            <div class="flex items-stretch overflow-x-auto border-b border-border" role="tablist">
              <button
                v-for="entry in tabs"
                :key="entry.tab"
                type="button"
                role="tab"
                :aria-selected="activeTab === entry.tab"
                class="h-9 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors"
                :class="activeTab === entry.tab ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'"
                :data-testid="`goodreads-owned-tab-${entry.tab}`"
                @click="handleTab(entry.tab)"
              >
                {{ entry.label }}
              </button>
            </div>

            <GoodreadsBookmarks v-if="activeTab === 'bookmarks' && selected" :card="selected" />
            <template v-else-if="current">
              <HighlightsTab v-if="activeTab === 'highlights'" :book="current" />
              <ReadingLogTab v-else-if="activeTab === 'reading-log'" :book="current" @saved="handleSaved" @refetch="refetch" />
              <ChaptersTab v-else-if="activeTab === 'chapters'" :book="current" @changed="refetch" />
              <FilesTab v-else-if="activeTab === 'files'" :book="current" @refetch="refetch" />
            </template>
            <p v-else-if="loading" class="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 class="size-4 animate-spin" aria-hidden="true" />{{ gt('detailLoading') }}
            </p>
            <p v-else-if="error" class="text-sm text-destructive">{{ gt('detailFailed') }}</p>
          </div>
        </div>
      </template>
    </SheetContent>
  </Sheet>
</template>
