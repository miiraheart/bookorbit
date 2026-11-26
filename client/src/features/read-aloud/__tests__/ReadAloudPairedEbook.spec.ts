import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { estimateReadAloudOutputBytes, type CreateReadAloudJobRequest, type ReadAloudCapability } from '@bookorbit/types'
import { activateI18nLocale, i18n } from '@/i18n'
import { formatBytes } from '@/lib/formatting'
import { jsonResponse, makeCapability, makeChapter, makeJob, makeReport } from './fixtures'

const mocks = vi.hoisted(() => ({ api: vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>() }))
vi.mock('@/lib/api', () => ({ api: mocks.api }))
vi.mock('@/features/auth/composables/usePermissions', () => ({ usePermissions: () => ({ hasPermission: () => false }) }))

import ReadAloudDialog from '../components/ReadAloudDialog.vue'
import ReadAloudJobCard from '../components/ReadAloudJobCard.vue'
import { READ_ALOUD_PAIR_CHANGED_KEY } from '../composables/useReadAloud'

const t = i18n.global.t
let wrapper: VueWrapper | null = null

const DIALOG_STUBS = {
  DialogRoot: { template: '<div><slot /></div>' },
  DialogPortal: { template: '<div><slot /></div>' },
  DialogOverlay: { template: '<div />' },
  DialogContent: defineComponent({ emits: ['closeAutoFocus'], template: '<div><slot /></div>' }),
  DialogTitle: { template: '<h2><slot /></h2>' },
  DialogDescription: { template: '<p><slot /></p>' },
}

const PAIRED = { id: 401, filename: 'Circe.epub', format: 'epub', sizeBytes: 3_000, durationSeconds: null, bookId: 40, libraryName: 'English ebooks' }

beforeAll(() => {
  activateI18nLocale('en')
})

beforeEach(() => {
  mocks.api.mockReset()
  mocks.api.mockImplementation(async (input) => {
    const url = String(input)
    if (url.endsWith('/report')) return jsonResponse(makeReport([makeChapter()]))
    if (url.includes('/events')) return jsonResponse({ events: [] })
    return jsonResponse({ settings: { defaultLanguage: null } })
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

function mountDialog(capability: ReadAloudCapability, preferredEpubFileId: number | null = null, defaultLanguage: string | null = 'en') {
  wrapper = mount(ReadAloudDialog, {
    attachTo: document.body,
    props: { open: true, capability, defaultLanguage, initial: null, preferredEpubFileId, busy: false, error: null },
    global: { stubs: DIALOG_STUBS },
  })
  return wrapper
}

async function submit(dialog: VueWrapper): Promise<CreateReadAloudJobRequest> {
  const start = dialog.findAll('button').find((button) => button.text().trim() === t('book.detail.files.readAloud.dialog.start'))!
  await start.trigger('click')
  return (dialog.emitted('create') as [CreateReadAloudJobRequest][])[0]![0]
}

const estimate = (bytes: number) => t('book.detail.files.readAloud.dialog.estimatedSize', { size: formatBytes(estimateReadAloudOutputBytes(bytes)) })

describe('ReadAloudDialog with a paired ebook', () => {
  it('names the library a paired EPUB comes from and sends its record', async () => {
    const dialog = mountDialog(makeCapability({ epubFiles: [PAIRED] }))
    await flushPromises()
    expect(dialog.text()).toContain('Circe.epub')
    expect(dialog.text()).toContain(t('book.detail.files.readAloud.dialog.fromLibrary', { library: 'English ebooks' }))
    expect(await submit(dialog)).toMatchObject({ epubFileId: 401, epubBookId: 40 })
  })

  it('preselects the EPUB it is given and labels only the paired one', async () => {
    const own = makeCapability().epubFiles[0]!
    const dialog = mountDialog(makeCapability({ epubFiles: [own, PAIRED] }), 401)
    await flushPromises()
    expect(dialog.find<HTMLInputElement>('input[type="radio"][value="401"]').element.checked).toBe(true)
    expect(dialog.text().match(/from English ebooks/g)).toHaveLength(1)
  })

  it('estimates the output from the selected EPUB and tracks', async () => {
    const own = makeCapability().epubFiles[0]!
    const dialog = mountDialog(makeCapability({ epubFiles: [own, PAIRED] }))
    await flushPromises()
    expect(dialog.text()).toContain(estimate(100 + 600))

    await dialog.find('input[type="radio"][value="401"]').setValue(true)
    expect(dialog.text()).toContain(estimate(3_000 + 600))
    const input = await submit(dialog)
    expect(input.epubBookId).toBe(40)
  })

  it("takes the pair's language when the audiobook states none, and the book's own when it does", async () => {
    const paired = makeCapability({ epubFiles: [{ ...PAIRED, language: 'fr' }] })
    const untagged = mountDialog(paired, null, null)
    await flushPromises()
    expect((await submit(untagged)).language).toBe('fr')
    untagged.unmount()

    const tagged = mountDialog(paired, null, 'de')
    await flushPromises()
    expect((await submit(tagged)).language).toBe('de')
  })

  it("sends no ebook record for the book's own EPUB", async () => {
    const dialog = mountDialog(makeCapability())
    await flushPromises()
    expect(await submit(dialog)).not.toHaveProperty('epubBookId')
  })
})

describe('ReadAloudJobCard with a paired ebook', () => {
  function mountCard(job = makeJob({ status: 'awaiting_review', epubBookTitle: 'Circe' }), errorKey: string | null = null) {
    wrapper = mount(ReadAloudJobCard, { attachTo: document.body, props: { job, action: null, errorKey, canStartOver: true, viewerId: 1 } })
    return wrapper
  }

  const publishButton = (card: VueWrapper) =>
    card.findAll('button').find((button) => button.text().trim() === t('book.detail.files.readAloud.review.publishAnyway'))!

  it('says which ebook the text came from', async () => {
    const card = mountCard()
    await flushPromises()
    expect(card.find('[data-test="read-aloud-source"]').text()).toBe(t('book.detail.files.readAloud.job.textFrom', { title: 'Circe' }))
  })

  it("shows no source line for a job on the book's own EPUB", async () => {
    const card = mountCard(makeJob({ status: 'awaiting_review' }))
    await flushPromises()
    expect(card.find('[data-test="read-aloud-source"]').exists()).toBe(false)
  })

  it('publishes normally, then with force once the server said the pair changed', async () => {
    const card = mountCard()
    await flushPromises()
    await publishButton(card).trigger('click')
    expect(card.emitted('publish')).toEqual([[]])

    await card.setProps({ errorKey: READ_ALOUD_PAIR_CHANGED_KEY })
    expect(card.text()).toContain(t(READ_ALOUD_PAIR_CHANGED_KEY))
    await publishButton(card).trigger('click')
    expect(card.emitted('publish')).toEqual([[], [true]])
  })
})
