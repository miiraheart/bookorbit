import { watch, type WritableComputedRef } from 'vue'
import type { BookRequestMediaKind, Locale } from '@bookorbit/types'
import { i18n, type MessageSchema } from '@/i18n'
import { compileIcuCatalog } from '@/i18n/icu'
import { EN } from './en'
import { FR } from './fr'

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
