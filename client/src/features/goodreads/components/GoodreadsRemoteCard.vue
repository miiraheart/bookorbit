<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Info, PanelRight, Star } from '@lucide/vue'
import type { BookRequestMediaKind, GoodreadsShelfRow } from '@bookorbit/types'
import BookCoverArtwork from '@/features/book/components/BookCoverArtwork.vue'
import BookCoverSurface from '@/features/book/components/BookCoverSurface.vue'
import GoodreadsRemoteMenu from './GoodreadsRemoteMenu.vue'
import type { ReadAlongAccess } from '../composables/useReadAlongAccess'
import { GOODREADS_MESSAGE_ROOT } from '../i18n'

/**
 * A Goodreads book with no library card, in the frame BookCoverCard draws (copied, not shared, so the
 * upstream card stays untouched). Every way into it opens the book's info; requests live in the kebab.
 */
const props = defineProps<{
  row: GoodreadsShelfRow
  canRequest: boolean
  busy?: boolean
  unavailable?: boolean
  showLabel?: boolean
  selectionMode?: boolean
  selected?: boolean
  readAlongAccess?: ReadAlongAccess | null
}>()

const emit = defineEmits<{ open: []; request: [kind: BookRequestMediaKind]; readAlong: []; toggle: [] }>()

const { t } = useI18n()
function gt(key: string, params: Record<string, unknown> = {}): string {
  return t(`${GOODREADS_MESSAGE_ROOT}.${key}`, params)
}

const authorLine = computed(() => props.row.authors.join(', '))
const overlayBackground = computed(() => (props.showLabel ? 'bg-black/20' : 'bg-black/70'))
const pillText = computed(() => {
  if (props.unavailable) return gt('unavailableCopy')
  if (props.row.bookIds.length > 0) return gt('inLibrary')
  if (props.row.request) return t(`bookRequests.status.${props.row.request.status}`)
  return gt('notInLibrary')
})

function handleCardClick() {
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
  <div class="flex flex-col gap-1.5" data-testid="goodreads-remote">
    <div
      class="flex flex-col @container touch-manipulation cursor-pointer"
      :class="selectionMode ? 'select-none' : ''"
      data-testid="goodreads-open"
      @click="handleCardClick"
    >
      <div class="group">
        <BookCoverSurface
          class="book-cover-surface--spine-fitted relative w-full rounded-sm overflow-hidden transition-[box-shadow,transform,ring] duration-150 will-change-transform"
          :class="selectionMode ? '' : 'group-hover:[transform:var(--cover-hover-transform)] motion-reduce:group-hover:[transform:none]'"
          :interactive="!selectionMode"
          :style="{ aspectRatio: '2/3' }"
        >
          <BookCoverArtwork
            :src="row.coverUrl"
            :has-cover="row.coverUrl !== null"
            :title="row.title"
            :author-line="authorLine"
            :seed="row.key"
            :alt="row.title"
            frame-aspect-ratio="2/3"
            :spine="true"
            :authors="row.authors"
          />

          <div class="absolute inset-0 z-10 overflow-hidden rounded-[inherit]">
            <div v-if="!selectionMode" class="absolute top-1.5 right-1.5 z-10 pointer-events-none">
              <span
                class="flex items-center rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white transition-opacity duration-150 group-hover:opacity-0"
                :data-testid="unavailable ? 'goodreads-unavailable' : 'goodreads-remote-pill'"
                >{{ pillText }}</span
              >
            </div>

            <div
              v-if="selectionMode"
              class="absolute inset-0 z-30 pointer-events-none rounded-sm"
              :class="selected ? 'bg-primary/20 ring-2 ring-inset ring-primary' : ''"
            >
              <div
                class="absolute top-1.5 left-1.5 h-5 w-5 rounded-xs flex items-center justify-center transition-colors"
                :class="selected ? 'bg-primary' : 'bg-black/40 border border-white/50'"
              >
                <Check v-if="selected" class="text-primary-foreground" :size="12" />
              </div>
            </div>

            <div
              v-else
              class="absolute inset-0 flex flex-col p-2 transition-opacity duration-150 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
              :class="overlayBackground"
            >
              <div class="shrink-0 flex items-center justify-end gap-1">
                <button
                  type="button"
                  class="p-[3cqi] rounded-[2.5cqi] bg-black/50 hover:bg-black/30 transition-colors text-white"
                  :aria-label="gt('bookInfo')"
                  :title="gt('bookInfo')"
                  data-testid="goodreads-remote-info"
                  @click.stop="handleOpen"
                >
                  <PanelRight class="size-[12cqi]" aria-hidden="true" />
                </button>
              </div>

              <div class="flex-1 flex items-center justify-center">
                <button
                  type="button"
                  class="size-[30cqi] flex items-center justify-center rounded-full bg-primary text-white shadow-2xl transition-all duration-300 scale-75 group-hover:scale-100 hover:scale-110 active:scale-90"
                  :aria-label="gt('bookInfo')"
                  :title="gt('bookInfo')"
                  data-testid="goodreads-remote-primary"
                  @click.stop="handleOpen"
                >
                  <Info class="size-[16cqi]" aria-hidden="true" />
                </button>
              </div>

              <div v-if="!showLabel" class="shrink-0 flex flex-col pr-10">
                <p class="text-xs font-semibold text-white leading-tight min-w-0 line-clamp-2">{{ row.title }}</p>
                <p v-if="authorLine" class="text-[10px] text-white/70 truncate">{{ authorLine }}</p>
              </div>

              <div v-if="!showLabel" class="absolute bottom-2 right-2 z-20">
                <GoodreadsRemoteMenu
                  variant="overlay"
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
          </div>
        </BookCoverSurface>
      </div>

      <div v-if="showLabel" class="min-w-0 pt-1" data-testid="goodreads-remote-label">
        <div class="flex min-w-0 items-center gap-0.5">
          <span class="min-w-0 flex-1 truncate text-xs leading-5 font-medium text-foreground">{{ row.title }}</span>
          <GoodreadsRemoteMenu
            variant="label"
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
        <span class="mt-0.5 block truncate text-[0.675rem] leading-[0.875rem] text-muted-foreground">{{ authorLine }}</span>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-1.5">
      <input
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
    </div>
  </div>
</template>
