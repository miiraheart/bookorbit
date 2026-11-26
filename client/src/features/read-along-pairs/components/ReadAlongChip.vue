<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ReadAlongMatchFlag, ReadAlongMatchTier, ReadAlongPairStatus } from '@bookorbit/types'

const props = defineProps<
  { kind: 'status'; value: ReadAlongPairStatus } | { kind: 'tier'; value: ReadAlongMatchTier } | { kind: 'flag'; value: ReadAlongMatchFlag }
>()

const { t } = useI18n()

const COLORS: Record<string, string> = {
  'status:paired': 'var(--pill-success)',
  'status:needs_attention': 'var(--pill-warning)',
  'status:suggested': 'var(--pill-info)',
  'status:ambiguous': 'var(--pill-warning)',
  'status:flagged': 'var(--pill-warning)',
  'status:none': 'var(--muted-foreground)',
  'tier:exact': 'var(--pill-success)',
  'tier:likely': 'var(--pill-info)',
  'tier:maybe': 'var(--pill-warning)',
}

const color = computed(() => COLORS[`${props.kind}:${props.value}`] ?? 'var(--pill-warning)')
const label = computed(() => t(`tools.readAlong.${props.kind}.${props.value}`))
const chipStyle = computed(() => ({
  color: color.value,
  backgroundColor: `color-mix(in oklch, ${color.value} 14%, transparent)`,
  boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${color.value} 34%, transparent)`,
}))
</script>

<template>
  <span
    class="inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-semibold whitespace-nowrap"
    :style="chipStyle"
    :data-testid="`read-along-${kind}-${value}`"
  >
    <span class="size-1.5 shrink-0 rounded-full" :style="{ backgroundColor: color }" aria-hidden="true" />
    {{ label }}
  </span>
</template>
