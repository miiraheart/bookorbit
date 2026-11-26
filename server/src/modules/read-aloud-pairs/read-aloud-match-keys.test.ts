import {
  compareAuthors,
  compareReadAlongLanguages,
  compareReadAlongTitles,
  libraryLanguagePrior,
  normalizeReadAlongLanguage,
  personTokenKey,
  readAlongFlags,
  readAlongTitleKeys,
} from './read-aloud-match-keys';

describe('read-along title keys', () => {
  it('drops edition markers and brackets', () => {
    expect(readAlongTitleKeys('Circe (Unabridged)').full).toBe('circe');
    expect(readAlongTitleKeys('A Court of Frost and Starlight (A Court of Thorns and Roses)').full).toBe('acourtoffrostandstarlight');
  });

  it('strips a leading "<series> Book N - " and a trailing " - <series>, Book N"', () => {
    expect(readAlongTitleKeys('Mistborn Book 1 - The Final Empire').full).toBe('thefinalempire');
    expect(readAlongTitleKeys('A Court of Silver Flames - A Court of Thorns and Roses Series, Book 4').full).toBe('acourtofsilverflames');
  });

  it('keeps head and tail around a colon', () => {
    const keys = readAlongTitleKeys('The Stormlight Archive 3: Oathbringer (3 of 6)');
    expect(keys).toEqual({ full: 'thestormlightarchive3oathbringer', head: 'thestormlightarchive3', tail: 'oathbringer', hasSubtitle: true });
  });

  it('treats the subtitle column as a subtitle only for head matching', () => {
    const vicious = readAlongTitleKeys('Vicious', 'Villains, Book 1');
    expect(vicious.full).toBe('vicious');
    expect(vicious.hasSubtitle).toBe(true);
    expect(compareReadAlongTitles(vicious, readAlongTitleKeys('Vicious'))).toBe('full');
  });

  it('drops keys shorter than three characters', () => {
    expect(readAlongTitleKeys('It').full).toBeNull();
  });
});

describe('read-along title comparison', () => {
  it('matches full titles', () => {
    expect(compareReadAlongTitles(readAlongTitleKeys('Circe (Unabridged)'), readAlongTitleKeys('Circe'))).toBe('full');
  });

  it('matches a tail against a bare title', () => {
    expect(compareReadAlongTitles(readAlongTitleKeys('The Stormlight Archive 3: Oathbringer (3 of 6)'), readAlongTitleKeys('Oathbringer'))).toBe(
      'head',
    );
  });

  it('matches a head only when the other side has no subtitle', () => {
    const epub = readAlongTitleKeys('Cognitive Behavioral Therapy: A Comprehensive Guide to Using CBT');
    expect(compareReadAlongTitles(readAlongTitleKeys('Cognitive Behavioral Therapy'), epub)).toBe('head');
    expect(compareReadAlongTitles(readAlongTitleKeys('Cognitive Behavioral Therapy', 'How to Build Brain Strength'), epub)).toBeNull();
  });

  it('never matches two different non-empty tails on their head', () => {
    expect(
      compareReadAlongTitles(readAlongTitleKeys('Throne of Glass: Queen of Shadows'), readAlongTitleKeys('Throne of Glass: Heir of Fire')),
    ).toBeNull();
  });

  it('matches close spellings as fuzzy', () => {
    expect(
      compareReadAlongTitles(
        readAlongTitleKeys('Harry Potter and the Philosophers Stone'),
        readAlongTitleKeys('Harry Potter and the Philosopher Stone'),
      ),
    ).toBe('fuzzy');
    expect(compareReadAlongTitles(readAlongTitleKeys('The Way of Kings'), readAlongTitleKeys('The Way of the Kings'))).toBeNull();
  });
});

describe('read-along people', () => {
  it('ignores word order, punctuation, accents and initials', () => {
    expect(personTokenKey('Gibson, Lindsay C.')).toBe(personTokenKey('Lindsay C. Gibson'));
    expect(personTokenKey('Mélissa Da Costa')).toBe(personTokenKey('Melissa Da Costa'));
  });

  it('reports overlap, conflict and unknown', () => {
    expect(compareAuthors(['Sarah J. Maas'], ['Sarah Maas'])).toBe('overlap');
    expect(compareAuthors(['Madeline Miller'], ['Brandon Sanderson'])).toBe('conflict');
    expect(compareAuthors([], ['Brandon Sanderson'])).toBe('unknown');
    expect(compareAuthors(['Judson Brewer, MD, PhD'], ['Judson Brewer'])).toBe('overlap');
    expect(compareAuthors(['Patrick McKeown; Laird Hamilton'], ['Patrick McKeown'])).toBe('overlap');
    expect(compareAuthors(['Gibson, Lindsay C.'], ['Lindsay C. Gibson'])).toBe('overlap');
  });

  it('ignores imprints and placeholders in the author field', () => {
    expect(compareAuthors(['GraphicAudio'], ['Brandon Sanderson'])).toBe('unknown');
    expect(compareAuthors(['Graphic Audio LLC.', 'Brandon Sanderson'], ['Brandon Sanderson'])).toBe('overlap');
    expect(compareAuthors(['Unknown'], ['Madeline Miller'])).toBe('unknown');
  });
});

