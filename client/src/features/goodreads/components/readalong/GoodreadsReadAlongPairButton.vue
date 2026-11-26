<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Download, ListChecks } from '@lucide/vue'
import type { BookCard, GoodreadsShelfRow } from '@bookorbit/types'
import ReadAlongPairPanel from './ReadAlongPairPanel.vue'
import { useCanReadAlong } from '../../composables/useCanReadAlong'
import { GOODREADS_MESSAGE_ROOT } from '../../i18n'
import { readAlongPlan } from '../../lib/readAlongPlan'

/** The book page's "Download both for read-along", or "Pick releases" when its requests are waiting. */
const props = defineProps<{ row: GoodreadsShelfRow; cards: BookCard[] }>()
const emit = defineEmits<{ changed: [] }>()

const { t } = useI18n()
const canReadAlong = useCanReadAlong()
const plan = computed(() => (canReadAlong.value ? readAlongPlan(props.row, props.cards).kind : 'none'))
const panelOpen = ref(false)

function handleOpen() {
  panelOpen.value = true
}

function handleOpenChange(open: boolean) {
  panelOpen.value = open
}

function handleChanged() {
  emit('changed')
}
</script>

<template>
  <template v-if="plan !== 'none' || panelOpen">
    <button
      type="button"
      class="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      data-testid="goodreads-detail-read-along"
      @click="handleOpen"
    >
      <ListChecks v-if="plan === 'resume'" class="size-4" aria-hidden="true" />
      <Download v-else class="size-4" aria-hidden="true" />
      {{ t(`${GOODREADS_MESSAGE_ROOT}.${plan === 'resume' ? 'readAlongResume' : 'readAlongStart'}`) }}
    </button>
    <ReadAlongPairPanel :open="panelOpen" :row="row" :cards="cards" @update:open="handleOpenChange" @changed="handleChanged" />
  </template>
</template>
