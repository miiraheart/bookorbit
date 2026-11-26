import { computed, ref, watch } from 'vue'
import type { GoodreadsShelfRow, MetadataCandidate } from '@bookorbit/types'
import { useMetadataSearch } from '@/features/book/composables/useMetadataSearch'
import { lookupGoodreadsBook } from '../api/goodreads.api'

function titleKey(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/\s*[(:].*$/, '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLowerCase()
}

/**
 * The metadata behind a Goodreads row. The exact Goodreads book is read by its id; only when that
 * fails does a provider search stand in, by ISBN then by title, and then only results whose title matches.
 */
export function useGoodreadsBookLookup(row: () => GoodreadsShelfRow | null) {
  const { results, isStreaming, loadProviders, search } = useMetadataSearch()
  const exact = ref<MetadataCandidate | null>(null)
  const lookingUp = ref(false)
  let providersLoaded = false
  let generation = 0

  const candidates = computed<MetadataCandidate[]>(() => {
    const wanted = titleKey(row()?.title)
    return results.value.filter((candidate) => (candidate.title || candidate.description) && titleKey(candidate.title) === wanted)
  })
  const candidate = computed<MetadataCandidate | null>(() => exact.value ?? candidates.value[0] ?? null)
  const busy = computed(() => lookingUp.value || (isStreaming.value && !candidate.value))
  /** Goodreads' own cover for this edition, at full size, so it never changes with the provider that answers first. */
  const coverSrc = computed(() => row()?.coverUrl?.replace(/\._S[XY]\d+_/, '') ?? exact.value?.coverUrl ?? null)

  async function lookUp(target: GoodreadsShelfRow) {
    const mine = ++generation
    exact.value = null
    lookingUp.value = false
    if (target.goodreadsId) {
      lookingUp.value = true
      const found = await lookupGoodreadsBook(target.goodreadsId)
      if (mine !== generation) return
      lookingUp.value = false
      if (found) {
        exact.value = found
        return
      }
    }
    if (!providersLoaded) {
      await loadProviders()
      providersLoaded = true
    }
    if (mine !== generation) return
    if (target.isbn13) {
      await search({ isbn: target.isbn13, mediaKind: 'ebook', resultsPerProvider: 3 })
      if (mine !== generation || candidates.value.length > 0) return
    }
    await search({ title: target.title, author: target.authors[0] ?? '', mediaKind: 'ebook', resultsPerProvider: 3 })
  }

  watch(
    () => {
      const current = row()
      return current ? `${current.source}\u0000${current.key}` : null
    },
    () => {
      const current = row()
      if (current) void lookUp(current)
    },
    { immediate: true },
  )

  return { candidate, candidates, exact, busy, coverSrc }
}
