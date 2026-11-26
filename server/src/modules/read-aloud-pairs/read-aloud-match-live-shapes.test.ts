import { compareReadAlongLanguages, compareReadAlongTitles, readAlongFlags, readAlongTitleKeys } from './read-aloud-match-keys';
import { buildReadAlongCorpus, ReadAlongIndexView } from './read-aloud-match-index';
import { rankReadAlongCandidates, readAlongStatus, type ReadAlongAudioBook, type ReadAlongEbookBook } from './read-aloud-match-score';
import { audioRow, epubRow } from './read-aloud-pairs.fixtures';

function audio(overrides: Partial<ReadAlongAudioBook>): ReadAlongAudioBook {
  return { bookId: 1, libraryId: 14, libraryName: 'Audiobooks - English', title: 'Untitled', authors: [], ...overrides };
}

function ebook(overrides: Partial<ReadAlongEbookBook>): ReadAlongEbookBook {
  return { bookId: 2, fileId: 20, libraryId: 16, libraryName: 'English', title: 'Untitled', authors: [], language: 'en', ...overrides };
}

const foundation = [
  ...Array.from({ length: 23 }, (_, index) => `Forward The Foundation ${String(index + 1).padStart(2, '0')}-23.mp3`),
  ...Array.from({ length: 12 }, (_, index) => `Foundation ${String(index + 1).padStart(2, '0')}-12.mp3`),
];

describe('read-along flags from audio file names', () => {
  it('flags a part file whose metadata title is clean', () => {
    const files = ['Court of Mist and Fury (Part 1 of 2), A - Sarah J. Maas & Melody Muze.m4b'];
    expect(readAlongFlags({ title: 'A Court of Mist and Fury', audioFiles: files }, 'audio')).toEqual(['part_of']);
  });

  it('flags a copy of that part file under another name through its aliases', () => {
    const flags = readAlongFlags(
      {
        title: 'A Court of Mist and Fury',
        audioFiles: ['Court of Mist and Fury, A - Sarah J. Maas.m4b'],
        audioFileAliases: ['Court of Mist and Fury (Part 1 of 2), A - Sarah J. Maas & Melody Muze.m4b'],
      },
      'audio',
    );
    expect(flags).toEqual(['part_of']);
  });

  it('does not flag a record that holds every part', () => {
    const files = ['Win Lose Kill Die (Part 1 of 2).m4b', 'Win Lose Kill Die (Part 2 of 2).m4b'];
    expect(readAlongFlags({ title: 'Win Lose Kill Die', audioFiles: files }, 'audio')).toEqual([]);
  });

  it('flags dramatized audio from a file name', () => {
    expect(readAlongFlags({ title: 'Mistborn', audioFiles: ['Mistborn (GraphicAudio) 1.mp3', 'Mistborn (GraphicAudio) 2.mp3'] }, 'audio')).toEqual([
      'dramatized',
    ]);
  });

  it('flags a folder of several books as an omnibus', () => {
    expect(readAlongFlags({ title: 'Forward the Foundation', audioFiles: foundation }, 'audio')).toEqual(['omnibus_audio']);
    const crescent = ['House of Earth and Blood The Crescent City.m4b', 'House of Flame and Shadow: Crescent City, Book 3.m4b'];
    expect(readAlongFlags({ title: 'House of Earth and Blood', audioFiles: crescent }, 'audio')).toEqual(['omnibus_audio']);
  });

  it('leaves chaptered records alone, named after the book or after the chapters', () => {
    const disquiet = ['Disquiet Gods - 01 - Opening Credits.m4b', 'Disquiet Gods - 02 - Chapter 1.m4b', 'Disquiet Gods - 03 - Chapter 2.m4b'];
    expect(readAlongFlags({ title: 'Disquiet Gods', audioFiles: disquiet }, 'audio')).toEqual([]);
    const demon = ['00 - Intro.mp3', '01 - Chapter 1 - Behold a Pale Horse.mp3', '02 - Chapter 2 - The Firstborn Son of Earth.mp3'];
    expect(readAlongFlags({ title: 'Demon in White: Sun Eater, Book 3', audioFiles: demon }, 'audio')).toEqual([]);
    const piramide = ['01 Titoli di testa.m4b', '02 Piramide Introduzione.m4b', '03 Capitolo 1.m4b', '04 Capitolo 2.m4b', '06 Epilogo.m4b'];
    expect(readAlongFlags({ title: 'Piramide', audioFiles: piramide }, 'audio')).toEqual([]);
    const twoCopies = ['Once Upon a Broken Heart - Stephanie Garber.m4b', 'Once_Upon_a_Broken_Heart.m4b'];
    expect(readAlongFlags({ title: 'Once Upon a Broken Heart', audioFiles: twoCopies }, 'audio')).toEqual([]);
  });
});

describe('read-along title flags', () => {
  it.each([
    ['Butcher & Blackbird (The Ruinous Love Trilogy - A Dark Romantic Comedy Series Book 1)', 'epub'],
    ['Harrow the Ninth: Locked Tomb Trilogy, Book 2', 'audio'],
    ['The Fury of the Gods: The Bloodsworn Trilogy, Book 3', 'audio'],
    ['Morning Star: Book III of the Red Rising Trilogy', 'epub'],
  ] as const)('reads one volume of a trilogy as a single book: %s', (title, kind) => {
    expect(readAlongFlags({ title }, kind)).toEqual([]);
  });

  it('flags a summary by its title', () => {
    expect(readAlongFlags({ title: 'Summary of Atomic Habits by James Clear', durationSeconds: 335 * 60 }, 'audio')).toEqual(['summary']);
    expect(readAlongFlags({ title: 'Atomic Habits: Summary Guide' }, 'epub')).toEqual(['summary']);
  });
});

