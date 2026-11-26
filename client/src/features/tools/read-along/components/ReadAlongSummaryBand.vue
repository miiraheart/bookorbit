<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ReadAlongListSummary, ReadAlongPairStatus } from '@bookorbit/types'

import { formatNumber } from '@/i18n/formatters'

const props = defineProps<{ summary: ReadAlongListSummary | null; activeStatus: ReadAlongPairStatus | undefined }>()
const emit = defineEmits<{ filter: [status: ReadAlongPairStatus | undefined] }>()

const { t } = useI18n()

const STATUSES: ReadAlongPairStatus[] = ['paired', 'needs_attention', 'suggested', 'ambiguous', 'flagged', 'none']
const COLORS: Record<ReadAlongPairStatus, string> = {
  paired: 'var(--pill-success)',
  needs_attention: 'var(--pill-warning)',
  suggested: 'var(--pill-info)',
  ambiguous: 'var(--pill-warning)',
  flagged: 'var(--pill-warning)',
  none: 'var(--muted-foreground)',
}

const total = computed(() => (props.summary ? STATUSES.reduce((sum, status) => sum + props.summary![status], 0) : 0))
const visible = computed(() => STATUSES.filter((status) => status !== 'needs_attention' || (props.summary?.needs_attention ?? 0) > 0))

function handleFilter(status: ReadAlongPairStatus): void {
  emit('filter', props.activeStatus === status ? undefined : status)
}

function handleClear(): void {
  emit('filter', undefined)
}
</script>

<template>
  <div class="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2" data-testid="read-along-summary">
    <p class="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[13px] text-muted-foreground" aria-live="polite">
      <span class="text-[15px] font-bold tabular-nums text-foreground">{{ formatNumber(total) }}</span>
      <span>{{ t('tools.readAlong.summary.audiobooks', { count: total }) }}</span>
      <template v-if="summary">
        <span aria-hidden="true">&middot;</span>
        <span class="text-[15px] font-bold tabular-nums text-[var(--pill-success)]">{{ formatNumber(summary.readAlongReady) }}</span>
        <span>{{ t('tools.readAlong.summary.ready', { count: summary.readAlongReady }) }}</span>
      </template>
    </p>

    <div class="flex flex-wrap items-center gap-1.5 sm:ms-auto" role="group" :aria-label="t('tools.readAlong.summary.filter')">
      <button
        v-if="activeStatus"
        type="button"
        class="inline-flex h-[26px] items-center rounded-full px-2.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        @click="handleClear"
      >
        {{ t('tools.readAlong.summary.all') }}
      </button>
      <button
        v-for="status in visible"
        :key="status"
        type="button"
        class="inline-flex h-[26px] items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        :class="
          activeStatus === status
            ? 'border-primary/40 bg-primary/14 text-foreground'
            : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
        "
        :aria-pressed="activeStatus === status"
        :data-testid="`read-along-filter-${status}`"
        @click="handleFilter(status)"
      >
        <span class="size-1.5 rounded-full" :style="{ backgroundColor: COLORS[status] }" aria-hidden="true" />
        {{ t(`tools.readAlong.status.${status}`) }}
        <span class="min-w-[18px] rounded-full bg-muted px-1.5 text-center text-[11px] font-bold tabular-nums text-muted-foreground">
          {{ formatNumber(summary?.[status] ?? 0) }}
        </span>
      </button>
    </div>
  </div>
</template>
