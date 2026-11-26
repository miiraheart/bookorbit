<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDebounceFn } from '@vueuse/core'
import { Link2, Loader2, Search, TriangleAlert } from '@lucide/vue'
import { READ_ALOUD_QUARTZNET_LANGUAGES, type UnpairEbookResponse } from '@bookorbit/types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatLanguageName } from '@/i18n/formatters'
import PairCandidateItem from './PairCandidateItem.vue'
import UnpairReadAlongOffer from './UnpairReadAlongOffer.vue'
import { usePairCandidates, type PairTarget } from '../composables/usePairCandidates'

const props = defineProps<{ open: boolean; bookId: number | null; title?: string | null; preselect?: PairTarget | null }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; changed: []; regenerate: [bookId: number] }>()

const { t, locale } = useI18n()
const candidates = usePairCandidates(toRef(props, 'bookId'))

const selected = ref<PairTarget | null>(null)
const language = ref('')
const dismissPrevious = ref(false)
const showDismissed = ref(false)
const searchText = ref('')
const staleNotice = ref(false)
const unpaired = ref<UnpairEbookResponse | null>(null)

const result = computed(() => candidates.result.value)
const pair = computed(() => result.value?.pair ?? null)
const list = computed(() => result.value?.candidates ?? [])
const dismissed = computed(() => result.value?.dismissed ?? [])
const pairedTitle = computed(() => {
  const current = pair.value
  if (!current) return result.value?.pairHidden ? t('tools.readAlong.sheet.hiddenEbook') : null
  const match = [...list.value, ...dismissed.value].find(
    (candidate) => candidate.ebookBookId === current.ebookBookId || candidate.otherCopies.some((copy) => copy.ebookBookId === current.ebookBookId),
  )
  return match?.title ?? t('tools.readAlong.sheet.ebookNumber', { id: current.ebookBookId })
})
const changing = computed(() => pair.value !== null && selected.value !== null && selected.value.ebookBookId !== pair.value.ebookBookId)
const canSave = computed(
  () => selected.value !== null && !candidates.busy.value && (pair.value === null || selected.value.ebookFileId !== pair.value.ebookFileId),
)
const preselectListed = computed(() => {
  const target = props.preselect
  if (!target) return true
  return list.value.some(
    (candidate) => candidate.ebookFileId === target.ebookFileId || candidate.otherCopies.some((copy) => copy.ebookFileId === target.ebookFileId),
  )
})
const languageOptions = computed(() =>
  READ_ALOUD_QUARTZNET_LANGUAGES.map((code) => ({ code, name: formatLanguageName(code) })).sort((a, b) => a.name.localeCompare(b.name, locale.value)),
)

watch(
  () => [props.open, props.bookId] as const,
  ([open, bookId]) => {
    if (!open || bookId === null) return
    candidates.reset()
    searchText.value = ''
    showDismissed.value = false
    staleNotice.value = false
    unpaired.value = null
    dismissPrevious.value = false
    selected.value = props.preselect ?? null
    language.value = ''
    void candidates.load().then(() => {
      if (pair.value) language.value = pair.value.language ?? ''
      if (!selected.value) {
        const best = list.value[0]
        selected.value = pair.value
          ? { ebookBookId: pair.value.ebookBookId, ebookFileId: pair.value.ebookFileId }
          : best
            ? { ebookBookId: best.ebookBookId, ebookFileId: best.ebookFileId }
            : null
      }
    })
  },
  { immediate: true },
)

const runSearch = useDebounceFn((value: string) => candidates.search(value), 300)

function handleSearch(value: string | number): void {
  searchText.value = String(value)
  void runSearch(searchText.value)
}

function handleSelect(target: PairTarget): void {
  selected.value = target
}

/** A dismissed ebook can no longer be the one saved: the server would quietly un-dismiss it. */
async function handleDismiss(ebookBookId: number): Promise<void> {
  await candidates.dismiss(ebookBookId)
  const current = selected.value
  if (!current || !(result.value?.dismissedEbookBookIds.includes(current.ebookBookId) ?? false)) return
  const best = list.value[0]
  selected.value = best ? { ebookBookId: best.ebookBookId, ebookFileId: best.ebookFileId } : null
}

function handleLanguage(value: string | number): void {
  language.value = String(value)
}

function handleOpenChange(open: boolean): void {
  if (!open && candidates.busy.value) return
  emit('update:open', open)
}

async function handleSave(): Promise<void> {
  const target = selected.value
  if (!target || !canSave.value) return
  const response = await candidates.pair(target, { dismissPrevious: changing.value && dismissPrevious.value, language: language.value || null })
  if (!response) return
  emit('changed')
  if (response.readAlongStale) staleNotice.value = true
  else emit('update:open', false)
}

async function handleUnpair(): Promise<void> {
  const response = await candidates.unpair()
  if (!response) return
  emit('changed')
  selected.value = null
  if (response.readAlongs.length > 0) unpaired.value = response
}

function handleUnpairDone(deleted: boolean): void {
  unpaired.value = null
  if (deleted) emit('changed')
}

function handleRegenerate(): void {
  if (props.bookId !== null) emit('regenerate', props.bookId)
  emit('update:open', false)
}
</script>