describe('read-along languages', () => {
  it.each([
    ['English', 'en'],
    ['eng', 'en'],
    ['En', 'en'],
    ['en-US', 'en'],
    ['EN-US', 'en'],
    ['en-GB', 'en'],
    ['fre', 'fr'],
    ['fra', 'fr'],
    ['French', 'fr'],
    ['Francais', 'fr'],
    ['FR', 'fr'],
    ['Spanish', 'es'],
    ['spa', 'es'],
    ['German', 'de'],
    ['ger', 'de'],
    ['deu', 'de'],
    ['ru', 'ru'],
  ])('normalizes %s to %s', (value, expected) => {
    expect(normalizeReadAlongLanguage(value)).toBe(expected);
  });

  it.each(['eee', 'und', 'UND', 'XXX', '??', '', '  ', null, undefined])('treats %s as unknown', (value) => {
    expect(normalizeReadAlongLanguage(value)).toBeNull();
  });

  it('reads a language prior from the library name', () => {
    expect(libraryLanguagePrior('Audiobooks - English')).toBe('en');
    expect(libraryLanguagePrior('Audiobooks - French Recommandations')).toBe('fr');
    expect(libraryLanguagePrior('French - True Crime')).toBe('fr');
    expect(libraryLanguagePrior('Readarr - English (legacy)')).toBe('en');
    expect(libraryLanguagePrior('Shelfmark Downloads')).toBeNull();
    expect(libraryLanguagePrior(null)).toBeNull();
  });

  it('compares metadata first, then the library prior', () => {
    expect(compareReadAlongLanguages({ language: 'English', libraryName: null }, { language: 'en-US', libraryName: null })).toBe('equal');
    expect(compareReadAlongLanguages({ language: null, libraryName: 'Audiobooks - English' }, { language: 'en', libraryName: 'English' })).toBe(
      'prior',
    );
    expect(compareReadAlongLanguages({ language: 'English', libraryName: null }, { language: 'fr', libraryName: 'French' })).toBe('conflict');
    expect(compareReadAlongLanguages({ language: 'eee', libraryName: 'Shelfmark Downloads' }, { language: 'en', libraryName: null })).toBe('unknown');
  });
});

describe('read-along flags', () => {
  it('flags part of and dramatized audio from the raw title', () => {
    expect(readAlongFlags({ title: 'A Court of Silver Flames (Part 1 of 2) (Dramatized Adaptation)' }, 'audio')).toEqual(['part_of', 'dramatized']);
    expect(readAlongFlags({ title: 'The Stormlight Archive 3: Oathbringer (3 of 6)' }, 'audio')).toEqual(['part_of']);
    expect(readAlongFlags({ title: 'Mistborn', subtitle: 'A GraphicAudio Production' }, 'audio')).toEqual(['dramatized']);
  });

  it('flags abridged from metadata or the title, but not unabridged', () => {
    expect(readAlongFlags({ title: 'Circe (Unabridged)' }, 'audio')).toEqual([]);
    expect(readAlongFlags({ title: 'Circe (Abridged)' }, 'audio')).toEqual(['abridged']);
    expect(readAlongFlags({ title: 'Circe', abridged: true }, 'epub')).toEqual(['abridged']);
  });

  it('flags summaries by library name or short audio', () => {
    expect(readAlongFlags({ title: 'Atomic Habits', libraryName: 'Audiobooks - Blinkist' }, 'audio')).toEqual(['summary']);
    expect(readAlongFlags({ title: 'Atomic Habits', durationSeconds: 20 * 60 }, 'audio')).toEqual(['summary']);
    expect(readAlongFlags({ title: 'Atomic Habits', durationSeconds: 5 * 3600 }, 'audio')).toEqual([]);
  });

  it('flags GraphicAudio named as the author as dramatized', () => {
    expect(readAlongFlags({ title: 'The Stormlight Archive 3: Oathbringer (1 of 6)', authors: ['GraphicAudio'] }, 'audio')).toEqual([
      'part_of',
      'dramatized',
    ]);
  });

  it('reads omnibus from the title only, since the subtitle holds series labels', () => {
    expect(readAlongFlags({ title: "Assassin's Apprentice", subtitle: 'The Farseer Trilogy, Book 1 (Unabridged)' }, 'audio')).toEqual([]);
    expect(readAlongFlags({ title: 'Persephone', subtitle: 'Into Shadow collection' }, 'audio')).toEqual([]);
  });

  it('flags omnibus on each side under its own name', () => {
    expect(readAlongFlags({ title: 'The Sun Eater Books 1-3' }, 'epub')).toEqual(['omnibus_epub']);
    expect(readAlongFlags({ title: 'The Mistborn Trilogy' }, 'audio')).toEqual(['omnibus_audio']);
    expect(readAlongFlags({ title: 'Harry Potter Box Set' }, 'epub')).toEqual(['omnibus_epub']);
  });
});
