import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, reactive, ref, shallowRef } from 'vue'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { BookDetail, ReadAloudCapability } from '@bookorbit/types'
import { activateI18nLocale } from '@/i18n'

import FilesTab from '../FilesTab.vue'

const readAloud = vi.hoisted(() => ({ reload: vi.fn<() => Promise<void>>() }))
const capability = shallowRef<ReadAloudCapability | null>(null)

vi.mock('vue-router', () => ({
  useRoute: () => reactive({ query: {}, params: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/lib/api', () => ({ api: vi.fn() }))
vi.mock('@/features/auth/composables/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true, isDemoRestrictedAccount: ref(false) }),
}))
vi.mock('@/features/library/composables/useLibraryPermissions', () => ({ useLibraryPermissions: () => ({ hasLibraryPermission: () => true }) }))
vi.mock('@/features/auth/composables/useAuth', () => ({ useAuth: () => ({ user: ref({ id: 7 }) }) }))
vi.mock('@/features/book/composables/useBookDownload', () => ({ useBookDownload: () => ({ downloadFile: vi.fn() }) }))
vi.mock('@/features/read-aloud/composables/useReadAloud', () => ({
  useReadAloud: () => ({
    capability,
    job: ref(null),
    loading: ref(false),
    loadFailed: ref(false),
    failedChecks: ref(0),
    action: ref(null),
    jobErrorKey: ref(null),
    reload: readAloud.reload,
  }),
}))

const PairEbookSheetStub = defineComponent({
  name: 'PairEbookSheet',
  props: { open: Boolean, bookId: Number, title: String },
  emits: ['changed', 'regenerate', 'update:open'],
  setup: (props) => () => h('div', { 'data-test': 'pair-sheet', 'data-open': String(props.open) }),
})

const BOOK = {
  id: 2238,
  libraryId: 14,
  title: 'Circe (Unabridged)',
  language: null,
  status: 'present',
  coverSource: null,
  coverVersion: null,
  folderPath: '/books/audiobooks/Circe',
  files: [{ id: 7749, format: 'm4b', role: 'content', filename: 'Circe.m4b', absolutePath: '/books/audiobooks/Circe/Circe.m4b', sizeBytes: 100 }],
} as unknown as BookDetail

function noEpubCapability(): ReadAloudCapability {
  return {
    model: 'quartznet15x5',
    supportedLanguages: ['en'],
    workerConfigured: true,
    workerAvailable: true,
    workerDevice: 'cpu',
    workerFreeBytes: null,
    eligible: false,
    reason: 'no_epub',
    epubFiles: [],
    audioFiles: [],
    existingReadAlongs: [],
    estimatedOutputBytes: null,
    latestJob: null,
  } as ReadAloudCapability
}

let wrapper: VueWrapper | null = null

beforeAll(() => {
  activateI18nLocale('en')
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  readAloud.reload.mockReset()
})

function mountTab() {
  wrapper = mount(FilesTab, {
    attachTo: document.body,
    props: { book: BOOK },
    global: {
      stubs: {
        PairEbookSheet: PairEbookSheetStub,
        ReadAloudDialog: true,
        ReadAloudJobCard: true,
        FileListCard: true,
        FileDetailCard: true,
        WriteBackCard: true,
        AddBookFileModal: true,
        RouterLink: true,
      },
    },
  })
  return wrapper
}

describe('FilesTab Find matching ebook', () => {
  it('offers the ebook search for an audiobook without an EPUB and opens the pair sheet', async () => {
    capability.value = noEpubCapability()
    const tab = mountTab()
    await flushPromises()
    const sheet = tab.findComponent(PairEbookSheetStub)
    expect(sheet.props('open')).toBe(false)
    expect(sheet.props('bookId')).toBe(2238)
    await tab.get('[data-test="read-aloud-pair-ebook"]').trigger('click')
    expect(sheet.props('open')).toBe(true)
  })

  it('checks Read Aloud again once a pair changed', async () => {
    capability.value = noEpubCapability()
    const tab = mountTab()
    await flushPromises()
    tab.findComponent(PairEbookSheetStub).vm.$emit('changed')
    expect(readAloud.reload).toHaveBeenCalledTimes(1)
  })

  it('offers no ebook search when the book already has an EPUB', async () => {
    capability.value = { ...noEpubCapability(), eligible: true, reason: null }
    const tab = mountTab()
    await flushPromises()
    expect(tab.find('[data-test="read-aloud-pair-ebook"]').exists()).toBe(false)
  })
})
