<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { AudioLines, Headphones } from '@lucide/vue'
import { Permission, type ReadAlongPairedAudiobook } from '@bookorbit/types'

import { usePermissions } from '@/features/auth/composables/usePermissions'
import { fetchPairedAudiobooks } from '../api/read-along-pairs.api'

/** In an ebook's overflow menu: the audiobooks paired with it, to open or read along with. Renders nothing without a pair. */
const props = defineProps<{ bookId: number }>()
const emit = defineEmits<{ navigate: [] }>()

const { t } = useI18n()
const { hasPermission, isDemoRestrictedAccount } = usePermissions()
const canLook = computed(() => hasPermission(Permission.LibraryGenerateReadAloud) && !isDemoRestrictedAccount.value)
const audiobooks = shallowRef<ReadAlongPairedAudiobook[]>([])

let generation = 0

async function load(): Promise<void> {
  const current = ++generation
  audiobooks.value = []
  if (!canLook.value) return
  try {
    const result = await fetchPairedAudiobooks(props.bookId)
    if (current === generation) audiobooks.value = result.audiobooks
  } catch {
    if (current === generation) audiobooks.value = []
  }
}

watch([() => props.bookId, canLook], () => void load(), { immediate: true })

function readerLink(audiobook: ReadAlongPairedAudiobook) {
  return { name: 'reader', params: { bookId: audiobook.bookId, fileId: audiobook.readAlongFileId }, query: { format: 'epub' } }
}

function handleNavigate(): void {
  emit('navigate')
}
</script>

<template>
  <template v-if="audiobooks.length > 0">
    <div class="my-1 border-t border-border" role="separator" />
    <p class="px-2 pb-0.5 pt-1 text-xs font-medium text-muted-foreground">{{ t('tools.readAlong.ebookMenu.heading') }}</p>
    <template v-for="audiobook in audiobooks" :key="audiobook.bookId">
      <RouterLink
        :to="{ name: 'book-detail', params: { bookId: audiobook.bookId } }"
        class="flex w-full items-center gap-2 rounded-xs px-2 py-1.5 text-start text-sm text-foreground transition-colors hover:bg-muted"
        data-testid="paired-audiobook-open"
        @click="handleNavigate"
      >
        <AudioLines class="size-3.5 shrink-0" aria-hidden="true" />
        <span class="min-w-0 truncate" dir="auto">{{ t('tools.readAlong.ebookMenu.open', { title: audiobook.title }) }}</span>
      </RouterLink>
      <RouterLink
        v-if="audiobook.readAlongFileId !== null"
        :to="readerLink(audiobook)"
        class="flex w-full items-center gap-2 rounded-xs px-2 py-1.5 text-start text-sm text-foreground transition-colors hover:bg-muted"
        data-testid="paired-audiobook-read-along"
        @click="handleNavigate"
      >
        <Headphones class="size-3.5 shrink-0" aria-hidden="true" />
        {{ t('tools.readAlong.ebookMenu.readAlong') }}
      </RouterLink>
    </template>
  </template>
</template>
