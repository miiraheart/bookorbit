<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { BookOpen, Eye, Headphones } from '@lucide/vue'
import type { BookCard } from '@bookorbit/types'
import { Button } from '@/components/ui/button'
import BookFormatChip from '@/features/book/components/BookFormatChip.vue'
import { useLibraries } from '@/features/library/composables/useLibraries'
import { GOODREADS_MESSAGE_ROOT } from '../i18n'
import GoodreadsReadAlongAction from './GoodreadsReadAlongAction.vue'
import { openableEntries, pickCopies, readerLocation } from '../lib/copies'

/**
 * Every owned copy of the row with a Read, Listen and Peek button per edition, which the library's
 * quick view cannot offer: it opens one primary file of one record.
 */
const props = defineProps<{ cards: BookCard[]; selectedId: number | null }>()
const emit = defineEmits<{ select: [bookId: number] }>()

const { t } = useI18n()
function gt(key: string, params: Record<string, unknown> = {}): string {
  return t(`${GOODREADS_MESSAGE_ROOT}.${key}`, params)
}

const { libraries } = useLibraries()

const copies = computed(() =>
  props.cards.map((card) => ({
    card,
    library: libraries.value.find((library) => library.id === card.libraryId)?.name ?? null,
    missing: card.status === 'missing',
    entries: openableEntries(card),
  })),
)

const readAlong = computed(() => {
  for (const copy of copies.value) {
    if (copy.missing) continue
    const entry = copy.entries.find((candidate) => candidate.readAlong)
    if (entry) return readerLocation(copy.card, entry.file)
  }
  return null
})

const separateRecords = computed(() => {
  const { ebook, audio } = pickCopies(props.cards)
  return ebook !== null && audio !== null && ebook !== audio
})

function handleSelect(bookId: number) {
  emit('select', bookId)
}
</script>

<template>
  <section class="flex flex-col gap-2" data-testid="goodreads-copy-actions">
    <div
      v-for="copy in copies"
      :key="copy.card.id"
      class="flex flex-col gap-2 rounded-md border p-2.5"
      :class="copy.card.id === selectedId ? 'border-primary' : 'border-border'"
      :data-testid="`goodreads-copy-line-${copy.card.id}`"
    >
      <button
        type="button"
        class="flex min-w-0 items-center gap-2 text-start"
        :aria-pressed="copy.card.id === selectedId"
        :data-testid="`goodreads-copy-select-${copy.card.id}`"
        @click="handleSelect(copy.card.id)"
      >
        <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ copy.library ?? copy.card.title }}</span>
        <BookFormatChip v-for="entry in copy.entries" :key="entry.key" :format-key="entry.key" class="rounded-xs px-1.5 py-0.5 text-[10px]" />
      </button>
      <p v-if="copy.missing" class="text-xs text-muted-foreground">{{ gt('copyMissing') }}</p>
      <div v-else class="flex flex-wrap gap-1.5">
        <template v-for="entry in copy.entries" :key="entry.key">
          <Button as-child size="sm" variant="outline">
            <RouterLink :to="readerLocation(copy.card, entry.file)" :data-testid="`goodreads-copy-open-${copy.card.id}-${entry.key}`">
              <component :is="entry.audio ? Headphones : BookOpen" class="size-3.5" aria-hidden="true" />{{ gt(entry.audio ? 'listen' : 'read') }}
              <span class="text-xs uppercase text-muted-foreground">{{ entry.file.format }}</span>
            </RouterLink>
          </Button>
          <Button as-child size="sm" variant="ghost">
            <RouterLink :to="readerLocation(copy.card, entry.file, 'peek')" :data-testid="`goodreads-copy-peek-${copy.card.id}-${entry.key}`">
              <Eye class="size-3.5" aria-hidden="true" />{{ gt('peek') }}
            </RouterLink>
          </Button>
        </template>
      </div>
    </div>

    <Button v-if="readAlong" as-child size="sm" class="self-start">
      <RouterLink :to="readAlong" data-testid="goodreads-read-along"
        ><Headphones class="size-3.5" aria-hidden="true" />{{ gt('readAlong') }}</RouterLink
      >
    </Button>
    <GoodreadsReadAlongAction v-else-if="separateRecords" :cards="cards" />
  </section>
</template>
