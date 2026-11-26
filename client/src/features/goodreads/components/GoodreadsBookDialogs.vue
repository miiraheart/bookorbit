<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import SelectionActionBar from '@/components/SelectionActionBar.vue'
import BookQuickView from '@/features/book/components/BookQuickView.vue'
import BulkEditMetadataDialog from '@/features/book/components/BulkEditMetadataDialog.vue'
import DeleteBookDialog from '@/features/book/components/DeleteBookDialog.vue'
import MetadataExportDialog from '@/features/book/components/MetadataExportDialog.vue'
import MoveToLibrarySheet from '@/features/book/components/MoveToLibrarySheet.vue'
import AddToCollectionSheet from '@/features/collection/components/AddToCollectionSheet.vue'
import SendBookDialog from '@/features/email/components/SendBookDialog.vue'
import GoodreadsOwnedSheet from './GoodreadsOwnedSheet.vue'
import type { GoodreadsLibrary } from '../composables/useGoodreadsLibrary'

const MergeBooksSheet = defineAsyncComponent(() => import('@/features/book/components/merge/MergeBooksSheet.vue'))
const LinkBooksSheet = defineAsyncComponent(() => import('@/features/book/components/link/LinkBooksSheet.vue'))

/**
 * The library's selection bar and book sheets for owned Goodreads copies, the same set BookListDialogs
 * mounts. That one needs a whole library listing page; this page has a shell and no listing scope.
 */
defineProps<{ library: GoodreadsLibrary }>()
</script>

<template>
  <BookQuickView
    :book-id="library.quickViewBookId"
    :open="library.quickViewOpen"
    @update:open="library.setQuickViewOpen"
    @action="library.handleQuickViewAction"
  />

  <GoodreadsOwnedSheet
    :row="library.ownedSheetRow"
    :cards="library.ownedSheetCards"
    :book-id="library.ownedSheetBookId"
    :open="library.ownedSheetOpen"
    @update:open="library.setOwnedSheetOpen"
    @update:book-id="library.setOwnedSheetBook"
    @update:book="library.handleTableBookUpdate"
  />

  <SelectionActionBar
    :metadata-editable="library.canEditSelectionMetadata"
    :visible="library.selectionMode"
    :count="library.selectedCount"
    :in-flight="library.inFlight"
    :merge="library.mergeSelection"
    :link="library.linkSelection"
    :linked-selected="library.selectionHasLinked"
    :other-editions="library.selectionOtherEditions"
    @send="library.openSendBook"
    @download="library.handleDownloadFiles"
    @export-metadata="library.openMetadataExport"
    @add-to-collection="library.openAddToCollection"
    @edit="library.handleEditSelected"
    @edit-individually="library.handleEditIndividually"
    @refresh-metadata="library.handleBulkRefreshMetadata"
    @re-extract-cover="library.handleBulkReExtractCover"
    @embed-audio-cover="library.handleBulkEmbedAudioCover"
    @set-status="library.handleBulkSetStatus"
    @set-rating="library.handleBulkSetRating"
    @set-field="library.handleBulkSetField"
    @lock-metadata="library.handleBulkSetMetadataLock"
    @delete="library.handleDeleteSelected"
    @move-to-library="library.openMoveForSelection"
    @merge="library.openMergeForSelection"
    @link="library.openLinkForSelection"
    @exit="library.exitSelection"
    @cancel-in-flight="library.cancelInFlight"
    @hide-in-flight="library.hideInFlight"
  />

  <MetadataExportDialog
    :open="library.metadataExportOpen"
    view-type="library"
    :selected-book-ids="[...library.selectedIds]"
    :selected-count="library.selectedCount"
    :total-count="library.selectedCount"
    default-scope="selected"
    @update:open="library.setMetadataExportOpen"
  />

  <AddToCollectionSheet
    :open="library.addToCollectionOpen"
    :selection-payload="{ bookIds: [...library.selectedIds] }"
    :selected-count="library.selectedCount"
    @update:open="library.setAddToCollectionOpen"
    @done="library.exitSelectionMode"
  />

  <MoveToLibrarySheet
    :open="library.moveToLibraryOpen"
    :selection-payload="library.movePayload"
    :selected-count="library.moveCount"
    @update:open="library.setMoveOpen"
    @moved="library.handleBooksMoved"
  />

  <BulkEditMetadataDialog
    :open="library.bulkEditOpen"
    :book-count="library.bulkEditCount"
    :submitting="library.bulkEditSubmitting"
    @update:open="library.setBulkEditOpen"
    @confirm="library.handleBulkEditConfirm"
  />

  <SendBookDialog
    :open="library.sendBookOpen"
    :selection-payload="{ bookIds: [...library.selectedIds] }"
    :selected-count="library.selectedCount"
    @update:open="library.setSendBookOpen"
    @sent="library.exitSelectionMode"
  />

  <DeleteBookDialog
    :open="library.deleteBookId !== null"
    :deleting="library.deletingBook"
    :linked="library.pendingDeleteLinked"
    :editions="library.deleteEditions"
    @confirm="library.confirmDelete"
    @cancel="library.cancelDelete"
  />

  <LinkBooksSheet
    v-if="library.linkBookIds.length > 0"
    :open="library.linkOpen"
    :book-ids="library.linkBookIds"
    :books="library.linkBooks"
    :seed-books="library.linkSeedBooks"
    @update:open="library.setLinkOpen"
    @linked="library.handleBooksLinked"
  />

  <MergeBooksSheet
    v-if="library.mergeBookIds.length > 0"
    :open="library.mergeOpen"
    :book-ids="library.mergeBookIds"
    @update:open="library.setMergeOpen"
    @link-instead="library.switchMergeToLink"
    @merged="library.handleBooksMerged"
  />
</template>
