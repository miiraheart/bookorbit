import { describe, expect, it } from 'vitest'
import type { BookCard, BookFileRef, GoodreadsRequests } from '@bookorbit/types'
import { readAlongPlan } from '../readAlongPlan'

function card(id: number, format: string): BookCard {
  const file: BookFileRef = { id: id * 10, format, role: 'primary', sizeBytes: 1000 } as BookFileRef
  return { id, libraryId: 1, status: 'present', title: 'Verity', authors: ['Colleen Hoover'], files: [file] } as unknown as BookCard
}

const row = (requests: GoodreadsRequests = {}) => ({ requests })
const waiting = (id: number) => ({ id, status: 'approved' as const, selfServe: true })

describe('readAlongPlan', () => {
  it('files both halves through the pair route when nothing is owned or asked for', () => {
    expect(readAlongPlan(row(), [])).toEqual({ kind: 'start', submission: { kind: 'pair', actionable: ['ebook', 'audiobook'] }, owned: [] })
  })

  it('skips an owned audiobook and aims the ebook at that book', () => {
    expect(readAlongPlan(row(), [card(7, 'm4b')])).toEqual({
      kind: 'start',
      submission: { kind: 'single', mediaKind: 'ebook', joinBookId: 7, state: 'new' },
      owned: ['audiobook'],
    })
  })

  it('still uses the pair route beside a request of hers, which the server joins', () => {
    const plan = readAlongPlan(row({ ebook: { id: 17, status: 'approved' } }), [])
    expect(plan).toMatchObject({ kind: 'start', submission: { kind: 'pair', actionable: ['audiobook'] } })
  })

  it('treats a cancelled request as not asked for', () => {
    expect(readAlongPlan(row({ ebook: { id: 3, status: 'cancelled' } }), [])).toMatchObject({ kind: 'start', submission: { kind: 'pair' } })
  })

  it('resumes two self-serve requests still waiting for a pick', () => {
    expect(readAlongPlan(row({ ebook: waiting(30), audiobook: waiting(31) }), [])).toEqual({
      kind: 'resume',
      requestIds: { ebook: 30, audiobook: 31 },
      owned: [],
    })
  })

  it('resumes the one waiting half beside an owned copy', () => {
    expect(readAlongPlan(row({ ebook: waiting(30) }), [card(7, 'mp3')])).toEqual({ kind: 'resume', requestIds: { ebook: 30 }, owned: ['audiobook'] })
  })

  it('offers nothing once a half is downloading, when it is not self-serve, or when both are owned', () => {
    expect(readAlongPlan(row({ ebook: waiting(30), audiobook: { id: 31, status: 'downloading', selfServe: true } }), [])).toEqual({ kind: 'none' })
    expect(readAlongPlan(row({ ebook: { id: 30, status: 'approved' }, audiobook: waiting(31) }), [])).toEqual({ kind: 'none' })
    expect(readAlongPlan(row(), [card(7, 'm4b'), card(8, 'epub')])).toEqual({ kind: 'none' })
  })
})
