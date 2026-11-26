import { ref } from 'vue'
import { toast } from 'vue-sonner'
import type { GoodreadsOverview, GoodreadsSourceSummary } from '@bookorbit/types'
import { errorMessage } from '@/lib/api-json'
import { addGoodreadsSource, removeGoodreadsSource, renameGoodreadsSource } from '../api/goodreads.api'

/** Following, renaming and unfollowing Goodreads sources; each call answers with the new overview. */
export function useGoodreadsSources(setOverview: (value: GoodreadsOverview) => void, gt: (key: string, params?: Record<string, unknown>) => string) {
  const newSourceUrl = ref('')
  const addingSource = ref(false)
  const renamingId = ref<string | null>(null)
  const renameText = ref('')
  const removeTarget = ref<GoodreadsSourceSummary | null>(null)

  function sourceLabel(entry: GoodreadsSourceSummary): string {
    return entry.own && entry.name === 'My shelves' ? gt('ownSource') : entry.name
  }

  async function handleAddSource() {
    if (!newSourceUrl.value.trim() || addingSource.value) return
    addingSource.value = true
    try {
      setOverview(await addGoodreadsSource(newSourceUrl.value))
      newSourceUrl.value = ''
      toast.success(gt('sourceAdded'))
    } catch (reason) {
      toast.error(errorMessage(reason, 'goodreads.sourceAddFailed'))
    } finally {
      addingSource.value = false
    }
  }

  function handleStartRename(entry: GoodreadsSourceSummary) {
    renamingId.value = entry.id
    renameText.value = entry.name
  }

  async function handleRename() {
    const id = renamingId.value
    if (!id || !renameText.value.trim()) return
    try {
      setOverview(await renameGoodreadsSource(id, renameText.value.trim()))
    } catch (reason) {
      toast.error(errorMessage(reason, 'goodreads.sourceRenameFailed'))
    } finally {
      renamingId.value = null
    }
  }

  async function handleRemove() {
    const target = removeTarget.value
    if (!target) return
    try {
      setOverview(await removeGoodreadsSource(target.id))
    } catch (reason) {
      toast.error(errorMessage(reason, 'goodreads.sourceRemoveFailed'))
    } finally {
      removeTarget.value = null
    }
  }

  return {
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
  }
}
