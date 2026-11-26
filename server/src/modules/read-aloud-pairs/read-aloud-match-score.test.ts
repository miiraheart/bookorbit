import {
  rankReadAlongCandidates,
  readAlongStatus,
  scoreReadAlongCandidate,
  type ReadAlongAudioBook,
  type ReadAlongEbookBook,
} from './read-aloud-match-score';

function audio(overrides: Partial<ReadAlongAudioBook> = {}): ReadAlongAudioBook {
  return {
    bookId: 2238,
    libraryId: 14,
    libraryName: 'Audiobooks - English',
    title: 'Circe (Unabridged)',
    authors: ['Madeline Miller'],
    ...overrides,
  };
}

function ebook(overrides: Partial<ReadAlongEbookBook> = {}): ReadAlongEbookBook {
  return {
    bookId: 2614,
    fileId: 11728,
    libraryId: 16,
    libraryName: 'English',
    title: 'Circe',
    authors: ['Madeline Miller'],
    language: 'en',
    ...overrides,
  };
}

const circeCopies = [
  ebook({ bookId: 2712, fileId: 12231, libraryId: 17, libraryName: 'Shelfmark Downloads' }),
  ebook(),
  ebook({ bookId: 3757, fileId: 14374, libraryId: 17, libraryName: 'Shelfmark Downloads' }),
  ebook({ bookId: 5639, fileId: 20457, libraryId: 18, libraryName: 'Readarr - English (legacy)' }),
];

describe('read-along tiers', () => {
  it('reaches exact on title, author and a library prior without any ISBN', () => {
    const [best] = rankReadAlongCandidates(audio(), [ebook()]);
    expect(best.tier).toBe('exact');
    expect(best.reasons).toEqual(['title_exact', 'author', 'language_prior']);
    expect(best.flags).toEqual([]);
  });

  it('folds the Circe copies into one exact candidate led by the English library copy', () => {
    const candidates = rankReadAlongCandidates(audio(), circeCopies);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].tier).toBe('exact');
    expect(candidates[0].ebookBookId).toBe(2614);
    expect(candidates[0].otherCopies.map((copy) => copy.ebookBookId)).toEqual([3757, 2712, 5639]);
    expect(readAlongStatus(candidates)).toBe('suggested');
  });

  it('is likely when the language is unknown on both sides and no prior helps', () => {
    const [best] = rankReadAlongCandidates(audio({ libraryName: 'Audiobooks - DBT' }), [
      ebook({ language: 'eee', libraryName: 'Shelfmark Downloads' }),
    ]);
    expect(best.tier).toBe('likely');
    expect(best.languageMatch).toBe('unknown');
  });

  it('is likely on a shared ISBN with a fuzzy title', () => {
    const [best] = rankReadAlongCandidates(audio({ title: 'Harry Potter and the Philosophers Stone', authors: [], isbn13: '978-0-7653-2635-5' }), [
      ebook({ title: 'Harry Potter and the Philosopher Stone', authors: ['J. K. Rowling'], isbn13: '9780765326355' }),
    ]);
    expect(best.tier).toBe('likely');
    expect(best.reasons).toContain('isbn');
    expect(best.reasons).toContain('title_close');
  });

  it('is maybe on a head-only title match', () => {
    const [best] = rankReadAlongCandidates(audio({ title: 'Circe' }), [ebook({ title: 'Circe: A Novel of the Witch' })]);
    expect(best.tier).toBe('maybe');
    expect(best.reasons).toContain('title_head');
  });

  it.each([
    ['part_of', { title: 'Circe (Part 1 of 2)' }, 'Circe'],
    ['dramatized', { title: 'Circe (Dramatized Adaptation)' }, 'Circe'],
    ['abridged', { title: 'Circe (Abridged)' }, 'Circe'],
    ['summary', { libraryName: 'Audiobooks - Blinkist' }, 'Circe'],
    ['omnibus_audio', { title: 'Circe Collection' }, 'Circe Collection'],
  ] as Array<[string, Partial<ReadAlongAudioBook>, string]>)('caps a %s audiobook at maybe and marks it flagged', (flag, overrides, ebookTitle) => {
    const candidates = rankReadAlongCandidates(audio(overrides), [ebook({ title: ebookTitle })]);
    expect(candidates[0].flags).toContain(flag);
    expect(candidates[0].tier).toBe('maybe');
    expect(readAlongStatus(candidates)).toBe('flagged');
  });

  it('caps an omnibus EPUB at maybe', () => {
    const [best] = rankReadAlongCandidates(audio({ title: 'Mistborn Trilogy' }), [ebook({ title: 'Mistborn Trilogy' })]);
    expect(best.flags).toEqual(expect.arrayContaining(['omnibus_audio', 'omnibus_epub']));
    expect(best.tier).toBe('maybe');
  });
});

