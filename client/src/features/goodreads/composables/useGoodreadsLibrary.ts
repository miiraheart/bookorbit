import { computed, reactive, ref, watch, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import type { BookCard, BookMergedEvent, GoodreadsShelfRow } from '@bookorbit/types'
import { useBookLinkSync } from '@/features/book/composables/useBookLinkSync'
import { useBookMergeSync } from '@/features/book/composables/useBookMergeSync'
import { useBookNavigation } from '@/features/book/composables/useBookNavigation'
import { useBookTableShell } from '@/features/book/composables/useBookTableShell'
import { useBulkEditMetadata, type BulkEditFields } from '@/features/book/composables/useBulkEditMetadata'
import { useMoveToLibraryTarget } from '@/features/book/composables/useMoveToLibraryTarget'
import { pickCopies, rowCards } from '../lib/copies'

type BookAction = Parameters<ReturnType<typeof useBookTableShell>['handleBookAction']>[1]

interface GoodreadsLibraryOptions {
  /** Every card on the page; writing it drops removed copies from their rows. */
  books: Ref<BookCard[]>
  rows: Ref<GoodreadsShelfRow[]>
  cardsById: Ref<ReadonlyMap<number, BookCard>>
  /** The page's own row selection, which requests and cancels still use. */
  selectedKeys: Ref<Set<string>>
  reload: () => void
}

function sameIds(left: ReadonlySet<number>, right: readonly number[]): boolean {
  return left.size === right.length && right.every((id) => left.has(id))
}

/**
 * The library shell behind the owned copies: the same quick view, collection, move, send, delete,
 * merge, link and bulk actions a library page offers. Each selected owned row stands for the copy it
 * shows, so the library selection bar acts on exactly the cards on screen.
 */
export function useGoodreadsLibrary({ books, rows, cardsById, selectedKeys, reload }: GoodreadsLibraryOptions) {
  const router = useRouter()
  const { setBookContext } = useBookNavigation()
  const selectionMode = ref(false)
  const shownByRow = ref<Map<string, number>>(new Map())

  const shell = useBookTableShell({ books, selectionMode, onMoveToLibrary: (bookId) => moveTarget.openForBook(bookId) })
  const { selectedIds, selectedCount, exitSelectionMode, deselectAll, bulkEditOpen } = shell
  const moveTarget = useMoveToLibraryTarget({ getSelectionPayload: () => ({ bookIds: [...selectedIds.value] }), selectedCount })
  const bulkEdit = useBulkEditMetadata(selectedIds, books)
  const { applyMerged } = useBookMergeSync({ books, deselect: deselectAll, refresh: reload })
  const { scheduleRefresh: scheduleLinkRefresh } = useBookLinkSync({ books, refresh: reload, affectsScope: () => true })
  const metadataExportOpen = ref(false)

  function cardsOf(row: GoodreadsShelfRow): BookCard[] {
    return rowCards(row, cardsById.value)
  }

  function shownCard(row: GoodreadsShelfRow): BookCard | null {
    const cards = cardsOf(row)
    const chosen = shownByRow.value.get(row.key)
    return cards.find((card) => card.id === chosen) ?? pickCopies(cards).primary
  }

  function setShown(rowKey: string, bookId: number) {
    shownByRow.value = new Map(shownByRow.value).set(rowKey, bookId)
  }

  const ownedSheet = ref<{ rowKey: string; bookId: number } | null>(null)
  const ownedSheetRow = computed(() => rows.value.find((row) => row.key === ownedSheet.value?.rowKey) ?? null)
  const ownedSheetCards = computed(() => (ownedSheetRow.value ? cardsOf(ownedSheetRow.value) : []))
  /** A copy that left the row hands the sheet to the row's main copy; a row with none closes it. */
  const ownedSheetBookId = computed(() => {
    const cards = ownedSheetCards.value
    return cards.find((card) => card.id === ownedSheet.value?.bookId)?.id ?? pickCopies(cards).primary?.id ?? null
  })

  function openOwnedSheet(row: GoodreadsShelfRow) {
    const shown = shownCard(row)
    if (shown) ownedSheet.value = { rowKey: row.key, bookId: shown.id }
  }

  function setOwnedSheetBook(bookId: number) {
    if (ownedSheet.value) ownedSheet.value = { ...ownedSheet.value, bookId }
  }

  function setOwnedSheetOpen(open: boolean) {
    if (!open) ownedSheet.value = null
  }

  const ownedSelection = computed(() => rows.value.flatMap((row) => (selectedKeys.value.has(row.key) ? (shownCard(row)?.id ?? []) : [])))

  // Both directions run synchronously: the shell selects a card itself for "Add to collection",
  // and an async echo could undo that toggle before the sheet reads the selection.
  watch(
    ownedSelection,
    (ids) => {
      if (!sameIds(selectedIds.value, ids)) selectedIds.value = new Set(ids)
      selectionMode.value = ids.length > 0
    },
    { flush: 'sync', immediate: true },
  )

  watch(
    selectedIds,
    (ids) => {
      if (sameIds(ids, ownedSelection.value)) return
      const keys = new Set<string>()
      for (const row of rows.value) {
        const shown = shownCard(row)
        if (shown ? ids.has(shown.id) : selectedKeys.value.has(row.key)) keys.add(row.key)
      }
      selectedKeys.value = keys
    },
    { flush: 'sync' },
  )

  function exitSelection() {
    exitSelectionMode()
    selectedKeys.value = new Set()
  }

  function handleQuickViewAction(action: BookAction) {
    const id = shell.quickViewBookId.value
    if (id !== null) shell.handleBookAction(cardsById.value.get(id) ?? ({ id } as BookCard), action)
  }

  function handleEditSelected() {
    const ids = [...selectedIds.value]
    if (ids.length === 0) return
    if (ids.length >= 2) {
      bulkEditOpen.value = true
      return
    }
    setBookContext(ids, ids.length)
    void router.push({ name: 'book-detail', params: { bookId: ids[0] }, query: { tab: 'edit' } })
    exitSelection()
  }

  async function handleBulkEditConfirm(fields: BulkEditFields) {
    if (!(await bulkEdit.submit(fields))) return
    bulkEditOpen.value = false
    reload()
  }

  function handleBooksMerged(event: BookMergedEvent) {
    applyMerged(event)
    exitSelection()
  }

  function handleBooksLinked() {
    exitSelection()
    scheduleLinkRefresh()
  }

  function setQuickViewOpen(value: boolean) {
    shell.quickViewOpen.value = value
  }

  function setAddToCollectionOpen(value: boolean) {
    shell.addToCollectionOpen.value = value
  }

  function setSendBookOpen(value: boolean) {
    shell.sendBookOpen.value = value
  }

  function setBulkEditOpen(value: boolean) {
    bulkEditOpen.value = value
  }

  function setMetadataExportOpen(value: boolean) {
    metadataExportOpen.value = value
  }

  return reactive({
    ...shell,
    selectionMode,
    cardsOf,
    shownCard,
    setShown,
    ownedSheetRow,
    ownedSheetCards,
    ownedSheetBookId,
    ownedSheetOpen: computed(() => ownedSheetBookId.value !== null),
    openOwnedSheet,
    setOwnedSheetBook,
    setOwnedSheetOpen,
    exitSelection,
    handleQuickViewAction,
    handleEditSelected,
    handleBulkEditConfirm,
    handleBooksMoved: exitSelection,
    handleBooksMerged,
    handleBooksLinked,
    bulkEditSubmitting: bulkEdit.submitting,
    bulkEditCount: bulkEdit.selectedCount,
    moveToLibraryOpen: moveTarget.open,
    movePayload: moveTarget.payload,
    moveCount: moveTarget.count,
    openMoveForSelection: moveTarget.openForSelection,
    setMoveOpen: moveTarget.setOpen,
    metadataExportOpen,
    openMetadataExport: () => setMetadataExportOpen(true),
    openAddToCollection: () => setAddToCollectionOpen(true),
    openSendBook: () => setSendBookOpen(true),
    setQuickViewOpen,
    setAddToCollectionOpen,
    setSendBookOpen,
    setBulkEditOpen,
    setMetadataExportOpen,
  })
}

export type GoodreadsLibrary = ReturnType<typeof useGoodreadsLibrary>
