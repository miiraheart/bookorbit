<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CreateReadAloudJobRequest } from '@bookorbit/types'

import { useAuth } from '@/features/auth/composables/useAuth'
import ReadAloudDialog from '@/features/read-aloud/components/ReadAloudDialog.vue'
import { useReadAloud } from '@/features/read-aloud/composables/useReadAloud'
import { readAloudEntryNote, resolveReadAloudEntry } from '@/features/read-aloud/lib/read-aloud'

/**
 * Opens the book page's own Read Aloud dialog for one audiobook from a list. Availability is
 * checked only once asked, so a page of rows never makes one request per row.
 */
const props = defineProps<{ bookId: number | null; defaultLanguage?: string | null }>()
const emit = defineEmits<{ done: [result: { created: boolean; note: string | null }] }>()

const { t } = useI18n()
const { user } = useAuth()

const activeId = computed(() => props.bookId ?? 0)
const enabled = computed(() => props.bookId !== null)
const fileIds = ref<number[]>([])
const viewerId = computed(() => user.value?.id ?? null)
const readAloud = useReadAloud({ bookId: activeId, enabled, fileIds, viewerId })
const dialogOpen = ref(false)
const createError = ref<string | null>(null)

const entry = computed(() =>
  resolveReadAloudEntry({
    enabled: enabled.value,
    capability: readAloud.capability.value,
    loadFailed: readAloud.loadFailed.value,
    job: readAloud.job.value,
  }),
)
const preferredEpubFileId = computed(() => readAloud.capability.value?.epubFiles.find((file) => file.bookId !== undefined)?.id ?? null)

watch(
  () => [props.bookId, readAloud.capability.value, readAloud.loadFailed.value] as const,
  ([bookId, capability, failed]) => {
    if (bookId === null || dialogOpen.value || (!capability && !failed)) return
    if (entry.value.kind === 'available') {
      createError.value = null
      dialogOpen.value = true
      return
    }
    const note = readAloudEntryNote(entry.value, { failedChecks: readAloud.failedChecks.value, jobCardShown: false }, t)
    emit('done', { created: false, note: note ?? t('book.detail.files.readAloud.reasons.unknown') })
  },
)

function handleClose(): void {
  if (readAloud.action.value === 'create') return
  dialogOpen.value = false
  emit('done', { created: false, note: null })
}

async function handleCreate(input: CreateReadAloudJobRequest): Promise<void> {
  createError.value = null
  const result = await readAloud.create(input)
  if (!result.ok) {
    createError.value = result.errorKey
    return
  }
  dialogOpen.value = false
  emit('done', { created: true, note: null })
}
</script>

<template>
  <ReadAloudDialog
    v-if="readAloud.capability.value && bookId !== null"
    :open="dialogOpen"
    :capability="readAloud.capability.value"
    :default-language="defaultLanguage ?? null"
    :initial="null"
    :preferred-epub-file-id="preferredEpubFileId"
    :busy="readAloud.action.value === 'create'"
    :error="createError"
    @close="handleClose"
    @create="handleCreate"
  />
</template>