describe('read-along rejections and conflicts', () => {
  const viciousAudio = audio({ bookId: 2494, title: 'Vicious', subtitle: 'Villains, Book 1', authors: ['V. E. Schwab'], language: 'English' });
  const viciousFr = ebook({
    bookId: 2535,
    fileId: 1,
    libraryId: 15,
    libraryName: 'French',
    title: 'Vicious',
    authors: ['V. E. Schwab'],
    language: 'fr',
  });

  it('hides an EN audiobook from a FR epub in suggestions', () => {
    expect(rankReadAlongCandidates(viciousAudio, [viciousFr])).toEqual([]);
  });

  it('returns the language conflict to a manual search with a flag', () => {
    const [found] = rankReadAlongCandidates(viciousAudio, [viciousFr], { includeHidden: true });
    expect(found.flags).toContain('language_conflict');
    expect(found.tier).toBe('maybe');
    expect(readAlongStatus([found])).toBe('none');
  });

  it('drops a same-title book by different authors', () => {
    const cbtAudio = audio({ bookId: 1966, libraryName: 'Audiobooks - DBT', title: 'Cognitive Behavioral Therapy', authors: ['Jason Lee'] });
    const cbtEpub = ebook({ bookId: 4224, title: 'Cognitive Behavioral Therapy', authors: ['Seth J. Gillihan'] });
    expect(scoreReadAlongCandidate(cbtAudio, cbtEpub)).toBeNull();
    expect(scoreReadAlongCandidate(cbtAudio, cbtEpub, true)!.candidate.score).toBeLessThan(40);
  });

  it('lets the manual search offer a book whose title the keys miss', () => {
    expect(rankReadAlongCandidates(audio(), [ebook({ title: 'The Song of Achilles' })])).toEqual([]);
    const [found] = rankReadAlongCandidates(audio(), [ebook({ title: 'The Song of Achilles' })], { includeHidden: true });
    expect(found.tier).toBe('maybe');
    expect(found.reasons).not.toContain('title_exact');
  });

  it('excludes dismissed ebooks', () => {
    expect(rankReadAlongCandidates(audio(), [ebook()], { dismissedEbookBookIds: [2614] })).toEqual([]);
  });

  it('never pairs a record with itself', () => {
    expect(rankReadAlongCandidates(audio({ bookId: 2614 }), [ebook()])).toEqual([]);
  });
});

describe('read-along series and copies', () => {
  const acofas = audio({
    bookId: 2484,
    title: 'A Court of Frost and Starlight',
    authors: ['Sarah J. Maas'],
    language: 'English',
    seriesName: 'A Court of Thorns and Roses',
    seriesIndex: '4',
  });

  it('does not veto a differing series index', () => {
    const scored = scoreReadAlongCandidate(
      acofas,
      ebook({
        bookId: 6022,
        title: 'A Court of Frost and Starlight',
        authors: ['Sarah J. Maas'],
        seriesName: 'A Court of Thorns and Roses',
        seriesIndex: '3.5',
      }),
    );
    expect(scored).not.toBeNull();
    expect(scored!.candidate.reasons).toContain('title_exact');
    expect(scored!.candidate.tier).toBe('exact');
  });

  it('keeps copies without a series index with the indexed copy', () => {
    const candidates = rankReadAlongCandidates(audio({ bookId: 2254, title: 'Empire of Silence', authors: ['Christopher Ruocchio'] }), [
      ebook({ bookId: 3338, title: 'Empire of Silence', authors: ['Christopher Ruocchio'], libraryName: 'Shelfmark Downloads', language: 'en-US' }),
      ebook({ bookId: 2699, title: 'Empire of Silence', authors: ['Christopher Ruocchio'], libraryName: 'Shelfmark Downloads', language: 'en-US' }),
      ebook({
        bookId: 5020,
        title: 'Empire of Silence',
        authors: ['Christopher Ruocchio'],
        libraryName: 'Readarr - English (legacy)',
        seriesName: 'The Sun Eater',
        seriesIndex: '1',
      }),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].tier).toBe('exact');
    expect(candidates[0].otherCopies).toHaveLength(2);
  });

  it('resolves two same-author volumes sharing a head as ambiguous', () => {
    const candidates = rankReadAlongCandidates(audio({ title: 'Throne of Glass', authors: ['Sarah J. Maas'] }), [
      ebook({ bookId: 10, title: 'Throne of Glass: Crown of Midnight', authors: ['Sarah J. Maas'], seriesName: 'Throne of Glass', seriesIndex: '2' }),
      ebook({ bookId: 11, title: 'Throne of Glass: Heir of Fire', authors: ['Sarah J. Maas'], seriesName: 'Throne of Glass', seriesIndex: '3' }),
    ]);
    expect(candidates).toHaveLength(2);
    expect(candidates.every((candidate) => candidate.tier === 'maybe')).toBe(true);
    expect(readAlongStatus(candidates)).toBe('ambiguous');
  });

  it('folds copies numbered 3.5 and 4 in the same series into one exact work', () => {
    const candidates = rankReadAlongCandidates(acofas, [
      ebook({
        bookId: 2608,
        title: 'A Court of Frost and Starlight',
        authors: ['Sarah J. Maas'],
        seriesName: 'A Court of Thorns and Roses',
        seriesIndex: '4',
      }),
      ebook({
        bookId: 6022,
        libraryName: 'Readarr - English (legacy)',
        title: 'A Court of Frost and Starlight',
        authors: ['Sarah J. Maas'],
        seriesName: 'A Court of Thorns and Roses',
        seriesIndex: '3.5',
      }),
    ]);
    expect(candidates.map((candidate) => candidate.tier)).toEqual(['exact']);
    expect(candidates[0].ebookBookId).toBe(2608);
    expect(candidates[0].otherCopies.map((copy) => copy.ebookBookId)).toEqual([6022]);
    expect(readAlongStatus(candidates)).toBe('suggested');
  });

  it('reports none without candidates', () => {
    expect(readAlongStatus([])).toBe('none');
  });
});
