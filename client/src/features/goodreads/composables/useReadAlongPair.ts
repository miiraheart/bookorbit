import { computed, reactive, ref } from 'vue'
import {
  isCancellableBookRequestStatus,
  normalizeReadAlongLanguage,
  type BookRequestMediaKind,
  type GoodreadsShelfItem,
  type ReleaseCandidateItem,
} from '@bookorbit/types'
import { useBookRequestActions } from '@/features/book-requests/composables/useBookRequests'
import { useReleasePicker } from '@/features/book-requests/composables/useReleasePicker'
import { errorMessage } from '@/lib/api-json'
import { cancelGoodreadsRequests } from '../api/goodreads.api'
import { startGoodreadsReadAlong, type ReadAlongRequest } from '../api/readAlong.api'
import { rankAudiobookReleases, rankEbookReleases, type ReadAlongHalfPick } from '../lib/readAlongPick'
import { canPickFor, type ReadAlongPlan } from '../lib/readAlongPlan'

export type GrabState = { state: 'idle' | 'sending' | 'sent' | 'failed'; reason: string | null }

const IDLE: GrabState = { state: 'idle', reason: null }

/**
 * The requests behind one "Download both" press, a pick per half from each search, and the two
 * grabs. Each half keeps its own grab outcome, so a retry never sends a half twice.
 */
export function useReadAlongPair(canManage: () => boolean) {
  const pickers = { audiobook: useReleasePicker(canManage), ebook: useReleasePicker(canManage) }
  const actions = useBookRequestActions(canManage)
  const requests = ref<ReadAlongRequest[]>([])
  const owned = ref<BookRequestMediaKind[]>([])
  const workLanguage = ref<string | null>(null)
  const starting = ref(false)
  const startError = ref<string | null>(null)
  const cancelling = ref(false)
  const chosen = reactive<Record<BookRequestMediaKind, string | null>>({ audiobook: null, ebook: null })
  const grabs = reactive<Record<BookRequestMediaKind, GrabState>>({ audiobook: { ...IDLE }, ebook: { ...IDLE } })

  const requestOf = (kind: BookRequestMediaKind) => requests.value.find((entry) => entry.mediaKind === kind) ?? null
  /** A joined half already being fetched or done is shown by its status, not picked again. */
  const pickable = (kind: BookRequestMediaKind) => canPickFor(requestOf(kind) ?? undefined, canManage())
  const created = computed(() => requests.value.filter((entry) => entry.created))

  function selected(half: ReadAlongHalfPick | null, kind: BookRequestMediaKind): ReleaseCandidateItem | null {
    if (!half) return null
    return half.ranked.find((release) => release.guid === chosen[kind]) ?? half.pick
  }

  const audio = computed(() => (pickable('audiobook') ? rankAudiobookReleases(pickers.audiobook.releases.value) : null))
  const audioRelease = computed(() => selected(audio.value, 'audiobook'))
  const ebook = computed(() =>
    pickable('ebook') ? rankEbookReleases(pickers.ebook.releases.value, audioRelease.value, { language: workLanguage.value }) : null,
  )
  const ebookRelease = computed(() => selected(ebook.value, 'ebook'))
  const releaseOf = (kind: BookRequestMediaKind) => (kind === 'audiobook' ? audioRelease.value : ebookRelease.value)
  const pickOf = (kind: BookRequestMediaKind) => (kind === 'audiobook' ? audio.value : ebook.value)
  const sameLanguage = computed(() => {
    const language = normalizeReadAlongLanguage(ebookRelease.value?.language)
    return language !== null && audioRelease.value !== null && language === normalizeReadAlongLanguage(audioRelease.value.language)
  })

  const toSend = computed(() => requests.value.filter((entry) => pickable(entry.mediaKind) && grabs[entry.mediaKind].state !== 'sent'))
  const searching = computed(() => requests.value.some((entry) => pickable(entry.mediaKind) && pickers[entry.mediaKind].loading.value))
  const sending = computed(() => requests.value.some((entry) => grabs[entry.mediaKind].state === 'sending'))
  const canSend = computed(
    () => !searching.value && !sending.value && toSend.value.length > 0 && toSend.value.every((entry) => releaseOf(entry.mediaKind) !== null),
  )
  const allSent = computed(
    () => requests.value.length > 0 && toSend.value.length === 0 && requests.value.some((entry) => grabs[entry.mediaKind].state === 'sent'),
  )

  let generation = 0

  /** A press closed before its requests came back still files them, but searches nothing. */
  function stop() {
    generation++
  }

  function reset() {
    requests.value = []
    startError.value = null
    for (const kind of ['audiobook', 'ebook'] as const) {
      chosen[kind] = null
      grabs[kind] = { ...IDLE }
      pickers[kind].reset()
    }
  }

  async function search() {
    await Promise.all(requests.value.filter((entry) => pickable(entry.mediaKind)).map((entry) => pickers[entry.mediaKind].fetchReleases(entry.id)))
  }

  async function open(item: GoodreadsShelfItem, plan: Exclude<ReadAlongPlan, { kind: 'none' }>, language: string | null) {
    reset()
    owned.value = plan.owned
    workLanguage.value = language
    const mine = ++generation
    if (plan.kind === 'resume') {
      requests.value = Object.entries(plan.requests).map(([kind, state]) => ({
        mediaKind: kind as BookRequestMediaKind,
        id: state.id,
        status: state.status,
        selfServe: state.selfServe === true,
        created: false,
      }))
    } else {
      starting.value = true
      try {
        requests.value = await startGoodreadsReadAlong(item, language, plan.submission)
      } catch (reason) {
        startError.value = errorMessage(reason, 'goodreads.requestFailed')
        return
      } finally {
        starting.value = false
      }
    }
    if (mine === generation) await search()
  }

  function choose(kind: BookRequestMediaKind, guid: string) {
    chosen[kind] = guid
  }

  async function send(kind: BookRequestMediaKind, fallback: string) {
    const request = requestOf(kind)
    const release = releaseOf(kind)
    if (!request || !release || grabs[kind].state === 'sent' || grabs[kind].state === 'sending') return
    grabs[kind] = { state: 'sending', reason: null }
    try {
      const outcome = await actions.grab(request.id, { indexerId: release.indexerId, releaseGuid: release.guid })
      grabs[kind] = outcome.item ? { state: 'sent', reason: null } : { state: 'failed', reason: outcome.reason ?? fallback }
    } catch {
      grabs[kind] = { state: 'failed', reason: fallback }
    }
  }

  async function sendAll(fallback: string) {
    if (!canSend.value) return
    await Promise.all(toSend.value.map((entry) => send(entry.mediaKind, fallback)))
  }

  /** Only what this press created, never a half that already sent, and only while it can still be cancelled. */
  async function cancel(): Promise<number> {
    const ids = created.value
      .filter((entry) => grabs[entry.mediaKind].state !== 'sent' && isCancellableBookRequestStatus(entry.status))
      .map((entry) => entry.id)
    if (ids.length === 0) return 0
    cancelling.value = true
    try {
      const result = await cancelGoodreadsRequests(ids)
      return result.updated.length
    } finally {
      cancelling.value = false
    }
  }

  return {
    pickers,
    requests,
    owned,
    starting,
    startError,
    cancelling,
    grabs,
    created,
    searching,
    sending,
    canSend,
    allSent,
    requestOf,
    pickable,
    pickOf,
    releaseOf,
    sameLanguage,
    stop,
    open,
    choose,
    send,
    sendAll,
    cancel,
    reset,
  }
}

export type ReadAlongPair = ReturnType<typeof useReadAlongPair>
