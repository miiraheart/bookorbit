import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { BOOK_REQUEST_MEDIA_KINDS, type BookCard, type BookRequestMediaKind, type GoodreadsItemDetail } from '@bookorbit/types'
import { usePermissions } from '@/features/auth/composables/usePermissions'
import { useRequestLanguageDefault } from '@/features/book-requests/composables/useRequestDestinationDefault'
import { ApiError, errorMessage } from '@/lib/api-json'
import { fetchGoodreadsItem, requestGoodreadsBook } from '../api/goodreads.api'
import { GOODREADS_MESSAGE_ROOT } from '../i18n'
import { isLiveRequest } from '../lib/bulk'
import { ownedFormats, rowCards } from '../lib/copies'
import { shownCopy } from '../lib/related'

/** One Goodreads book read by its source and key, so its page survives a reload, and its requests. */
export function useGoodreadsItem(source: () => string, key: () => string) {
  const { t } = useI18n()
  const { hasPermission } = usePermissions()
  const language = useRequestLanguageDefault()
  const detail = shallowRef<GoodreadsItemDetail | null>(null)
  const loading = ref(false)
  const missing = ref(false)
  const failed = ref(false)
  const requesting = ref<BookRequestMediaKind | null>(null)
  let generation = 0
  let loadedAddress: string | null = null

  const row = computed(() => detail.value?.item ?? null)
  const related = computed(() => detail.value?.related ?? [])
  const cardsById = computed<ReadonlyMap<number, BookCard>>(() => new Map((detail.value?.cards ?? []).map((card) => [card.id, card])))
  const cards = computed(() => (row.value ? rowCards(row.value, cardsById.value) : []))
  const libraryCopy = computed(() => (row.value ? shownCopy(row.value, cardsById.value) : null))
  const owned = computed(() => ownedFormats(cards.value))
  /** A kind can be requested while no copy of that format is owned and no request for it is alive. */
  const requestableKinds = computed<BookRequestMediaKind[]>(() => {
    const current = row.value
    if (!current || !hasPermission('book_request_access')) return []
    return BOOK_REQUEST_MEDIA_KINDS.filter(
      (kind) => !isLiveRequest(current.requests[kind]) && !(kind === 'ebook' ? owned.value.ebook : owned.value.audio),
    )
  })

  async function load(): Promise<void> {
    const mine = ++generation
    const address = `${source()}\u0000${key()}`
    loading.value = true
    try {
      const next = await fetchGoodreadsItem(source(), key())
      if (mine !== generation) return
      detail.value = next
      loadedAddress = address
      missing.value = false
      failed.value = false
    } catch (reason) {
      if (mine !== generation) return
      const gone = reason instanceof ApiError && reason.status === 404
      if (gone || address !== loadedAddress) detail.value = null
      missing.value = gone
      failed.value = !gone
    } finally {
      if (mine === generation) loading.value = false
    }
  }

  async function request(kind: BookRequestMediaKind): Promise<void> {
    const current = row.value
    if (!current || requesting.value) return
    requesting.value = kind
    try {
      await requestGoodreadsBook(current, language.resolveLanguage(null), kind)
      toast.success(t(`${GOODREADS_MESSAGE_ROOT}.requested`, { title: current.title }))
      await load()
    } catch (reason) {
      toast.error(errorMessage(reason, 'goodreads.requestFailed'))
    } finally {
      requesting.value = null
    }
  }

  watch(
    () => `${source()}\u0000${key()}`,
    () => void load(),
    { immediate: true },
  )
  onMounted(() => void language.load())

  return { row, related, cardsById, cards, libraryCopy, owned, requestableKinds, loading, missing, failed, requesting, load, request }
}
