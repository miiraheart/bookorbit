import { watch, type WritableComputedRef } from 'vue'
import type { BookRequestMediaKind, Locale } from '@bookorbit/types'
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
  syncPending: 'Syncing, started {time}. This page updates by itself.',
  syncDone: 'Goodreads sync finished: {count} new',
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
  notSyncedSource: 'This source has not been synced yet. It runs within a minute of being added.',
  loadFailed: 'Could not load your Goodreads shelves',
  readOn: 'Read {date}',
  firstSeen: 'Added {date}',
  newBadge: 'New',
  newCount: '{count} new',
  rating: 'Your rating: {rating} of 5',
  more: 'Show more',
  books: '{count, plural, one {# book} other {# books}}',
  ownSource: 'My shelves',
  sourceError: 'Last sync failed: {error}',
  addSource: 'Follow',
  addSourcePlaceholder: 'Paste a Goodreads profile or list link',
  sourceAdded: 'Following it now. Its books arrive within a minute.',
  sourceAddFailed: 'Could not follow that Goodreads link',
  renameSource: 'Rename',
  renamePrompt: 'New name',
  sourceRenameFailed: 'Could not rename that source',
  removeSource: 'Stop following',
  removeTitle: 'Stop following {name}?',
  removeDescription: 'Its books leave this page. Requests already made are kept.',
  sourceRemoveFailed: 'Could not remove that source',
  sortLabel: 'Sort',
  sortNewest: 'Newest first',
  sortTitle: 'Title',
  sortAuthor: 'Author',
  selectAll: 'Select all shown',
  selected: '{count} selected',
  selectBook: 'Select {title}',
  bulkRequest: 'Request',
  bulkCancel: 'Cancel requests',
  bulkRequested:
    'Requested {requested}. Skipped {owned} already in library and {already} already requested.{failed, plural, =0 {} other { # failed.}}',
  bulkCancelled:
    'Cancelled {cancelled}. Skipped {owned} in library and {notCancellable} with nothing to cancel.{failed, plural, =0 {} other { # failed.}}',
  cancelFailed: 'Could not cancel those requests',
  cancelTitle: 'Cancel {count, plural, one {# request} other {# requests}}?',
  cancelDescription: 'Only requests that have not downloaded yet are cancelled. Books already in your library are never touched.',
  viewGrid: 'Grid',
  viewList: 'List',
  openBook: 'Open {title}',
  copiesLabel: 'Owned copies',
  copyEbook: 'Ebook',
  copyAudio: 'Audiobook',
  copyBoth: 'Ebook + audio',
  copyMore: '+{count}',
  unavailableCopy: 'Unavailable copy',
  notInLibrary: 'Not in library',
  requestEbook: 'Request ebook',
  requestAudiobook: 'Request audiobook',
  viewEbookRequest: 'View ebook request',
  viewAudiobookRequest: 'View audiobook request',
  ebookRequestState: 'Ebook: {status}',
  audiobookRequestState: 'Audiobook: {status}',
  bookInfo: 'Book info',
  select: 'Select',
  deselect: 'Deselect',
  moreActions: 'More actions for {title}',
  detail: {
    series: 'Series',
    published: 'Published',
    publisher: 'Publisher',
    language: 'Language',
    pages: 'Pages',
    onGoodreads: 'Goodreads',
    openGoodreads: 'View on Goodreads',
    searching: 'Looking the book up in your metadata providers',
    noMetadata: 'No metadata provider knows this book. Its Goodreads details are shown.',
    otherEditions: 'Other results',
  },
  listShelf: 'List',
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
  syncPending: 'Synchronisation en cours, lancée {time}. La page se met à jour seule.',
  syncDone: 'Synchronisation Goodreads terminée : {count} nouveaux',
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
  notSyncedSource: 'Cette source n’est pas encore synchronisée. Elle le sera dans la minute qui suit son ajout.',
  loadFailed: 'Impossible de charger vos étagères Goodreads',
  readOn: 'Lu le {date}',
  firstSeen: 'Ajouté le {date}',
  newBadge: 'Nouveau',
  newCount: '{count} nouveaux',
  rating: 'Votre note : {rating} sur 5',
  more: 'Afficher plus',
  books: '{count, plural, one {# livre} other {# livres}}',
  ownSource: 'Mes étagères',
  sourceError: 'Échec de la dernière synchronisation : {error}',
  addSource: 'Suivre',
  addSourcePlaceholder: 'Collez un lien de profil ou de liste Goodreads',
  sourceAdded: 'Suivi. Ses livres arrivent dans la minute.',
  sourceAddFailed: 'Impossible de suivre ce lien Goodreads',
  renameSource: 'Renommer',
  renamePrompt: 'Nouveau nom',
  sourceRenameFailed: 'Impossible de renommer cette source',
  removeSource: 'Ne plus suivre',
  removeTitle: 'Ne plus suivre {name} ?',
  removeDescription: 'Ses livres quittent cette page. Les demandes déjà faites sont conservées.',
  sourceRemoveFailed: 'Impossible de retirer cette source',
  sortLabel: 'Tri',
  sortNewest: 'Plus récents',
  sortTitle: 'Titre',
  sortAuthor: 'Auteur',
  selectAll: 'Tout sélectionner (affichés)',
  selected: '{count} sélectionnés',
  selectBook: 'Sélectionner {title}',
  bulkRequest: 'Demander',
  bulkCancel: 'Annuler les demandes',
  bulkRequested:
    '{requested} demandés. Ignorés : {owned} déjà dans la bibliothèque, {already} déjà demandés.{failed, plural, =0 {} other { # en échec.}}',
  bulkCancelled:
    '{cancelled} annulées. Ignorés : {owned} dans la bibliothèque, {notCancellable} sans demande à annuler.{failed, plural, =0 {} other { # en échec.}}',
  cancelFailed: 'Impossible d’annuler ces demandes',
  cancelTitle: 'Annuler {count, plural, one {# demande} other {# demandes}} ?',
  cancelDescription:
    'Seules les demandes pas encore téléchargées sont annulées. Les livres déjà dans votre bibliothèque ne sont jamais touchés.',
  viewGrid: 'Grille',
  viewList: 'Liste',
  openBook: 'Ouvrir {title}',
  copiesLabel: 'Exemplaires possédés',
  copyEbook: 'Livre numérique',
  copyAudio: 'Livre audio',
  copyBoth: 'Livre numérique + audio',
  copyMore: '+{count}',
  unavailableCopy: 'Exemplaire indisponible',
  notInLibrary: 'Pas dans la bibliothèque',
  requestEbook: 'Demander le livre numérique',
  requestAudiobook: 'Demander le livre audio',
  viewEbookRequest: 'Voir la demande de livre numérique',
  viewAudiobookRequest: 'Voir la demande de livre audio',
  ebookRequestState: 'Livre numérique : {status}',
  audiobookRequestState: 'Livre audio : {status}',
  bookInfo: 'Infos du livre',
  select: 'Sélectionner',
  deselect: 'Désélectionner',
  moreActions: 'Plus d’actions pour {title}',
  detail: {
    series: 'Série',
    published: 'Publié',
    publisher: 'Éditeur',
    language: 'Langue',
    pages: 'Pages',
    onGoodreads: 'Goodreads',
    openGoodreads: 'Voir sur Goodreads',
    searching: 'Recherche du livre dans vos sources de métadonnées',
    noMetadata: 'Aucune source de métadonnées ne connaît ce livre. Les détails Goodreads sont affichés.',
    otherEditions: 'Autres résultats',
  },
  listShelf: 'Liste',
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

const REQUEST_KEYS: Record<BookRequestMediaKind, { request: string; view: string; state: string }> = {
  ebook: { request: 'requestEbook', view: 'viewEbookRequest', state: 'ebookRequestState' },
  audiobook: { request: 'requestAudiobook', view: 'viewAudiobookRequest', state: 'audiobookRequestState' },
}

/** The message keys, under the Goodreads root, for requesting one media kind and for its existing request. */
export function goodreadsRequestKeys(kind: BookRequestMediaKind): { request: string; view: string; state: string } {
  return REQUEST_KEYS[kind]
}