<template>
  <Sheet :open="open" @update:open="handleOpenChange">
    <SheetContent
      side="bottom"
      class="h-[100dvh] max-h-[100dvh] gap-0 p-0 sm:inset-x-0 sm:mx-auto sm:h-auto sm:max-h-[90dvh] sm:w-full sm:max-w-2xl sm:rounded-t-lg"
      data-testid="pair-ebook-sheet"
    >
      <SheetHeader class="border-b border-border pe-12">
        <SheetTitle class="flex items-center gap-2"><Link2 :size="16" aria-hidden="true" />{{ t('tools.readAlong.sheet.title') }}</SheetTitle>
        <SheetDescription>{{ title ?? t('tools.readAlong.sheet.description') }}</SheetDescription>
      </SheetHeader>

      <div class="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <div
          v-if="pair || result?.pairHidden"
          class="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
          data-testid="pair-current"
        >
          <TriangleAlert v-if="result?.pairState === 'needs_attention'" class="size-4 text-[var(--pill-warning)]" aria-hidden="true" />
          <p class="min-w-0 flex-1">
            {{ t('tools.readAlong.sheet.current', { title: pairedTitle }) }}
            <span v-if="result?.pairState === 'needs_attention'" class="block text-xs text-muted-foreground">{{
              t('tools.readAlong.sheet.needsAttention')
            }}</span>
          </p>
          <Button size="sm" variant="destructive-outline" :disabled="candidates.busy.value" data-testid="pair-unpair" @click="handleUnpair">
            {{ t('tools.readAlong.actions.unpair') }}
          </Button>
        </div>
        <UnpairReadAlongOffer v-if="unpaired" :result="unpaired" @done="handleUnpairDone" />

        <label class="relative block">
          <Search class="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <span class="sr-only">{{ t('tools.readAlong.sheet.search') }}</span>
          <Input
            class="ps-8"
            :model-value="searchText"
            :placeholder="t('tools.readAlong.sheet.search')"
            data-testid="pair-search"
            @update:model-value="handleSearch"
          />
        </label>

        <div v-if="candidates.loading.value && !result" class="flex justify-center py-6" role="status">
          <Loader2 class="size-5 animate-spin text-muted-foreground" aria-hidden="true" /><span class="sr-only">{{ t('common.loading') }}</span>
        </div>
        <p v-else-if="list.length === 0" class="text-sm text-muted-foreground">{{ t('tools.readAlong.sheet.empty') }}</p>
        <p v-if="!preselectListed" class="text-xs text-muted-foreground" data-testid="pair-preselected">
          {{ t('tools.readAlong.sheet.preselected') }}
        </p>
        <ul class="space-y-2" data-testid="pair-candidates">
          <PairCandidateItem
            v-for="candidate in list"
            :key="candidate.ebookFileId"
            :candidate="candidate"
            :selected-file-id="selected?.ebookFileId ?? null"
            :busy="candidates.busy.value"
            @select="handleSelect"
            @dismiss="handleDismiss"
          />
        </ul>

        <label v-if="dismissed.length > 0 || (result?.dismissedEbookBookIds.length ?? 0) > 0" class="flex items-center gap-2 text-sm">
          <input v-model="showDismissed" type="checkbox" class="size-4 accent-primary" data-testid="pair-show-dismissed" />
          {{ t('tools.readAlong.sheet.showDismissed', { count: result?.dismissedEbookBookIds.length ?? 0 }) }}
        </label>
        <ul v-if="showDismissed" class="space-y-2" data-testid="pair-dismissed">
          <PairCandidateItem
            v-for="candidate in dismissed"
            :key="candidate.ebookFileId"
            :candidate="candidate"
            :selected-file-id="null"
            dismissed
            :busy="candidates.busy.value"
            @undismiss="candidates.undismiss"
          />
        </ul>
      </div>

      <div class="space-y-2 border-t border-border bg-background px-4 py-3">
        <div v-if="staleNotice" class="flex flex-wrap items-center gap-2 text-sm" role="status" data-testid="pair-stale">
          <p class="min-w-0 flex-1">{{ t('tools.readAlong.sheet.stale') }}</p>
          <Button size="sm" data-testid="pair-regenerate" @click="handleRegenerate">{{ t('tools.readAlong.actions.regenerate') }}</Button>
          <Button size="sm" variant="outline" @click="handleOpenChange(false)">{{ t('common.close') }}</Button>
        </div>
        <template v-else>
          <p v-if="candidates.error.value" class="text-sm text-destructive" role="alert">{{ candidates.error.value }}</p>
          <label v-if="changing" class="flex items-center gap-2 text-sm">
            <input v-model="dismissPrevious" type="checkbox" class="size-4 accent-primary" data-testid="pair-dismiss-previous" />
            {{ t('tools.readAlong.sheet.dismissPrevious') }}
          </label>
          <div class="flex flex-wrap items-center gap-2">
            <label class="flex items-center gap-1.5 text-sm">
              <span class="text-muted-foreground">{{ t('tools.readAlong.sheet.language') }}</span>
              <Select class="h-8 w-auto text-[12.5px]" :model-value="language" data-testid="pair-language" @update:model-value="handleLanguage">
                <option value="">{{ t('tools.readAlong.sheet.languageAuto') }}</option>
                <option v-for="option in languageOptions" :key="option.code" :value="option.code">{{ option.name }}</option>
              </Select>
            </label>
            <Button class="ms-auto" :disabled="!canSave" data-testid="pair-save" @click="handleSave">
              <Loader2 v-if="candidates.busy.value" class="animate-spin" aria-hidden="true" />
              {{ pair ? t('tools.readAlong.actions.change') : t('tools.readAlong.actions.pair') }}
            </Button>
          </div>
        </template>
      </div>
    </SheetContent>
  </Sheet>
</template>
