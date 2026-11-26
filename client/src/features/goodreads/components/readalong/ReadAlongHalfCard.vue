<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { BookOpen, Check, Headphones, Loader2, RefreshCw, Repeat } from '@lucide/vue'
import type { BookRequestMediaKind, ReleaseCandidateItem } from '@bookorbit/types'
import { formatNumber } from '@/i18n/formatters'
import { formatBytes } from '@/lib/formatting'
import type { ReadAlongRequest } from '../../api/readAlong.api'
import type { GrabState } from '../../composables/useReadAlongPair'
import { GOODREADS_MESSAGE_ROOT } from '../../i18n'
import { matchReason, type ReadAlongHalfPick } from '../../lib/readAlongPick'

/** One half of a read-along download: its pick and why, the ranked list behind Swap, and its grab. */
const props = defineProps<{
  kind: BookRequestMediaKind
  owned: boolean
  request: ReadAlongRequest | null
  pickable: boolean
  searching: boolean
  searchFailed: boolean
  half: ReadAlongHalfPick | null
  release: ReleaseCandidateItem | null
  grab: GrabState
}>()

const emit = defineEmits<{ choose: [guid: string]; retry: [] }>()

const { t } = useI18n()
function gt(key: string, params: Record<string, unknown> = {}): string {
  return t(`${GOODREADS_MESSAGE_ROOT}.readAlongPair.${key}`, params)
}

const swapOpen = ref(false)
const heading = computed(() => gt(props.kind === 'ebook' ? 'ebook' : 'audiobook'))

function facts(release: ReleaseCandidateItem): string[] {
  return [
    release.indexerName,
    release.sizeBytes ? formatBytes(release.sizeBytes) : null,
    release.format?.toUpperCase() ?? null,
    release.language,
    release.seeders !== null ? gt('seeders', { count: release.seeders, shown: formatNumber(release.seeders) }) : null,
    typeof release.grabs === 'number' ? gt('downloads', { count: release.grabs, shown: formatNumber(release.grabs) }) : null,
  ].filter((entry): entry is string => !!entry)
}

const why = computed(() => {
  const release = props.release
  if (!release) return []
  const match = matchReason(release)
  return [
    match ? t(`bookRequests.releases.reasons.${match.code}`) : null,
    props.kind === 'audiobook' ? gt('whyUnabridged') : gt('whyLanguage'),
  ].filter((entry): entry is string => !!entry)
})

function handleSwap() {
  swapOpen.value = !swapOpen.value
}

function handleRetry() {
  emit('retry')
}

function handleChoose(guid: string) {
  swapOpen.value = false
  emit('choose', guid)
}
</script>

<template>
  <section class="flex flex-col gap-2 rounded-lg border border-border bg-card p-3" :data-testid="`read-along-half-${kind}`">
    <header class="flex items-center gap-2 text-sm font-semibold">
      <component :is="kind === 'ebook' ? BookOpen : Headphones" class="size-4" aria-hidden="true" />{{ heading }}
    </header>

    <p v-if="owned" class="text-sm text-muted-foreground">{{ gt('owned') }}</p>
    <p v-else-if="request && !pickable" class="text-sm text-muted-foreground" data-testid="read-along-half-status">
      {{ gt('alreadyMoving', { status: t(`bookRequests.status.${request.status}`) }) }}
    </p>
    <p v-else-if="searching" class="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 class="size-4 animate-spin" aria-hidden="true" />{{ gt('searching') }}
    </p>
    <p v-else-if="searchFailed" class="text-sm text-destructive">{{ gt('searchFailed') }}</p>
    <p v-else-if="!release" class="text-sm text-muted-foreground" data-testid="read-along-half-missing">
      {{ gt(`missing.${kind}.${half?.missing ?? 'noRelease'}`) }}
    </p>
    <template v-else>
      <p class="text-sm font-medium break-words text-foreground" data-testid="read-along-pick-title">{{ release.title }}</p>
      <p class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span v-for="fact in facts(release)" :key="fact">{{ fact }}</span>
      </p>
      <ul class="flex flex-wrap gap-1.5">
        <li v-for="reason in why" :key="reason" class="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{{ reason }}</li>
      </ul>

      <p v-if="grab.state === 'sent'" class="flex items-center gap-1.5 text-sm text-success" data-testid="read-along-half-sent">
        <Check class="size-4" aria-hidden="true" />{{ gt('sent') }}
      </p>
      <div
        v-else-if="grab.state === 'failed'"
        class="flex flex-wrap items-center gap-2 text-sm text-destructive"
        data-testid="read-along-half-failed"
      >
        <span>{{ gt('failed', { reason: grab.reason ?? '' }) }}</span>
        <button
          type="button"
          class="inline-flex h-7 items-center gap-1.5 rounded-md border border-input px-2 text-xs text-foreground hover:bg-muted"
          data-testid="read-along-retry"
          @click="handleRetry"
        >
          <RefreshCw class="size-3.5" aria-hidden="true" />{{ gt('retry') }}
        </button>
      </div>

      <button
        v-if="grab.state !== 'sent' && grab.state !== 'sending' && (half?.ranked.length ?? 0) > 1"
        type="button"
        class="inline-flex h-7 items-center gap-1.5 self-start rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        :aria-expanded="swapOpen"
        data-testid="read-along-swap"
        @click="handleSwap"
      >
        <Repeat class="size-3.5" aria-hidden="true" />{{ gt('swap', { count: half?.ranked.length ?? 0 }) }}
      </button>
      <ul v-if="swapOpen && half" class="flex max-h-64 flex-col gap-1 overflow-y-auto" data-testid="read-along-ranked">
        <li v-for="option in half.ranked" :key="option.guid">
          <button
            type="button"
            class="flex w-full flex-col gap-0.5 rounded-md border px-2 py-1.5 text-left text-xs hover:bg-muted"
            :class="option.guid === release.guid ? 'border-primary' : 'border-border'"
            :aria-pressed="option.guid === release.guid"
            data-testid="read-along-option"
            @click="handleChoose(option.guid)"
          >
            <span class="font-medium break-words text-foreground">{{ option.title }}</span>
            <span class="text-muted-foreground">{{ facts(option).join(' · ') }}</span>
          </button>
        </li>
      </ul>
    </template>
  </section>
</template>