describe('read-along languages and subtitles', () => {
  it('treats a library prior against a metadata tag as unknown, not a conflict', () => {
    expect(compareReadAlongLanguages({ language: null, libraryName: 'Audiobooks - English' }, { language: 'fr', libraryName: 'Shelfmark' })).toBe(
      'unknown',
    );
    const [best] = rankReadAlongCandidates(audio({ title: 'Les Thanatonautes', authors: ['Bernard Werber'] }), [
      ebook({ title: 'Les Thanatonautes', authors: ['Werber, Bernard'], language: 'fr', libraryName: 'Shelfmark Downloads' }),
    ]);
    expect(best).toMatchObject({ tier: 'likely', languageMatch: 'unknown', flags: [] });
  });

  it('matches a title and subtitle against one field holding both', () => {
    const audioKeys = readAlongTitleKeys('The Antidote', "Happiness for People who Can't Stand Positive Thinking");
    expect(compareReadAlongTitles(audioKeys, readAlongTitleKeys("The Antidote: Happiness for People Who Can't Stand Positive Thinking"))).toBe(
      'full',
    );
    const productivity = readAlongTitleKeys('Feel-good Productivity : How to Do More of What Matters to You (9781250865052)');
    expect(compareReadAlongTitles(readAlongTitleKeys('Feel-Good Productivity', 'How to Do More of What Matters to You'), productivity)).toBe('full');
  });
});

describe('read-along copies', () => {
  it('folds copies with and without the subtitle, and with a co-author missing, into one work', () => {
    const babel = rankReadAlongCandidates(audio({ title: 'Babel', subtitle: 'Or the Necessity of Violence', authors: ['R. F. Kuang'] }), [
      ebook({ bookId: 2603, title: 'Babel: Or the Necessity of Violence', authors: ['R. F Kuang'] }),
      ebook({ bookId: 3056, title: 'Babel', authors: ['R. F. Kuang'], libraryName: 'Shelfmark Downloads' }),
    ]);
    expect(babel.map((candidate) => [candidate.ebookBookId, candidate.tier])).toEqual([[2603, 'exact']]);
    const kingdom = rankReadAlongCandidates(audio({ title: 'Kingdom Come (Unabridged)', authors: ['J.N. Chaney', 'Terry Maggert'] }), [
      ebook({ bookId: 3685, title: 'Kingdom Come (Backyard Starship Book 7)', authors: ['J.N. Chaney', 'Terry Maggert'], libraryName: 'Shelfmark' }),
      ebook({ bookId: 5278, title: 'Kingdom Come', authors: ['J.N. Chaney'], libraryName: 'Readarr - English (legacy)' }),
    ]);
    expect(kingdom).toHaveLength(1);
    expect(readAlongStatus(kingdom)).toBe('suggested');
  });

  it('folds copies numbered 4 and 5 after a novella shifted the count', () => {
    const flames = rankReadAlongCandidates(audio({ title: 'A Court of Silver Flames', authors: ['Sarah J. Maas'] }), [
      ebook({
        bookId: 2609,
        title: 'A Court of Silver Flames',
        authors: ['Sarah J. Maas'],
        seriesName: 'A Court of Thorns and Roses',
        seriesIndex: '5',
      }),
      ebook({
        bookId: 2854,
        libraryName: 'Shelfmark Downloads',
        title: 'A Court of Silver Flames (B&N Exclusive Edition)',
        authors: ['Sarah J. Maas'],
        seriesName: 'A Court of Thorns and Roses',
        seriesIndex: '4',
      }),
    ]);
    expect(flames.map((candidate) => [candidate.ebookBookId, candidate.tier])).toEqual([[2609, 'exact']]);
  });

  it('keeps volumes more than one apart in a series as separate works', () => {
    const candidates = rankReadAlongCandidates(audio({ title: 'Dune', authors: ['Frank Herbert'] }), [
      ebook({ bookId: 10, title: 'Dune', authors: ['Frank Herbert'], seriesName: 'Dune', seriesIndex: '1' }),
      ebook({ bookId: 11, title: 'Dune', authors: ['Frank Herbert'], seriesName: 'Dune', seriesIndex: '3' }),
    ]);
    expect(candidates.map((candidate) => candidate.tier)).toEqual(['likely', 'likely']);
    expect(readAlongStatus(candidates)).toBe('ambiguous');
  });

  it('leads with the English library copy over a tagged copy in another library', () => {
    const [best] = rankReadAlongCandidates(audio({ title: "Foundation's Edge", authors: ['Isaac Asimov'] }), [
      ebook({ bookId: 59, title: "Foundation's Edge", authors: ['Isaac Asimov'], libraryName: 'Therapy' }),
      ebook({ bookId: 2637, title: "Foundation's Edge", authors: ['Isaac Asimov'], language: 'UND' }),
    ]);
    expect(best).toMatchObject({ ebookBookId: 2637, tier: 'exact' });
  });

  it('reaches an EPUB through a shared family name when the author strings differ', () => {
    const rows = [
      audioRow(2344, 'Braiding Sweetgrass - Part 01', ['Robin Wall Kimmerer/Robin Wall Kimmerer']),
      epubRow(2727, 17, 'Braiding Sweetgrass', ['Robin Kimmerer']),
    ];
    const view = new ReadAlongIndexView(buildReadAlongCorpus(rows), new Set([2344, 2727]));
    expect(view.candidatesFor(view.findAudio(2344)!).map((candidate) => candidate.ebookBookId)).toEqual([2727]);
  });
});
