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
      requests: { ebook: waiting(30), audiobook: waiting(31) },
      owned: [],
    })
  })

  it('resumes the one waiting half beside an owned copy', () => {
    expect(readAlongPlan(row({ ebook: waiting(30) }), [card(7, 'mp3')])).toEqual({
      kind: 'resume',
      requests: { ebook: waiting(30) },
      owned: ['audiobook'],
    })
  })

  it('resumes after a partial failure, with the half already downloading kept as it is', () => {
    const downloading = { id: 31, status: 'downloading' as const, selfServe: true }
    expect(readAlongPlan(row({ ebook: waiting(30), audiobook: downloading }), [])).toEqual({
      kind: 'resume',
      requests: { ebook: waiting(30), audiobook: downloading },
      owned: [],
    })
  })

  it('resumes beside a joined request of hers that is not self-serve', () => {
    const joined = { id: 17, status: 'approved' as const }
    expect(readAlongPlan(row({ ebook: joined, audiobook: waiting(31) }), [])).toMatchObject({ kind: 'resume', requests: { ebook: joined } })
  })

  it('lets only a moderator pick for requests that are not self-serve', () => {
    const plain = row({ ebook: { id: 17, status: 'approved' }, audiobook: { id: 18, status: 'approved' } })
    expect(readAlongPlan(plain, [])).toEqual({ kind: 'none' })
    expect(readAlongPlan(plain, [], true)).toMatchObject({ kind: 'resume' })
  })

  it('offers nothing once every half is downloading, or when both are owned', () => {
    const downloading = (id: number) => ({ id, status: 'downloading' as const, selfServe: true })
    expect(readAlongPlan(row({ ebook: downloading(30), audiobook: downloading(31) }), [], true)).toEqual({ kind: 'none' })
    expect(readAlongPlan(row(), [card(7, 'm4b'), card(8, 'epub')])).toEqual({ kind: 'none' })
  })
})
