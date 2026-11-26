import {
  dismissedFor,
  dismissReadAlongCandidate,
  emptyReadAlongPairsStore,
  parseReadAlongPairsStore,
  removeReadAlongPair,
  serializeReadAlongPairsStore,
  setReadAlongPair,
  toReadAlongPair,
  undismissReadAlongCandidate,
} from './read-aloud-pairs-store';

const entry = { ebookBookId: 2614, ebookFileId: 11728, fileHash: 'abc', pairedAt: '2026-11-26T10:00:00.000Z', pairedBy: 1 };

describe('read-along pairs store', () => {
  it('starts empty when no value is stored', () => {
    expect(parseReadAlongPairsStore(null)).toEqual(emptyReadAlongPairsStore());
    expect(parseReadAlongPairsStore('')).toEqual(emptyReadAlongPairsStore());
  });

  it('round trips pairs and dismissals', () => {
    const store = emptyReadAlongPairsStore();
    setReadAlongPair(store, 2238, { ...entry, source: 'accepted', language: 'en' });
    dismissReadAlongCandidate(store, 2238, 2712);
    dismissReadAlongCandidate(store, 2238, 2712);

    const back = parseReadAlongPairsStore(serializeReadAlongPairsStore(store));
    expect(back).toEqual(store);
    expect(dismissedFor(back, 2238)).toEqual([2712]);
    expect(toReadAlongPair(2238, back.pairs['2238'])).toEqual({
      audiobookBookId: 2238,
      ebookBookId: 2614,
      ebookFileId: 11728,
      fileHash: 'abc',
      source: 'accepted',
      language: 'en',
      pairedAt: entry.pairedAt,
      pairedBy: 1,
    });
  });

  it('reads the documented shape without the optional fields', () => {
    const store = parseReadAlongPairsStore(JSON.stringify({ version: 1, pairs: { '2238': entry }, dismissed: { '2238': [2712] } }));
    expect(store.pairs['2238']).toEqual({ ...entry, source: 'manual', language: null });
  });

  it('undismisses and drops the empty list', () => {
    const store = emptyReadAlongPairsStore();
    dismissReadAlongCandidate(store, 2238, 2712);
    expect(undismissReadAlongCandidate(store, 2238, 2712)).toBe(true);
    expect(undismissReadAlongCandidate(store, 2238, 2712)).toBe(false);
    expect(store.dismissed).toEqual({});
  });

  it('removes a pair and returns it', () => {
    const store = emptyReadAlongPairsStore();
    setReadAlongPair(store, 2238, entry);
    expect(removeReadAlongPair(store, 2238)).toEqual(entry);
    expect(removeReadAlongPair(store, 2238)).toBeNull();
  });

  it('skips malformed entries but keeps the rest', () => {
    const store = parseReadAlongPairsStore(
      JSON.stringify({ version: 1, pairs: { '2238': entry, '9': { ebookBookId: 'x' }, abc: entry }, dismissed: { '2238': [1, 'x', 1] } }),
    );
    expect(Object.keys(store.pairs)).toEqual(['2238']);
    expect(store.dismissed).toEqual({ '2238': [1] });
    const written = JSON.parse(serializeReadAlongPairsStore(store));
    expect(written.pairs).toMatchObject({ '9': { ebookBookId: 'x' }, abc: entry });
  });

  it('throws on unreadable JSON or an unknown version so a write never wipes the pairs', () => {
    expect(() => parseReadAlongPairsStore('{not json')).toThrow();
    expect(() => parseReadAlongPairsStore(JSON.stringify({ version: 2, pairs: {} }))).toThrow(/unsupported version/);
    expect(() => parseReadAlongPairsStore('[]')).toThrow();
  });
});
