import { ref, shallowRef, type Ref } from 'vue'
import type { PairEbookResponse, ReadAlongCandidatesResponse, UnpairEbookResponse } from '@bookorbit/types'

import { errorMessage } from '@/lib/api-json'
import { dismissCandidate, fetchCandidates, pairEbook, undismissCandidate, unpairEbook } from '../api/read-along-pairs.api'

export type PairTarget = { ebookBookId: number; ebookFileId: number }

export type PairOptions = { dismissPrevious?: boolean; language?: string | null }

/**
 * One audiobook's candidates for the pair sheet. Dismissed ones are always fetched, so "Show
 * dismissed" is a local toggle and an un-dismiss needs no second request to appear.
 */
export function usePairCandidates(bookId: Ref<number | null>) {
  const result = shallowRef<ReadAlongCandidatesResponse | null>(null)
  const loading = ref(false)
  const busy = ref(false)
  const error = ref<string | null>(null)
  const query = ref('')

  let generation = 0

  async function load(): Promise<void> {
    const id = bookId.value
    if (id === null) return
    const current = ++generation
    loading.value = true
    error.value = null
    try {
      const next = await fetchCandidates(id, { q: query.value.trim() || undefined, showDismissed: true })
      if (current === generation) result.value = next
    } catch (reason) {
      if (current === generation) error.value = errorMessage(reason, 'tools.readAlong.errors.candidates')
    } finally {
      if (current === generation) loading.value = false
    }
  }

  function search(next: string): Promise<void> {
    query.value = next
    return load()
  }

  function reset(): void {
    generation += 1
    result.value = null
    loading.value = false
    error.value = null
    query.value = ''
  }

  async function run<T>(fallbackKey: string, task: (id: number) => Promise<T>): Promise<T | null> {
    const id = bookId.value
    if (id === null || busy.value) return null
    busy.value = true
    error.value = null
    try {
      return await task(id)
    } catch (reason) {
      error.value = errorMessage(reason, fallbackKey)
      return null
    } finally {
      busy.value = false
    }
  }

  function pair(target: PairTarget, options: PairOptions = {}): Promise<PairEbookResponse | null> {
    return run('tools.readAlong.errors.pair', (id) =>
      pairEbook(id, {
        ebookBookId: target.ebookBookId,
        ebookFileId: target.ebookFileId,
        ...(options.dismissPrevious ? { dismissPrevious: true } : {}),
        ...(options.language ? { language: options.language } : {}),
      }),
    )
  }

  async function unpair(): Promise<UnpairEbookResponse | null> {
    const response = await run('tools.readAlong.errors.unpair', unpairEbook)
    if (response) await load()
    return response
  }

  async function dismiss(ebookBookId: number): Promise<void> {
    if (await run('tools.readAlong.errors.dismiss', (id) => dismissCandidate(id, ebookBookId))) await load()
  }

  async function undismiss(ebookBookId: number): Promise<void> {
    if (await run('tools.readAlong.errors.dismiss', (id) => undismissCandidate(id, ebookBookId))) await load()
  }

  return { result, loading, busy, error, query, load, search, reset, pair, unpair, dismiss, undismiss }
}
