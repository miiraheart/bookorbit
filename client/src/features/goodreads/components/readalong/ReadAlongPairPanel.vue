<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { Download, Loader2 } from '@lucide/vue'
import { isCancellableBookRequestStatus, Permission, type BookCard, type BookRequestMediaKind, type GoodreadsShelfRow } from '@bookorbit/types'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { usePermissions } from '@/features/auth/composables/usePermissions'
import { useRequestLanguageDefault } from '@/features/book-requests/composables/useRequestDestinationDefault'
import { errorMessage } from '@/lib/api-json'
import ReadAlongHalfCard from './ReadAlongHalfCard.vue'
import { useReadAlongPair } from '../../composables/useReadAlongPair'
import { GOODREADS_MESSAGE_ROOT } from '../../i18n'
import { readAlongPlan } from '../../lib/readAlongPlan'

/**
 * "Download both for read-along": files the missing requests as self-serve, searches both halves,
 * shows the pick for each and sends both on one press. Closing keeps the requests for later.
 */
const props = defineProps<{ open: boolean; row: GoodreadsShelfRow | null; cards: BookCard[] }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; changed: [] }>()

const { t } = useI18n()
function gt(key: string, params: Record<string, unknown> = {}): string {
  return t(`${GOODREADS_MESSAGE_ROOT}.readAlongPair.${key}`, params)
}

const { hasPermission } = usePermissions()
const language = useRequestLanguageDefault()
const canManage = () => hasPermission(Permission.ManageBookRequests)
const pair = useReadAlongPair(canManage)
const HALVES: BookRequestMediaKind[] = ['audiobook', 'ebook']

const shownHalves = computed(() => HALVES.filter((kind) => pair.owned.value.includes(kind) || pair.requestOf(kind) !== null))
const cancellable = computed(() =>
  pair.created.value.filter((entry) => pair.grabs[entry.mediaKind].state !== 'sent' && isCancellableBookRequestStatus(entry.status)),
)
const sendCount = computed(
  () => pair.requests.value.filter((entry) => pair.pickable(entry.mediaKind) && pair.grabs[entry.mediaKind].state !== 'sent').length,
)

let changeOwed = false

async function start() {
  const row = props.row
  if (!row) return
  const plan = readAlongPlan(row, props.cards, canManage())
  if (plan.kind === 'none') {
    pair.reset()
    return
  }
  await language.load()
  if (!props.open) return
  await pair.open(row, plan, language.resolveLanguage(null))
  if (changeOwed) {
    changeOwed = false
    emit('changed')
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) void start()
  },
  { immediate: true },
)

function close() {
  pair.stop()
  emit('update:open', false)
  if (pair.starting.value) changeOwed = true
  else if (pair.requests.value.length > 0) emit('changed')
}

function handleOpenChange(open: boolean) {
  if (!open) close()
}

function finishIfSent() {
  if (!pair.allSent.value) return
  toast.success(gt('allSent', { count: pair.requests.value.filter((entry) => pair.grabs[entry.mediaKind].state === 'sent').length }))
  close()
}

async function handleSend() {
  await pair.sendAll(gt('grabFailed'))
  finishIfSent()
}

async function handleRetry(kind: BookRequestMediaKind) {
  await pair.send(kind, gt('grabFailed'))
  finishIfSent()
}

function handleChoose(kind: BookRequestMediaKind, guid: string) {
  pair.choose(kind, guid)
}

async function handleCancel() {
  try {
    const cancelled = await pair.cancel()
    toast.success(gt('cancelled', { count: cancelled }))
  } catch (reason) {
    toast.error(errorMessage(reason, 'goodreads.cancelFailed'))
  }
  close()
}
</script>

<template>
  <Sheet :open="open" @update:open="handleOpenChange">
    <SheetContent side="right" class="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg" data-testid="read-along-panel">
      <SheetHeader class="border-b border-border p-4">
        <SheetTitle>{{ gt('title') }}</SheetTitle>
        <SheetDescription>{{ row?.title }}</SheetDescription>
      </SheetHeader>

      <div class="flex flex-col gap-3 p-4">
        <p v-if="pair.starting.value" class="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 class="size-4 animate-spin" aria-hidden="true" />{{ gt('creating') }}
        </p>
        <p v-else-if="pair.startError.value" class="text-sm text-destructive" data-testid="read-along-start-error">{{ pair.startError.value }}</p>
        <p v-else-if="pair.requests.value.length === 0" class="text-sm text-muted-foreground">{{ gt('nothingToDo') }}</p>
        <template v-else>
          <p class="rounded-md bg-muted px-3 py-2 text-sm text-foreground" data-testid="read-along-notice">
            {{ gt('notice', { count: pair.created.value.length }) }}
          </p>
          <ReadAlongHalfCard
            v-for="kind in shownHalves"
            :key="kind"
            :kind="kind"
            :owned="pair.owned.value.includes(kind)"
            :request="pair.requestOf(kind)"
            :pickable="pair.pickable(kind)"
            :searching="pair.pickers[kind].loading.value"
            :search-failed="pair.pickers[kind].loadFailed.value"
            :half="pair.pickOf(kind)"
            :release="pair.releaseOf(kind)"
            :grab="pair.grabs[kind]"
            :same-language="pair.sameLanguage.value"
            @choose="handleChoose(kind, $event)"
            @retry="handleRetry(kind)"
          />
        </template>
      </div>

      <footer class="flex flex-wrap items-center justify-end gap-2 border-t border-border p-4">
        <Button variant="ghost" data-testid="read-along-close" @click="close">{{ gt('close') }}</Button>
        <Button
          v-if="cancellable.length > 0"
          variant="outline"
          :disabled="pair.cancelling.value || pair.sending.value"
          data-testid="read-along-cancel"
          @click="handleCancel"
        >
          {{ gt('cancel', { count: cancellable.length }) }}
        </Button>
        <Button v-if="sendCount > 0" :disabled="!pair.canSend.value" data-testid="read-along-send" @click="handleSend">
          <Loader2 v-if="pair.sending.value" class="size-4 animate-spin" aria-hidden="true" />
          <Download v-else class="size-4" aria-hidden="true" />
          {{ gt('send', { count: sendCount }) }}
        </Button>
      </footer>
    </SheetContent>
  </Sheet>
</template>
