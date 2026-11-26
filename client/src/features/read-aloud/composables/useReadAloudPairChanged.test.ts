import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref, type EffectScope } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { BOOK_ID, JOB_ID, errorResponse, jsonResponse, makeCapability, makeJob } from '../__tests__/fixtures'

const mocks = vi.hoisted(() => {
  const socket = { on: () => socket, off: () => socket, disconnect: () => socket }
  return { api: vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(), socket }
})

vi.mock('@/lib/api', () => ({ api: mocks.api }))
vi.mock('@/lib/socket', () => ({ createAuthenticatedSocket: () => mocks.socket }))

import { READ_ALOUD_PAIR_CHANGED_KEY, useReadAloud } from './useReadAloud'

const CAPABILITY_URL = `/api/v1/books/${BOOK_ID}/read-aloud`
const JOB_URL = `/api/v1/read-aloud-jobs/${JOB_ID}`
const REVIEW_JOB = makeJob({ status: 'awaiting_review', input: { ...makeJob().input, epubBookId: 40 } })

let scope: EffectScope | null = null

function setup(publish: (init?: RequestInit) => Response) {
  mocks.api.mockImplementation(async (input, init) => {
    const key = `${init?.method ?? 'GET'} ${String(input)}`
    if (key === `GET ${CAPABILITY_URL}`) return jsonResponse(makeCapability({ latestJob: REVIEW_JOB }))
    if (key === `GET ${JOB_URL}`) return jsonResponse(REVIEW_JOB)
    if (key === `POST ${JOB_URL}/publish`) return publish(init)
    throw new Error(`Unexpected request: ${key}`)
  })
  scope = effectScope()
  return scope.run(() => useReadAloud({ bookId: ref(BOOK_ID), enabled: ref(true), fileIds: ref([101]), viewerId: ref(1) }))!
}

beforeEach(() => {
  mocks.api.mockReset()
})

afterEach(() => {
  scope?.stop()
  scope = null
})

describe('useReadAloud publish after the pair changed', () => {
  it('explains a pair_changed refusal instead of a generic conflict', async () => {
    const result = setup(() => jsonResponse({ errorCode: 'pair_changed', message: 'changed' }, 409))
    await flushPromises()
    await expect(result.publish()).resolves.toBe(false)
    expect(result.jobErrorKey.value).toBe(READ_ALOUD_PAIR_CHANGED_KEY)
  })

  it('keeps the generic conflict message for any other 409', async () => {
    const result = setup(() => errorResponse(409))
    await flushPromises()
    await result.publish()
    expect(result.jobErrorKey.value).toBe('book.detail.files.readAloud.errors.conflict')
  })

  it('sends force only when asked to', async () => {
    const bodies: (BodyInit | null | undefined)[] = []
    const result = setup((init) => {
      bodies.push(init?.body)
      return jsonResponse({ ...REVIEW_JOB, status: 'processing', stage: 'publishing', updatedAt: '2026-01-01T03:00:00.000Z' })
    })
    await flushPromises()
    await expect(result.publish(true)).resolves.toBe(true)
    expect(bodies).toEqual([JSON.stringify({ force: true })])
  })
})
