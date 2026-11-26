<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Loader2, Trash2 } from '@lucide/vue'
import type { UnpairEbookResponse } from '@bookorbit/types'

import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/api-json'
import { deleteReadAlongFile } from '../api/read-along-pairs.api'

/**
 * Shown after an unpair that left read-alongs made from the unpaired ebook. They keep working on
 * their own, so nothing is deleted unless the person asks for it here.
 */
const props = defineProps<{ result: UnpairEbookResponse }>()
const emit = defineEmits<{ done: [deleted: boolean] }>()

const { t } = useI18n()
const deleting = ref(false)
const error = ref<string | null>(null)

const count = computed(() => props.result.readAlongs.length)
const names = computed(() => props.result.readAlongs.map((file) => file.filename).join(', '))

async function handleDelete(): Promise<void> {
  if (deleting.value) return
  deleting.value = true
  error.value = null
  try {
    for (const file of props.result.readAlongs) await deleteReadAlongFile(file.fileId)
    emit('done', true)
  } catch (reason) {
    error.value = errorMessage(reason, 'tools.readAlong.errors.deleteReadAlong')
  } finally {
    deleting.value = false
  }
}

function handleKeep(): void {
  emit('done', false)
}
</script>

<template>
  <div class="flex flex-col gap-2 rounded-lg border border-border bg-secondary px-3 py-2.5 text-[12.5px]" role="status" data-testid="unpair-offer">
    <p class="text-foreground">{{ t('tools.readAlong.unpair.kept', { count, names }) }}</p>
    <p v-if="!result.canDeleteReadAlong" class="text-muted-foreground">{{ t('tools.readAlong.unpair.cannotDelete') }}</p>
    <p v-if="error" class="text-destructive" role="alert">{{ error }}</p>
    <div class="flex flex-wrap gap-2">
      <Button
        v-if="result.canDeleteReadAlong"
        size="sm"
        variant="destructive"
        :disabled="deleting"
        data-testid="unpair-delete-read-along"
        @click="handleDelete"
      >
        <Loader2 v-if="deleting" class="animate-spin" aria-hidden="true" />
        <Trash2 v-else aria-hidden="true" />
        {{ t('tools.readAlong.unpair.delete', { count }) }}
      </Button>
      <Button size="sm" variant="outline" :disabled="deleting" data-testid="unpair-keep-read-along" @click="handleKeep">
        {{ t('tools.readAlong.unpair.keep', { count }) }}
      </Button>
    </div>
  </div>
</template>
