<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDown, EyeOff, RotateCcw } from '@lucide/vue'
import type { ReadAlongCandidate } from '@bookorbit/types'

import { Button } from '@/components/ui/button'
import { formatLanguageName } from '@/i18n/formatters'
import ReadAlongChip from './ReadAlongChip.vue'
import type { PairTarget } from '../composables/usePairCandidates'

const props = defineProps<{ candidate: ReadAlongCandidate; selectedFileId: number | null; dismissed?: boolean; busy?: boolean }>()
const emit = defineEmits<{ select: [target: PairTarget]; dismiss: [ebookBookId: number]; undismiss: [ebookBookId: number] }>()

const { t } = useI18n()

const selected = computed(
  () => props.selectedFileId === props.candidate.ebookFileId || props.candidate.otherCopies.some((copy) => copy.ebookFileId === props.selectedFileId),
)
const details = computed(() => {
  const parts = [props.candidate.authors.join(', ')]
  if (props.candidate.libraryName) parts.push(t('tools.readAlong.candidate.library', { library: props.candidate.libraryName }))
  if (props.candidate.language) parts.push(formatLanguageName(props.candidate.language))
  return parts.filter(Boolean).join(' · ')
})

function handleSelect(target: PairTarget): void {
  if (!props.dismissed) emit('select', target)
}

function handleDismiss(): void {
  emit('dismiss', props.candidate.ebookBookId)
}

function handleUndismiss(): void {
  emit('undismiss', props.candidate.ebookBookId)
}
</script>

<template>
  <li
    class="rounded-lg border px-3 py-2.5"
    :class="selected ? 'border-primary bg-primary/7' : 'border-border'"
    :data-testid="`pair-candidate-${candidate.ebookBookId}`"
  >
    <div class="flex items-start gap-2.5">
      <input
        v-if="!dismissed"
        type="radio"
        class="mt-1 size-4 shrink-0 accent-primary"
        name="pair-candidate"
        :checked="selectedFileId === candidate.ebookFileId"
        :aria-label="t('tools.readAlong.candidate.choose', { title: candidate.title })"
        :data-testid="`pair-candidate-select-${candidate.ebookFileId}`"
        @change="handleSelect({ ebookBookId: candidate.ebookBookId, ebookFileId: candidate.ebookFileId })"
      />
      <div class="min-w-0 flex-1 space-y-1">
        <p class="truncate text-sm font-medium text-foreground" dir="auto">{{ candidate.title }}</p>
        <p class="truncate text-xs text-muted-foreground" dir="auto">{{ details }}</p>
        <div class="flex flex-wrap items-center gap-1">
          <ReadAlongChip kind="tier" :value="candidate.tier" />
          <ReadAlongChip v-for="flag in candidate.flags" :key="flag" kind="flag" :value="flag" />
          <span class="text-[11px] text-muted-foreground">
            {{ candidate.reasons.map((reason) => t(`tools.readAlong.reason.${reason}`)).join(' · ') }}
          </span>
        </div>
        <p v-if="candidate.flags.includes('language_conflict')" class="text-xs text-[var(--pill-warning)]" data-testid="pair-language-warning">
          {{ t('tools.readAlong.candidate.languageConflict') }}
        </p>
        <details v-if="candidate.otherCopies.length > 0" class="group text-xs" :data-testid="`pair-copies-${candidate.ebookBookId}`">
          <summary class="inline-flex cursor-pointer items-center gap-1 text-muted-foreground hover:text-foreground">
            <ChevronDown class="size-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
            {{ t('tools.readAlong.candidate.otherCopies', { count: candidate.otherCopies.length }) }}
          </summary>
          <ul class="mt-1.5 space-y-1 ps-5">
            <li v-for="copy in candidate.otherCopies" :key="copy.ebookFileId" class="flex items-center gap-2">
              <input
                v-if="!dismissed"
                type="radio"
                class="size-3.5 accent-primary"
                name="pair-candidate"
                :checked="selectedFileId === copy.ebookFileId"
                :aria-label="t('tools.readAlong.candidate.chooseCopy', { library: copy.libraryName ?? '' })"
                :data-testid="`pair-candidate-select-${copy.ebookFileId}`"
                @change="handleSelect({ ebookBookId: copy.ebookBookId, ebookFileId: copy.ebookFileId })"
              />
              <span class="text-muted-foreground">{{ copy.libraryName ?? t('tools.readAlong.candidate.unknownLibrary') }}</span>
            </li>
          </ul>
        </details>
      </div>
      <Button
        v-if="dismissed"
        size="sm"
        variant="ghost"
        :disabled="busy"
        :data-testid="`pair-undismiss-${candidate.ebookBookId}`"
        @click="handleUndismiss"
      >
        <RotateCcw aria-hidden="true" />{{ t('tools.readAlong.candidate.undismiss') }}
      </Button>
      <Button v-else size="sm" variant="ghost" :disabled="busy" :data-testid="`pair-dismiss-${candidate.ebookBookId}`" @click="handleDismiss">
        <EyeOff aria-hidden="true" />{{ t('tools.readAlong.candidate.dismiss') }}
      </Button>
    </div>
  </li>
</template>
