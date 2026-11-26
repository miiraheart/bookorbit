<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { AudioLines, BookOpenCheck, Headphones, Link2, Loader2, Sparkles } from '@lucide/vue'
import type { ReadAlongRow } from '@bookorbit/types'

import { Button } from '@/components/ui/button'
import { formatLanguageName } from '@/i18n/formatters'
import { formatReadAloudDuration } from '@/features/read-aloud/lib/read-aloud'
import ReadAlongChip from '@/features/read-along-pairs/components/ReadAlongChip.vue'

const props = defineProps<{ row: ReadAlongRow; busy?: boolean; creating?: boolean }>()
const emit = defineEmits<{ pair: [row: ReadAlongRow]; choose: [row: ReadAlongRow]; unpair: [row: ReadAlongRow]; create: [row: ReadAlongRow] }>()

const { t } = useI18n()

const audiobook = computed(() => props.row.audiobook)
const paired = computed(() => props.row.pair !== null || props.row.pairHidden === true)
const best = computed(() => props.row.best)
/** One click is only offered where the match stands alone; anything less certain goes through the sheet. */
const canQuickPair = computed(() => !paired.value && props.row.status === 'suggested' && best.value !== null)
const meta = computed(() => {
  const parts = [audiobook.value.authors.join(', ')]
  if (audiobook.value.libraryName) parts.push(audiobook.value.libraryName)
  if (audiobook.value.durationSeconds) parts.push(formatReadAloudDuration(audiobook.value.durationSeconds, t))
  if (audiobook.value.language) parts.push(formatLanguageName(audiobook.value.language))
  return parts.filter(Boolean).join(' · ')
})
const bestLine = computed(() => {
  const candidate = best.value
  if (!candidate) return null
  const library = candidate.libraryName ? t('tools.readAlong.candidate.library', { library: candidate.libraryName }) : null
  return [candidate.title, library].filter(Boolean).join(' · ')
})
/** The paired ebook's title when it is also the best match; the row carries no other copy of it. */
const pairedTitle = computed(() => {
  const pair = props.row.pair
  const candidate = best.value
  if (!pair) return null
  const same =
    candidate && (candidate.ebookBookId === pair.ebookBookId || candidate.otherCopies.some((copy) => copy.ebookBookId === pair.ebookBookId))
  return same ? candidate.title : t('tools.readAlong.sheet.ebookNumber', { id: pair.ebookBookId })
})
const readerLink = computed(() =>
  props.row.readAlong
    ? { name: 'reader', params: { bookId: audiobook.value.bookId, fileId: props.row.readAlong.fileId }, query: { format: 'epub' } }
    : null,
)
const filesLink = computed(() => ({ name: 'book-detail', params: { bookId: audiobook.value.bookId }, query: { tab: 'files' } }))

function handlePair(): void {
  emit('pair', props.row)
}

function handleChoose(): void {
  emit('choose', props.row)
}

function handleUnpair(): void {
  emit('unpair', props.row)
}

function handleCreate(): void {
  emit('create', props.row)
}
</script>

<template>
  <li class="flex flex-col gap-2 border-b border-border px-3 py-3 last:border-b-0 md:flex-row md:items-center" :data-book-id="audiobook.bookId">
    <div class="flex min-w-0 flex-1 items-start gap-2.5">
      <AudioLines class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div class="min-w-0 space-y-1">
        <RouterLink
          :to="{ name: 'book-detail', params: { bookId: audiobook.bookId } }"
          class="block truncate text-sm font-semibold hover:underline"
          dir="auto"
        >
          {{ audiobook.title }}
        </RouterLink>
        <p class="truncate text-xs text-muted-foreground" dir="auto">{{ meta }}</p>
        <div class="flex flex-wrap items-center gap-1">
          <ReadAlongChip kind="status" :value="row.status" />
          <ReadAlongChip v-if="!paired && best" kind="tier" :value="best.tier" />
          <template v-if="!paired && best">
            <ReadAlongChip v-for="flag in best.flags" :key="flag" kind="flag" :value="flag" />
          </template>
          <span
            v-if="row.readAlong"
            class="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--pill-success)]"
            data-testid="read-along-ready"
          >
            <BookOpenCheck class="size-3.5" aria-hidden="true" />{{ t('tools.readAlong.row.ready') }}
          </span>
          <span v-if="row.readAlong?.stale" class="text-[11px] text-[var(--pill-warning)]" data-testid="read-along-stale">
            {{ t('tools.readAlong.row.stale') }}
          </span>
        </div>
      </div>
    </div>

    <div class="min-w-0 text-xs md:w-[30%]" data-testid="read-along-candidate">
      <template v-if="!paired && bestLine">
        <p class="truncate text-foreground" dir="auto">{{ bestLine }}</p>
        <p class="truncate text-muted-foreground">
          {{ best!.reasons.map((reason) => t(`tools.readAlong.reason.${reason}`)).join(' · ') }}
          <template v-if="row.candidateCount > 1">· {{ t('tools.readAlong.row.moreCandidates', { count: row.candidateCount - 1 }) }}</template>
        </p>
      </template>
      <p v-else-if="!row.pair && paired" class="truncate text-foreground" data-testid="read-along-paired-hidden">
        {{ t('tools.readAlong.row.pairedWith', { title: t('tools.readAlong.sheet.hiddenEbook') }) }}
      </p>
      <RouterLink
        v-else-if="row.pair"
        :to="{ name: 'book-detail', params: { bookId: row.pair.ebookBookId } }"
        class="block truncate text-foreground hover:underline"
        dir="auto"
        data-testid="read-along-paired-ebook"
        >{{ t('tools.readAlong.row.pairedWith', { title: pairedTitle }) }}</RouterLink
      >
      <p v-else class="text-muted-foreground">{{ t('tools.readAlong.row.noCandidate') }}</p>
    </div>

    <div class="flex flex-wrap items-center gap-1.5 md:justify-end">
      <Button v-if="canQuickPair" size="sm" :disabled="busy" data-testid="read-along-pair" @click="handlePair">
        <Link2 aria-hidden="true" />{{ t('tools.readAlong.actions.pair') }}
      </Button>
      <Button size="sm" variant="outline" :disabled="busy" data-testid="read-along-choose" @click="handleChoose">
        {{ paired || row.status === 'needs_attention' ? t('tools.readAlong.actions.change') : t('tools.readAlong.actions.choose') }}
      </Button>
      <Button v-if="paired" size="sm" variant="ghost" :disabled="busy" data-testid="read-along-unpair" @click="handleUnpair">
        {{ t('tools.readAlong.actions.unpair') }}
      </Button>
      <Button v-if="!row.activeJobId" size="sm" variant="ghost" :disabled="busy || creating" data-testid="read-along-create" @click="handleCreate">
        <Loader2 v-if="creating" class="animate-spin" aria-hidden="true" />
        <Sparkles v-else aria-hidden="true" />
        {{ row.readAlong?.stale ? t('tools.readAlong.actions.regenerate') : t('tools.readAlong.actions.create') }}
      </Button>
      <Button v-else as-child size="sm" variant="ghost">
        <RouterLink :to="filesLink" data-testid="read-along-job">{{ t('tools.readAlong.actions.viewJob') }}</RouterLink>
      </Button>
      <Button v-if="readerLink" as-child size="sm" variant="ghost">
        <RouterLink :to="readerLink" data-testid="read-along-open"
          ><Headphones aria-hidden="true" />{{ t('tools.readAlong.actions.open') }}</RouterLink
        >
      </Button>
    </div>
  </li>
</template>
