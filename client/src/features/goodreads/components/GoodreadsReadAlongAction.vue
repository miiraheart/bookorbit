<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Link2, Sparkles } from '@lucide/vue'
import { isContentBookFile, Permission, type BookCard, type ReadAlongPair } from '@bookorbit/types'

import { Button } from '@/components/ui/button'
import { usePermissions } from '@/features/auth/composables/usePermissions'
import { fetchCandidates } from '@/features/read-along-pairs/api/read-along-pairs.api'
import PairEbookSheet from '@/features/read-along-pairs/components/PairEbookSheet.vue'
import type { PairTarget } from '@/features/read-along-pairs/composables/usePairCandidates'
import { GOODREADS_MESSAGE_ROOT } from '../i18n'
import { pickCopies } from '../lib/copies'

/**
 * The ebook and the audiobook of a row are separate records: pair them, or make the read-along of
 * a pair that has none yet. A row whose copy already reads along shows its own button instead.
 */
const props = defineProps<{ cards: BookCard[] }>()

const { t } = useI18n()
const router = useRouter()
function gt(key: string): string {
  return t(`${GOODREADS_MESSAGE_ROOT}.${key}`)
}

const { hasPermission, isDemoRestrictedAccount } = usePermissions()
const canPair = computed(() => hasPermission(Permission.LibraryGenerateReadAloud) && !isDemoRestrictedAccount.value)
const copies = computed(() => pickCopies(props.cards))
const audioId = computed(() => copies.value.audio?.id ?? null)

const pair = shallowRef<ReadAlongPair | null>(null)
const state = ref<'loading' | 'ready' | 'failed'>('loading')
const sheetOpen = ref(false)

/** The ebook copy's plain EPUB, so the sheet starts on it even when the matcher missed it. */
const preselect = computed<PairTarget | null>(() => {
  const ebook = copies.value.ebook
  const file = ebook?.files.find(
    (entry) => isContentBookFile(entry) && entry.format?.toLowerCase() === 'epub' && entry.mediaOverlay?.available !== true,
  )
  return ebook && file ? { ebookBookId: ebook.id, ebookFileId: file.id } : null
})
const createLink = computed(() =>
  audioId.value === null ? null : { name: 'book-detail', params: { bookId: audioId.value }, query: { tab: 'files', readAloud: 'create' } },
)

let generation = 0

async function loadPair(): Promise<void> {
  const id = audioId.value
  if (!canPair.value || id === null) return
  const current = ++generation
  state.value = 'loading'
  try {
    const result = await fetchCandidates(id)
    if (current !== generation) return
    pair.value = result.pair
    state.value = 'ready'
  } catch {
    if (current === generation) state.value = 'failed'
  }
}

watch([audioId, canPair], () => void loadPair(), { immediate: true })

function handleOpen(): void {
  sheetOpen.value = true
}

function handleChanged(): void {
  void loadPair()
}

function handleRegenerate(): void {
  if (createLink.value) void router.push(createLink.value)
}
</script>

<template>
  <p v-if="!canPair || state === 'failed'" class="text-xs text-muted-foreground" data-testid="goodreads-read-along-note">{{ gt('readAlongNote') }}</p>
  <template v-else-if="state === 'ready'">
    <Button v-if="pair && createLink" as-child size="sm" variant="outline" class="self-start">
      <RouterLink :to="createLink" data-testid="goodreads-create-read-along"
        ><Sparkles class="size-3.5" aria-hidden="true" />{{ gt('createReadAlong') }}</RouterLink
      >
    </Button>
    <Button v-else size="sm" variant="outline" class="self-start" data-testid="goodreads-pair-ebook" @click="handleOpen">
      <Link2 class="size-3.5" aria-hidden="true" />{{ gt('pairEbook') }}
    </Button>
    <PairEbookSheet
      v-model:open="sheetOpen"
      :book-id="audioId"
      :title="copies.audio?.title ?? null"
      :preselect="preselect"
      @changed="handleChanged"
      @regenerate="handleRegenerate"
    />
  </template>
</template>
