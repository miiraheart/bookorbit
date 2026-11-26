import { describe, expect, it } from 'vitest';

import { groupRequests, newestRequest } from './goodreads-requests';

describe('groupRequests', () => {
  it('keeps the newest request per book and media kind', () => {
    const grouped = groupRequests([
      { id: 9, status: 'pending', providerId: 'a', mediaKind: 'audiobook' },
      { id: 8, status: 'approved', providerId: 'a', mediaKind: 'ebook' },
      { id: 5, status: 'cancelled', providerId: 'a', mediaKind: 'ebook' },
      { id: 4, status: 'pending', providerId: 'b', mediaKind: 'ebook' },
      { id: 3, status: 'pending', providerId: null, mediaKind: 'ebook' },
    ]);
    expect(grouped.get('a')).toEqual({ audiobook: { id: 9, status: 'pending' }, ebook: { id: 8, status: 'approved' } });
    expect(grouped.get('b')).toEqual({ ebook: { id: 4, status: 'pending' } });
    expect(grouped.size).toBe(2);
  });

  it('marks a self-serve request, so the page can reopen its picks', () => {
    expect(groupRequests([{ id: 6, status: 'approved', providerId: 'd', mediaKind: 'audiobook', selfServe: true }]).get('d')).toEqual({
      audiobook: { id: 6, status: 'approved', selfServe: true },
    });
  });

  it('counts a retired comic request as the ebook one', () => {
    expect(groupRequests([{ id: 2, status: 'available', providerId: 'c', mediaKind: 'comic' }]).get('c')).toEqual({
      ebook: { id: 2, status: 'available' },
    });
  });
});

describe('newestRequest', () => {
  it('picks the higher id of the two kinds, or null without any', () => {
    expect(newestRequest({ ebook: { id: 3, status: 'pending' }, audiobook: { id: 7, status: 'failed' } })).toEqual({ id: 7, status: 'failed' });
    expect(newestRequest({ ebook: { id: 3, status: 'pending' } })).toEqual({ id: 3, status: 'pending' });
    expect(newestRequest({})).toBeNull();
  });
});
