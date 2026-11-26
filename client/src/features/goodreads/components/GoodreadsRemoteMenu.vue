<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { BookPlus, Download, ExternalLink, Eye, Headphones, Info, ListChecks, MoreHorizontal, MoreVertical } from '@lucide/vue'
import { BOOK_REQUEST_MEDIA_KINDS, type BookRequestMediaKind, type GoodreadsShelfRow } from '@bookorbit/types'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { GOODREADS_MESSAGE_ROOT, goodreadsRequestKeys } from '../i18n'
import { isLiveRequest } from '../lib/bulk'
import { readAlongPlan } from '../lib/readAlongPlan'

type MenuVariant = 'overlay' | 'label' | 'row'

/** The kebab of a Goodreads book that is not in the library, shared by its card and its list row. */
const props = defineProps<{
  row: GoodreadsShelfRow
  canRequest: boolean
  busy?: boolean
  selected?: boolean
  canReadAlong?: boolean
  variant: MenuVariant
}>()

const emit = defineEmits<{ request: [kind: BookRequestMediaKind]; readAlong: []; info: []; toggle: [] }>()

const { t } = useI18n()
function gt(key: string, params: Record<string, unknown> = {}): string {
  return t(`${GOODREADS_MESSAGE_ROOT}.${key}`, params)
}
const router = useRouter()

const TRIGGER_CLASS: Record<MenuVariant, string> = {
  overlay: 'px-0.75 py-1.5 rounded-md bg-black/40 hover:bg-white/30 transition-colors text-white shrink-0',
  label: 'shrink-0 p-0.5 rounded-xs text-muted-foreground hover:text-foreground transition-colors',
  row: 'p-1 rounded-xs hover:bg-muted transition-colors text-muted-foreground hover:text-foreground',
}

const requestKinds = computed(() => (props.canRequest ? BOOK_REQUEST_MEDIA_KINDS.filter((kind) => !isLiveRequest(props.row.requests[kind])) : []))
const readAlong = computed(() => (props.canReadAlong ? readAlongPlan(props.row, []).kind : 'none'))
const viewKinds = computed(() => BOOK_REQUEST_MEDIA_KINDS.filter((kind) => props.row.requests[kind]))
const goodreadsUrl = computed(() => (props.row.goodreadsId ? `https://www.goodreads.com/book/show/${props.row.goodreadsId}` : null))

function handleView(kind: BookRequestMediaKind) {
  const state = props.row.requests[kind]
  if (state) void router.push({ name: 'book-request-detail', params: { id: state.id } })
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <button
        type="button"
        :class="TRIGGER_CLASS[variant]"
        :aria-label="gt('moreActions', { title: row.title })"
        data-testid="goodreads-remote-kebab"
        @click.stop
      >
        <MoreHorizontal v-if="variant === 'row'" class="size-4" aria-hidden="true" />
        <MoreVertical v-else class="size-3.5" aria-hidden="true" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem
        v-for="kind in requestKinds"
        :key="`request-${kind}`"
        :disabled="busy"
        :data-testid="`goodreads-menu-request-${kind}`"
        @click="emit('request', kind)"
      >
        <component :is="kind === 'ebook' ? BookPlus : Headphones" class="size-4 mr-2" aria-hidden="true" />
        {{ gt(goodreadsRequestKeys(kind).request) }}
      </DropdownMenuItem>
      <DropdownMenuItem v-if="readAlong !== 'none'" :disabled="busy" data-testid="goodreads-menu-read-along" @click="emit('readAlong')">
        <Download class="size-4 mr-2" aria-hidden="true" />
        {{ gt(readAlong === 'resume' ? 'readAlongResume' : 'readAlongStart') }}
      </DropdownMenuItem>
      <DropdownMenuItem v-for="kind in viewKinds" :key="`view-${kind}`" :data-testid="`goodreads-menu-view-${kind}`" @click="handleView(kind)">
        <Eye class="size-4 mr-2" aria-hidden="true" />
        {{ gt(goodreadsRequestKeys(kind).view) }}
      </DropdownMenuItem>
      <DropdownMenuSeparator v-if="requestKinds.length > 0 || viewKinds.length > 0 || readAlong !== 'none'" />
      <DropdownMenuItem v-if="goodreadsUrl" as-child>
        <a :href="goodreadsUrl" target="_blank" rel="noopener noreferrer" data-testid="goodreads-menu-goodreads">
          <ExternalLink class="size-4 mr-2" aria-hidden="true" />
          {{ gt('detail.openGoodreads') }}
        </a>
      </DropdownMenuItem>
      <DropdownMenuItem data-testid="goodreads-menu-info" @click="emit('info')">
        <Info class="size-4 mr-2" aria-hidden="true" />
        {{ gt('bookInfo') }}
      </DropdownMenuItem>
      <DropdownMenuItem data-testid="goodreads-menu-select" @click="emit('toggle')">
        <ListChecks class="size-4 mr-2" aria-hidden="true" />
        {{ gt(selected ? 'deselect' : 'select') }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
