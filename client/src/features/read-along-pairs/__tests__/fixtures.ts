import type { ReadAlongCandidate, ReadAlongCandidatesResponse, ReadAlongPair, ReadAlongRow } from '@bookorbit/types'

export function candidate(overrides: Partial<ReadAlongCandidate> = {}): ReadAlongCandidate {
  return {
    ebookBookId: 2614,
    ebookFileId: 11728,
    title: 'Circe',
    authors: ['Madeline Miller'],
    libraryId: 16,
    libraryName: 'English ebooks',
    language: 'en',
    languageMatch: 'prior',
    score: 85,
    tier: 'exact',
    reasons: ['title_exact', 'author', 'language_prior'],
    flags: [],
    otherCopies: [
      { ebookBookId: 2712, ebookFileId: 12231, libraryName: 'Shelfmark' },
      { ebookBookId: 3757, ebookFileId: 14374, libraryName: 'Shelfmark' },
      { ebookBookId: 5639, ebookFileId: 20457, libraryName: 'Readarr legacy' },
    ],
    ...overrides,
  }
}

export function pair(overrides: Partial<ReadAlongPair> = {}): ReadAlongPair {
  return {
    audiobookBookId: 2238,
    ebookBookId: 2614,
    ebookFileId: 11728,
    fileHash: 'abc',
    source: 'manual',
    language: 'en',
    pairedAt: '2026-11-26T10:00:00.000Z',
    pairedBy: 1,
    ...overrides,
  }
}

export function candidates(overrides: Partial<ReadAlongCandidatesResponse> = {}): ReadAlongCandidatesResponse {
  return { pair: null, pairState: null, candidates: [candidate()], dismissedEbookBookIds: [], dismissed: [], ...overrides }
}

export function row(overrides: Partial<ReadAlongRow> = {}): ReadAlongRow {
  return {
    audiobook: {
      bookId: 2238,
      title: 'Circe (Unabridged)',
      authors: ['Madeline Miller'],
      libraryName: 'Audiobooks',
      durationSeconds: 43_200,
      language: null,
    },
    status: 'suggested',
    pair: null,
    best: candidate(),
    candidateCount: 1,
    readAlong: null,
    activeJobId: null,
    ...overrides,
  }
}
