<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Star } from '@lucide/vue'
import type { BookRequestMediaKind, GoodreadsShelfRow } from '@bookorbit/types'
import BookCoverArtwork from '@/features/book/components/BookCoverArtwork.vue'
import BookCoverSurface from '@/features/book/components/BookCoverSurface.vue'
import GoodreadsRemoteMenu from './GoodreadsRemoteMenu.vue'
import type { ReadAlongAccess } from '../composables/useReadAlongAccess'
import { GOODREADS_MESSAGE_ROOT } from '../i18n'

/** The list row of a Goodreads book with no library card, laid out like BookListRow beside the owned rows. */
const props = defineProps<{
  row: GoodreadsShelfRow
  canRequest: boolean
  busy?: boolean
  unavailable?: boolean
  selectionMode?: boolean
  selected?: boolean
  readAlongAccess?: ReadAlongAccess | null
  readDate?: string | null
  firstSeen: string
}>()

const emit = defineEmits<{ open: []; request: [kind: BookRequestMediaKind]; readAlong: []; toggle: [] }>()

const { t } = useI18n()
function gt(key: string, params: Record<string, unknown> = {}): string {
  return t(`${GOODREADS_MESSAGE_ROOT}.${key}`, params)
}

const authorLine = computed(() => props.row.authors.join(', '))
const pillText = computed(() => (props.row.bookIds.length > 0 ? gt('inLibrary') : gt('notInLibrary')))

function handleRowClick() {
  if (props.selectionMode) emit('toggle')
  else emit('open')
}

function handleOpen() {
  emit('open')
}

function handleRequest(kind: BookRequestMediaKind) {
  emit('request', kind)
}

function handleReadAlong() {
  emit('readAlong')
}

function handleToggle() {
  emit('toggle')
}
</script>

<template>
  <div class="flex min-w-0 flex-1 items-center gap-3" data-testid="goodreads-remote">
    <input
      type="checkbox"
      class="size-4 shrink-0 cursor-pointer rounded-xs border-border accent-primary"
      :checked="selected"
      :aria-label="gt('selectBook', { title: row.title })"
      data-testid="goodreads-row-select"
      @change="handleToggle"
    />
    <div
      class="flex min-w-0 flex-1 items-center gap-3 py-3 px-2 rounded-md transition-colors cursor-pointer hover:bg-muted/50"
      :class="[selectionMode ? 'select-none' : '', selected ? 'bg-primary/8 ring-1 ring-primary/30' : '']"
      data-testid="goodreads-open"
      @click="handleRowClick"
    >
      <div
        v-if="selectionMode"
        class="h-5 w-5 rounded-xs shrink-0 flex items-center justify-center transition-colors"
        :class="selected ? 'bg-primary' : 'border border-border bg-background'"
      >
        <Check v-if="selected" class="text-primary-foreground" :size="12" />
      </div>

      <BookCoverSurface
        size="mini"
        class="book-cover-surface--spine-fitted w-16 rounded-xs shrink-0 overflow-hidden relative"
        :style="{ aspectRatio: '2/3' }"
      >
        <BookCoverArtwork
          :src="row.coverUrl"
          :has-cover="row.coverUrl !== null"
          :title="row.title"
          :author-line="authorLine"
          :seed="row.key"
          :alt="row.title"
          backdrop-class="blur-md brightness-50"
          frame-aspect-ratio="2/3"
          :spine="true"
          :authors="row.authors"
        />
      </BookCoverSurface>

      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="truncate text-sm font-medium leading-snug text-foreground">{{ row.title }}</span>
        <span v-if="authorLine" class="truncate text-xs text-muted-foreground">{{ authorLine }}</span>
        <span class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span v-if="readDate">{{ readDate }}</span>
          <span data-testid="goodreads-first-seen">{{ firstSeen }}</span>
        </span>
      </div>

      <div v-if="!selectionMode" class="flex shrink-0 items-center gap-1.5" @click.stop @auxclick.stop>
        <span
          v-if="unavailable"
          class="flex h-8 items-center rounded-md border border-border px-3 text-sm text-muted-foreground"
          data-testid="goodreads-unavailable"
          >{{ gt('unavailableCopy') }}</span
        >
        <RouterLink
          v-else-if="row.request"
          :to="{ name: 'book-request-detail', params: { id: row.request.id } }"
          class="flex h-8 items-center rounded-md border border-border px-3 text-sm text-foreground hover:bg-accent"
          data-testid="goodreads-request-state"
          >{{ t(`bookRequests.status.${row.request.status}`) }}</RouterLink
        >
        <span v-else class="flex h-8 items-center rounded-md px-3 text-sm text-muted-foreground" data-testid="goodreads-remote-pill">{{
          pillText
        }}</span>
        <GoodreadsRemoteMenu
          variant="row"
          :row="row"
          :can-request="canRequest"
          :busy="busy"
          :selected="selected"
          :read-along-access="readAlongAccess"
          @request="handleRequest"
          @read-along="handleReadAlong"
          @info="handleOpen"
          @toggle="handleToggle"
        />
      </div>
    </div>

    <div class="flex w-40 shrink-0 flex-wrap items-center justify-end gap-1.5">
      <span
        v-if="row.isNew"
        class="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground uppercase"
        data-testid="goodreads-new-badge"
        >{{ gt('newBadge') }}</span
      >
      <span v-if="row.rating" class="flex items-center gap-0.5" :aria-label="gt('rating', { rating: row.rating })" data-testid="goodreads-rating">
        <Star v-for="n in row.rating" :key="n" class="size-3 fill-current text-primary" aria-hidden="true" />
      </span>
    </div>
  </div>
</template>
