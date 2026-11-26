import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { useIntervalFn } from '@vueuse/core'
import { toast } from 'vue-sonner'
import type { GoodreadsOverview, GoodreadsSourceSummary } from '@bookorbit/types'
import { formatRelativeTimeFromNow } from '@/i18n/formatters'
import { errorMessage } from '@/lib/api-json'
import { requestGoodreadsSync } from '../api/goodreads.api'

interface GoodreadsSyncOptions {
  overview: Ref<GoodreadsOverview | null>
  sources: ComputedRef<GoodreadsSourceSummary[]>
  gt: (key: string, params?: Record<string, unknown>) => string
  loadOverview: () => Promise<void>
  loadRows: (append?: boolean) => Promise<void>
}

/** The Sync now button, its label, and the poll that waits for the job outside the app. */
export function useGoodreadsSync({ overview, sources, gt, loadOverview, loadRows }: GoodreadsSyncOptions) {
  const syncing = ref(false)

  const syncLabel = computed(() => {
    const synced = overview.value?.lastSyncedAt
    return synced ? gt('lastSynced', { time: formatRelativeTimeFromNow(synced) }) : gt('neverSynced')
  })
  const syncPending = computed(() => {
    const requested = overview.value?.syncRequestedAt
    if (!requested) return null
    const synced = overview.value?.lastSyncedAt
    return !synced || requested > synced ? gt('syncPending', { time: formatRelativeTimeFromNow(requested) }) : null
  })

  async function handleSync() {
    syncing.value = true
    try {
      overview.value = await requestGoodreadsSync()
      toast.success(gt('syncQueued'))
    } catch (reason) {
      toast.error(errorMessage(reason, 'goodreads.syncFailed'))
    } finally {
      syncing.value = false
    }
  }

  /** The sync runs outside the app, so the page polls until the job has written the new snapshot. */
  const syncPoll = useIntervalFn(
    async () => {
      await loadOverview()
      if (syncPending.value) return
      syncPoll.pause()
      await loadRows(false)
      const fresh = sources.value.reduce((sum, entry) => sum + entry.newCount, 0)
      toast.success(gt('syncDone', { count: fresh }))
    },
    10_000,
    { immediate: false },
  )
  watch(
    syncPending,
    (pending) => {
      if (pending) syncPoll.resume()
    },
    { immediate: true },
  )

  return { syncing, syncLabel, syncPending, handleSync }
}
