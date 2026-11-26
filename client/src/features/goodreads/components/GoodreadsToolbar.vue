<script setup lang="ts">
import { BookPlus, Check, LayoutGrid, List, Pencil, Plus, Search, Trash2, XCircle } from '@lucide/vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import type { GoodreadsPage } from '../composables/useGoodreadsPage'
import { useGoodreadsSources } from '../composables/useGoodreadsSources'

/** Sources, shelf tabs, search, sort, layout and the bulk bar, around the shelf's books in the default slot. */
const props = defineProps<{ page: GoodreadsPage }>()

const gt = props.page.gt
const {
  newSourceUrl,
  addingSource,
  renamingId,
  renameText,
  removeTarget,
  sourceLabel,
  handleAddSource,
  handleStartRename,
  handleRename,
  handleRemove,
} = useGoodreadsSources(props.page.setOverview, gt)

function handleCancelRemove() {
  removeTarget.value = null
}
</script>

<template>
  <section class="flex flex-col gap-3 rounded-xl border border-border bg-card p-3" data-testid="goodreads-sources">
    <div class="flex flex-wrap items-center gap-2">
      <template v-for="entry in page.sources" :key="entry.id">
        <form v-if="renamingId === entry.id" class="flex items-center gap-1" @submit.prevent="handleRename">
          <Input v-model="renameText" class="h-8 w-48" :aria-label="gt('renamePrompt')" />
          <Button type="submit" size="sm" variant="outline"><Check class="size-3.5" aria-hidden="true" /></Button>
        </form>
        <div v-else class="flex items-center">
          <button
            type="button"
            :aria-pressed="entry.id === page.source"
            :data-testid="`goodreads-source-${entry.id}`"
            class="flex h-8 items-center gap-2 rounded-full border px-3 text-sm transition-colors"
            :class="entry.id === page.source ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground hover:bg-accent'"
            @click="page.handleSelectSource(entry.id)"
          >
            <span>{{ sourceLabel(entry) }}</span>
            <span class="text-xs opacity-80">{{ entry.total }}</span>
            <span v-if="entry.newCount > 0" class="rounded-full bg-background/20 px-1.5 text-xs font-medium">{{
              gt('newCount', { count: entry.newCount })
            }}</span>
          </button>
          <template v-if="!entry.own && entry.id === page.source">
            <Button variant="ghost" size="sm" :aria-label="gt('renameSource')" :title="gt('renameSource')" @click="handleStartRename(entry)">
              <Pencil class="size-3.5" aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="sm" :aria-label="gt('removeSource')" :title="gt('removeSource')" @click="removeTarget = entry">
              <Trash2 class="size-3.5" aria-hidden="true" />
            </Button>
          </template>
        </div>
      </template>
    </div>
    <form class="flex w-full max-w-xl items-center gap-2" data-testid="goodreads-add-source" @submit.prevent="handleAddSource">
      <Input v-model="newSourceUrl" :placeholder="gt('addSourcePlaceholder')" :aria-label="gt('addSourcePlaceholder')" />
      <Button type="submit" size="sm" variant="outline" :disabled="addingSource || !newSourceUrl.trim()">
        <Plus class="size-3.5" aria-hidden="true" />{{ gt('addSource') }}
      </Button>
    </form>
    <p v-if="page.currentSource?.lastError" class="text-xs text-destructive">{{ gt('sourceError', { error: page.currentSource.lastError }) }}</p>
  </section>

  <nav v-if="page.shelves.length > 0" class="flex flex-wrap gap-2" role="tablist" :aria-label="gt('title')">
    <button
      v-for="entry in page.shelves"
      :key="entry.name"
      type="button"
      role="tab"
      :aria-selected="entry.name === page.shelf"
      :data-testid="`goodreads-tab-${entry.name}`"
      class="flex h-8 items-center gap-2 rounded-full border px-3 text-sm transition-colors"
      :class="entry.name === page.shelf ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground hover:bg-accent'"
      @click="page.handleSelectShelf(entry.name)"
    >
      <span>{{ page.shelfLabel(entry.name) }}</span>
      <span class="text-xs opacity-80">{{ entry.count }}</span>
      <span v-if="entry.newCount > 0" class="text-xs font-medium">+{{ entry.newCount }}</span>
    </button>
  </nav>

  <section class="rounded-xl border border-border bg-card" :aria-busy="page.loading">
    <div class="flex flex-wrap items-center gap-3 border-b border-border p-3">
      <div class="relative w-full max-w-sm">
        <Search class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          :model-value="page.searchText"
          class="pl-8"
          :placeholder="gt('search')"
          :aria-label="gt('search')"
          @update:model-value="page.setSearchText"
        />
      </div>
      <Select :model-value="page.sort" class="w-40" :aria-label="gt('sortLabel')" data-testid="goodreads-sort" @update:model-value="page.setSort">
        <option value="newest">{{ gt('sortNewest') }}</option>
        <option value="title">{{ gt('sortTitle') }}</option>
        <option value="author">{{ gt('sortAuthor') }}</option>
      </Select>
      <div class="flex items-center rounded-md border border-border" role="group">
        <Button
          variant="ghost"
          size="sm"
          :aria-pressed="page.viewMode === 'grid'"
          :aria-label="gt('viewGrid')"
          :title="gt('viewGrid')"
          :class="page.viewMode === 'grid' ? 'bg-accent' : ''"
          data-testid="goodreads-view-grid"
          @click="page.setViewMode('grid')"
        >
          <LayoutGrid class="size-3.5" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          :aria-pressed="page.viewMode === 'list'"
          :aria-label="gt('viewList')"
          :title="gt('viewList')"
          :class="page.viewMode === 'list' ? 'bg-accent' : ''"
          data-testid="goodreads-view-list"
          @click="page.setViewMode('list')"
        >
          <List class="size-3.5" aria-hidden="true" />
        </Button>
      </div>
      <span class="ml-auto shrink-0 text-xs text-muted-foreground">{{ gt('books', { count: page.total }) }}</span>
    </div>

    <div v-if="page.rows.length > 0" class="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2" data-testid="goodreads-bulk-toolbar">
      <label class="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          class="size-4 cursor-pointer rounded-xs border-border accent-primary"
          :checked="page.pageSelection === 'all'"
          :indeterminate.prop="page.pageSelection === 'some'"
          data-testid="goodreads-select-all"
          @change="page.handleToggleAll"
        />
        {{ gt('selectAll') }}
      </label>
      <span class="text-xs text-muted-foreground">{{ gt('selected', { count: page.selectedRows.length }) }}</span>
      <div class="ml-auto flex items-center gap-2">
        <Button size="sm" :disabled="page.bulkBusy || !page.canBulkRequest" data-testid="goodreads-bulk-request" @click="page.handleBulkRequest">
          <BookPlus class="size-3.5" aria-hidden="true" />{{ gt('bulkRequest') }}
        </Button>
        <Button
          size="sm"
          variant="outline"
          :disabled="page.bulkBusy || page.bulkCancelIds.length === 0"
          data-testid="goodreads-bulk-cancel"
          @click="page.setCancelConfirmOpen(true)"
        >
          <XCircle class="size-3.5" aria-hidden="true" />{{ gt('bulkCancel') }}
        </Button>
      </div>
    </div>

    <slot />
  </section>

  <ConfirmDialog
    :open="removeTarget !== null"
    :title="gt('removeTitle', { name: removeTarget ? sourceLabel(removeTarget) : '' })"
    :description="gt('removeDescription')"
    :confirm-label="gt('removeSource')"
    @confirm="handleRemove"
    @cancel="handleCancelRemove"
  />
</template>
