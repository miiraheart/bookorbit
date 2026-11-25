import { watch, type WritableComputedRef } from 'vue'
import type { Locale } from '@bookorbit/types'
import { i18n, type MessageSchema } from '@/i18n'
import { compileIcuCatalog } from '@/i18n/icu'

/**
 * Kept beside the feature instead of in the locale catalogs, which upstream rewrites constantly:
 * the fork's patches have to keep applying on top of every new release.
 */
const EN = {
  title: 'Goodreads',
  eyebrow: 'Reading',
  lastSynced: 'Synced {time}',
  neverSynced: 'Not synced yet',
  syncNow: 'Sync now',
  syncQueued: 'Sync requested. It runs within a minute.',
  syncPending: 'Sync requested {time}',
  syncFailed: 'Could not request a sync',
  search: 'Search this shelf',
  inLibrary: 'In library',
  request: 'Request',
  requested: 'Request created for {title}',
  requestFailed: 'Could not create the request',
  openRequest: 'Open request',
  empty: 'No books on this shelf',
  emptySearch: 'No book on this shelf matches your search',
  noSnapshot: 'Your Goodreads shelves have not been synced yet. Use Sync now.',
  loadFailed: 'Could not load your Goodreads shelves',
  readOn: 'Read {date}',
  rating: 'Your rating: {rating} of 5',
  more: 'Show more',
  books: '{count, plural, one {# book} other {# books}}',
  shelves: {
    'currently-reading': 'Currently reading',
    'read-next': 'Read next',
    'to-read': 'Want to read',
    'next-in-series': 'Next in series',
    read: 'Read',
    'did-not-finish': 'Did not finish',
    paused: 'Paused',
  },
}

const FR: typeof EN = {
  title: 'Goodreads',
  eyebrow: 'Lecture',
  lastSynced: 'Synchronisé {time}',
  neverSynced: 'Pas encore synchronisé',
  syncNow: 'Synchroniser',
  syncQueued: 'Synchronisation demandée. Elle démarre dans la minute.',
  syncPending: 'Synchronisation demandée {time}',
  syncFailed: 'Impossible de demander la synchronisation',
  search: 'Rechercher dans cette étagère',
  inLibrary: 'Dans la bibliothèque',
  request: 'Demander',
  requested: 'Demande créée pour {title}',
  requestFailed: 'Impossible de créer la demande',
  openRequest: 'Voir la demande',
  empty: 'Aucun livre sur cette étagère',
  emptySearch: 'Aucun livre de cette étagère ne correspond à la recherche',
  noSnapshot: 'Vos étagères Goodreads ne sont pas encore synchronisées. Utilisez Synchroniser.',
  loadFailed: 'Impossible de charger vos étagères Goodreads',
  readOn: 'Lu le {date}',
  rating: 'Votre note : {rating} sur 5',
  more: 'Afficher plus',
  books: '{count, plural, one {# livre} other {# livres}}',
  shelves: {
    'currently-reading': 'En cours',
    'read-next': 'À lire ensuite',
    'to-read': 'À lire',
    'next-in-series': 'Suite de série',
    read: 'Lus',
    'did-not-finish': 'Abandonnés',
    paused: 'En pause',
  },
}

export const GOODREADS_MESSAGE_ROOT = 'goodreads'
export const GOODREADS_TITLE_KEY = `${GOODREADS_MESSAGE_ROOT}.title`

function catalogFor(locale: string) {
  return { [GOODREADS_MESSAGE_ROOT]: locale.toLowerCase().startsWith('fr') ? FR : EN }
}

export function mergeGoodreadsMessages(locale: Locale): void {
  i18n.global.mergeLocaleMessage(locale, compileIcuCatalog(catalogFor(locale), locale) as unknown as MessageSchema)
}

let installed = false

/** Merges after every locale switch: a catalog loads before its locale activates, so the merge lands on top of it. */
export function installGoodreadsMessages(): void {
  if (installed) return
  installed = true
  watch(() => (i18n.global.locale as WritableComputedRef<Locale>).value, mergeGoodreadsMessages, { immediate: true })
}

/** A shelf Goodreads names itself gets a translated label; a custom shelf keeps its own name. */
export function goodreadsShelfLabelKey(shelf: string): string | null {
  return shelf in EN.shelves ? `${GOODREADS_MESSAGE_ROOT}.shelves.${shelf}` : null
}
