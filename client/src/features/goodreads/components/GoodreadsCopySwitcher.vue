<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BookCard } from '@bookorbit/types'
import { GOODREADS_MESSAGE_ROOT } from '../i18n'
import { pickCopies } from '../lib/copies'

/** Chips for the owned copies of one row, which are separate library records; a chip shows that copy's card. */
const props = defineProps<{ cards: BookCard[]; shownId: number | null }>()
const emit = defineEmits<{ show: [bookId: number] }>()

const { t } = useI18n()
function gt(key: string, params: Record<string, unknown> = {}): string {
  return t(`${GOODREADS_MESSAGE_ROOT}.${key}`, params)
}

interface Chip {
  key: string
  label: string
  bookId: number
  active: boolean
}

const copies = computed(() => pickCopies(props.cards))
const othersActive = computed(() => copies.value.others.some((card) => card.id === props.shownId))

const chips = computed<Chip[]>(() => {
  const { ebook, audio, others } = copies.value
  const list: Chip[] = []
  if (ebook) list.push({ key: 'ebook', label: gt(ebook === audio ? 'copyBoth' : 'copyEbook'), bookId: ebook.id, active: ebook.id === props.shownId })
  if (audio && audio !== ebook) list.push({ key: 'audio', label: gt('copyAudio'), bookId: audio.id, active: audio.id === props.shownId })
  const next = nextOther(others)
  if (next) list.push({ key: 'more', label: gt('copyMore', { count: others.length }), bookId: next.id, active: othersActive.value })
  return list
})

/** "+N" walks through the copies that are neither the ebook nor the audiobook. */
function nextOther(others: BookCard[]): BookCard | null {
  const at = others.findIndex((card) => card.id === props.shownId)
  return others[(at + 1) % others.length] ?? null
}

function handleShow(chip: Chip) {
  emit('show', chip.bookId)
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-1" role="group" :aria-label="gt('copiesLabel')" data-testid="goodreads-copy-switcher">
    <button
      v-for="chip in chips"
      :key="chip.key"
      type="button"
      :aria-pressed="chip.active"
      :data-testid="`goodreads-copy-${chip.key}`"
      class="h-6 rounded-full border px-2 text-[11px] leading-none transition-colors"
      :class="chip.active ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground hover:bg-accent'"
      @click="handleShow(chip)"
    >
      {{ chip.label }}
    </button>
  </div>
</template>
