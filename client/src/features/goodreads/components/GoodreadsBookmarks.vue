<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Bookmark as BookmarkIcon, Headphones, Loader2 } from '@lucide/vue'
import type { AudiobookBookmark, BookCard } from '@bookorbit/types'
import type { Bookmark } from '@/features/reader/epub/composables/useBookmarks'
import { formatDate } from '@/i18n/formatters'
import { fetchAudioBookmarks, fetchEbookBookmarks } from '../api/bookmarks.api'
import { GOODREADS_MESSAGE_ROOT } from '../i18n'
import { openableEntries, readerLocation } from '../lib/copies'

/** The bookmarks of one owned copy, each opening the reader at its place. */
const props = defineProps<{ card: BookCard }>()

const { t } = useI18n()
function gt(key: string, params: Record<string, unknown> = {}): string {
  return t(`${GOODREADS_MESSAGE_ROOT}.${key}`, params)
}

const ebookMarks = ref<Bookmark[]>([])
const audioMarks = ref<AudiobookBookmark[]>([])
const loading = ref(false)
const failed = ref(false)
let loadToken = 0

const entries = computed(() => openableEntries(props.card))
const epubEntry = computed(() => entries.value.find((entry) => !entry.audio && entry.file.format?.toLowerCase() === 'epub') ?? null)
const hasEbook = computed(() => entries.value.some((entry) => !entry.audio))
const audioEntry = computed(() => entries.value.find((entry) => entry.audio) ?? null)
const empty = computed(() => ebookMarks.value.length === 0 && audioMarks.value.length === 0)

async function load() {
  const token = ++loadToken
  const bookId = props.card.id
  ebookMarks.value = []
  audioMarks.value = []
  failed.value = false
  loading.value = true
  const [ebook, audio] = await Promise.allSettled([
    hasEbook.value ? fetchEbookBookmarks(bookId) : Promise.resolve([]),
    audioEntry.value ? fetchAudioBookmarks(bookId) : Promise.resolve([]),
  ])
  if (token !== loadToken) return
  loading.value = false
  if (ebook.status === 'fulfilled') ebookMarks.value = ebook.value
  if (audio.status === 'fulfilled') audioMarks.value = [...audio.value].sort((a, b) => a.positionMs - b.positionMs)
  failed.value = ebook.status === 'rejected' || audio.status === 'rejected'
}

watch(() => props.card.id, load, { immediate: true })

function ebookLink(mark: Bookmark) {
  const entry = epubEntry.value
  return entry && mark.cfi ? readerLocation(props.card, entry.file, undefined, { cfi: mark.cfi }) : null
}

function audioLink(mark: AudiobookBookmark) {
  const entry = audioEntry.value
  return entry ? readerLocation(props.card, entry.file, undefined, { at: String(Math.max(0, Math.round(mark.positionMs))) }) : null
}

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

function day(value: string): string {
  return formatDate(new Date(value), { dateStyle: 'medium' })
}
</script>

<template>
  <div class="flex flex-col gap-3" data-testid="goodreads-bookmarks">
    <p v-if="loading" class="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 class="size-4 animate-spin" aria-hidden="true" />{{ gt('bookmarksLoading') }}
    </p>
    <template v-else>
      <p v-if="failed" class="text-sm text-destructive">{{ gt('bookmarksFailed') }}</p>
      <p v-if="empty && !failed" class="text-sm text-muted-foreground" data-testid="goodreads-bookmarks-empty">{{ gt('bookmarksEmpty') }}</p>
      <ul v-if="ebookMarks.length > 0" class="flex flex-col divide-y divide-border rounded-md border border-border">
        <li v-for="mark in ebookMarks" :key="`e${mark.id}`">
          <component
            :is="ebookLink(mark) ? 'RouterLink' : 'div'"
            :to="ebookLink(mark) ?? undefined"
            class="flex items-start gap-2 px-3 py-2 text-sm"
            :class="ebookLink(mark) ? 'hover:bg-accent' : ''"
            data-testid="goodreads-bookmark-ebook"
          >
            <BookmarkIcon class="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span class="min-w-0 flex-1">
              <span class="block truncate">{{ mark.title }}</span>
              <span v-if="mark.note" class="block text-xs text-muted-foreground">{{ mark.note }}</span>
            </span>
            <span class="shrink-0 text-xs text-muted-foreground">{{ day(mark.createdAt) }}</span>
          </component>
        </li>
      </ul>
      <ul v-if="audioMarks.length > 0" class="flex flex-col divide-y divide-border rounded-md border border-border">
        <li v-for="mark in audioMarks" :key="`a${mark.id}`">
          <component
            :is="audioLink(mark) ? 'RouterLink' : 'div'"
            :to="audioLink(mark) ?? undefined"
            class="flex items-start gap-2 px-3 py-2 text-sm"
            :class="audioLink(mark) ? 'hover:bg-accent' : ''"
            data-testid="goodreads-bookmark-audio"
          >
            <Headphones class="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span class="min-w-0 flex-1">
              <span class="block truncate">{{ mark.title }}</span>
              <span v-if="mark.note" class="block text-xs text-muted-foreground">{{ mark.note }}</span>
            </span>
            <span class="shrink-0 text-xs text-muted-foreground tabular-nums">{{ clock(mark.positionMs) }}</span>
          </component>
        </li>
      </ul>
    </template>
  </div>
</template>
