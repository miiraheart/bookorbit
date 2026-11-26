<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Star } from '@lucide/vue'
import type { BookCard, GoodreadsShelfRow } from '@bookorbit/types'
import BookCoverCard from '@/features/book/components/BookCoverCard.vue'
import BookListRow from '@/features/book/components/BookListRow.vue'
import GoodreadsCopySwitcher from './GoodreadsCopySwitcher.vue'
import { GOODREADS_MESSAGE_ROOT } from '../i18n'
import { pickCopies } from '../lib/copies'

type BookAction = 'quick-view' | 'add-to-collection' | 'move-to-library' | 'delete'

/** An owned Goodreads row drawn as the library draws a book, with chips to show its other copies. */
const props = defineProps<{
  row: GoodreadsShelfRow
  cards: BookCard[]
  variant: 'grid' | 'list'
  selectionMode?: boolean
  selected?: boolean
  showLabel?: boolean
  /** The copy on screen when the page tracks it; otherwise the ebook copy first. */
  shownId?: number | null
}>()

const emit = defineEmits<{
  action: [book: BookCard, action: BookAction]
  'update:book': [book: BookCard]
  'update:shownId': [bookId: number]
  select: [event: MouseEvent]
  toggle: []
}>()

const { t } = useI18n()
function gt(key: string, params: Record<string, unknown> = {}): string {
  return t(`${GOODREADS_MESSAGE_ROOT}.${key}`, params)
}

const chosenId = ref<number | null>(props.shownId ?? null)
watch(
  () => props.shownId,
  (id) => {
    chosenId.value = id ?? null
  },
)

const shown = computed(() => props.cards.find((card) => card.id === chosenId.value) ?? pickCopies(props.cards).primary!)

function handleShow(bookId: number) {
  chosenId.value = bookId
  emit('update:shownId', bookId)
}

function handleAction(action: BookAction) {
  emit('action', shown.value, action)
}

function handleUpdate(book: BookCard) {
  emit('update:book', book)
}

function handleSelect(event: MouseEvent) {
  emit('select', event)
}

function handleToggle() {
  emit('toggle')
}
</script>

<template>
  <div :class="variant === 'grid' ? 'flex flex-col gap-1.5' : 'flex min-w-0 items-center gap-3'" data-testid="goodreads-owned">
    <input
      v-if="variant === 'list'"
      type="checkbox"
      class="size-4 shrink-0 cursor-pointer rounded-xs border-border accent-primary"
      :checked="selected"
      :aria-label="gt('selectBook', { title: row.title })"
      data-testid="goodreads-row-select"
      @change="handleToggle"
    />
    <BookCoverCard
      v-if="variant === 'grid'"
      :book="shown"
      cover-aspect-ratio="2/3"
      :show-label="showLabel"
      :selection-mode="selectionMode"
      :selected="selected"
      :allow-move-to-library="true"
      @action="handleAction"
      @update:book="handleUpdate"
      @select="handleSelect"
    />
    <div v-else class="min-w-0 flex-1">
      <BookListRow
        :book="shown"
        :selection-mode="selectionMode"
        :selected="selected"
        :allow-move-to-library="true"
        @action="handleAction"
        @select="handleSelect"
      />
    </div>

    <div class="flex flex-wrap items-center gap-1.5" :class="variant === 'list' ? 'w-40 shrink-0 justify-end' : ''">
      <input
        v-if="variant === 'grid'"
        type="checkbox"
        class="size-4 cursor-pointer rounded-xs border-border accent-primary"
        :checked="selected"
        :aria-label="gt('selectBook', { title: row.title })"
        data-testid="goodreads-row-select"
        @change="handleToggle"
      />
      <span
        v-if="row.isNew"
        class="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground uppercase"
        data-testid="goodreads-new-badge"
        >{{ gt('newBadge') }}</span
      >
      <span v-if="row.rating" class="flex items-center gap-0.5" :aria-label="gt('rating', { rating: row.rating })" data-testid="goodreads-rating">
        <Star v-for="n in row.rating" :key="n" class="size-3 fill-current text-primary" aria-hidden="true" />
      </span>
      <GoodreadsCopySwitcher v-if="cards.length > 1" :cards="cards" :shown-id="shown.id" @show="handleShow" />
    </div>
  </div>
</template>
