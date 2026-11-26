import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import PairEbookSheet from '../PairEbookSheet.vue'
import * as pairsApi from '../../api/read-along-pairs.api'
import { candidate, candidates, pair } from '../../__tests__/fixtures'

vi.mock('../../api/read-along-pairs.api', () => ({
  fetchCandidates: vi.fn<typeof pairsApi.fetchCandidates>(),
  pairEbook: vi.fn<typeof pairsApi.pairEbook>(),
  unpairEbook: vi.fn<typeof pairsApi.unpairEbook>(),
  dismissCandidate: vi.fn<typeof pairsApi.dismissCandidate>(),
  undismissCandidate: vi.fn<typeof pairsApi.undismissCandidate>(),
  deleteReadAlongFile: vi.fn<typeof pairsApi.deleteReadAlongFile>(),
}))

const api = vi.mocked(pairsApi)
const passThrough = { template: '<div><slot /></div>' }
const other = () => candidate({ ebookBookId: 2699, ebookFileId: 12218, title: 'Circe (other)', tier: 'likely', otherCopies: [] })

async function mountSheet(props: Record<string, unknown> = {}) {
  const wrapper = mount(PairEbookSheet, {
    props: { open: true, bookId: 2238, title: 'Circe (Unabridged)', ...props },
    global: {
      stubs: { Sheet: passThrough, SheetContent: passThrough, SheetHeader: passThrough, SheetTitle: passThrough, SheetDescription: passThrough },
    },
  })
  await flushPromises()
  return wrapper
}

describe('PairEbookSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.fetchCandidates.mockResolvedValue(candidates())
    api.pairEbook.mockResolvedValue({ pair: pair(), readAlongStale: false })
    api.dismissCandidate.mockResolvedValue({ dismissedEbookBookIds: [2614] })
    api.undismissCandidate.mockResolvedValue({ dismissedEbookBookIds: [] })
    api.deleteReadAlongFile.mockResolvedValue()
  })

  it('lists the ranked candidates with their other copies and starts on the best one', async () => {
    const wrapper = await mountSheet()

    expect(api.fetchCandidates).toHaveBeenCalledWith(2238, { q: undefined, showDismissed: true })
    expect(wrapper.get('[data-testid="pair-candidate-2614"]').text()).toContain('Circe')
    expect(wrapper.get('[data-testid="pair-copies-2614"]').text()).toContain('Readarr legacy')
    expect((wrapper.get('[data-testid="pair-candidate-select-11728"]').element as HTMLInputElement).checked).toBe(true)

    await wrapper.get('[data-testid="pair-candidate-select-20457"]').setValue(true)
    await wrapper.get('[data-testid="pair-save"]').trigger('click')
    await flushPromises()
    expect(api.pairEbook).toHaveBeenCalledWith(2238, { ebookBookId: 5639, ebookFileId: 20457 })
    expect(wrapper.emitted('changed')).toHaveLength(1)
    expect(wrapper.emitted('update:open')).toEqual([[false]])
  })

  it('dismisses the selected candidate, reloads, and never saves the dismissed one', async () => {
    const wrapper = await mountSheet()
    api.fetchCandidates.mockResolvedValue(candidates({ candidates: [other()], dismissedEbookBookIds: [2614], dismissed: [candidate()] }))

    await wrapper.get('[data-testid="pair-dismiss-2614"]').trigger('click')
    await flushPromises()
    expect(api.dismissCandidate).toHaveBeenCalledWith(2238, 2614)
    expect(api.fetchCandidates).toHaveBeenCalledTimes(2)

    await wrapper.get('[data-testid="pair-save"]').trigger('click')
    await flushPromises()
    expect(api.pairEbook).toHaveBeenCalledWith(2238, { ebookBookId: 2699, ebookFileId: 12218 })
  })

  it('shows dismissed ebooks on request and suggests one again', async () => {
    api.fetchCandidates.mockResolvedValue(candidates({ candidates: [], dismissedEbookBookIds: [2614], dismissed: [candidate()] }))
    const wrapper = await mountSheet()

    expect(wrapper.find('[data-testid="pair-dismissed"]').exists()).toBe(false)
    await wrapper.get('[data-testid="pair-show-dismissed"]').setValue(true)
    expect(wrapper.get('[data-testid="pair-dismissed"]').text()).toContain('Circe')
    expect(wrapper.find('[data-testid="pair-dismissed"] [data-testid="pair-candidate-select-11728"]').exists()).toBe(false)

    await wrapper.get('[data-testid="pair-undismiss-2614"]').trigger('click')
    await flushPromises()
    expect(api.undismissCandidate).toHaveBeenCalledWith(2238, 2614)
  })

  it('changes a pair and can dismiss the old ebook in the same save', async () => {
    api.fetchCandidates.mockResolvedValue(candidates({ pair: pair(), pairState: 'ok', candidates: [candidate(), other()] }))
    const wrapper = await mountSheet()

    expect(wrapper.get('[data-testid="pair-current"]').text()).toContain('Circe')
    expect(wrapper.find('[data-testid="pair-dismiss-previous"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="pair-save"]').attributes('disabled')).toBeDefined()

    await wrapper.get('[data-testid="pair-candidate-select-12218"]').setValue(true)
    await wrapper.get('[data-testid="pair-dismiss-previous"]').setValue(true)
    await wrapper.get('[data-testid="pair-save"]').trigger('click')
    await flushPromises()
    expect(api.pairEbook).toHaveBeenCalledWith(2238, { ebookBookId: 2699, ebookFileId: 12218, dismissPrevious: true, language: 'en' })
  })

  it('asks to regenerate when the audiobook holds a read-along from another ebook', async () => {
    api.pairEbook.mockResolvedValue({ pair: pair(), readAlongStale: true })
    const wrapper = await mountSheet()

    await wrapper.get('[data-testid="pair-save"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="pair-stale"]').exists()).toBe(true)
    expect(wrapper.emitted('update:open')).toBeUndefined()

    await wrapper.get('[data-testid="pair-regenerate"]').trigger('click')
    expect(wrapper.emitted('regenerate')).toEqual([[2238]])
  })

  it('unpairs, then deletes the read-along only when asked', async () => {
    api.fetchCandidates.mockResolvedValueOnce(candidates({ pair: pair(), pairState: 'ok' }))
    api.unpairEbook.mockResolvedValue({
      removed: pair(),
      readAlongs: [{ fileId: 9001, filename: 'Circe.readaloud.epub' }],
      canDeleteReadAlong: true,
    })
    const wrapper = await mountSheet()

    await wrapper.get('[data-testid="pair-unpair"]').trigger('click')
    await flushPromises()
    expect(api.unpairEbook).toHaveBeenCalledWith(2238)
    expect(wrapper.get('[data-testid="unpair-offer"]').text()).toContain('Circe.readaloud.epub')
    expect(api.deleteReadAlongFile).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="unpair-delete-read-along"]').trigger('click')
    await flushPromises()
    expect(api.deleteReadAlongFile).toHaveBeenCalledWith(9001)
    expect(wrapper.find('[data-testid="unpair-offer"]').exists()).toBe(false)
  })

  it('keeps the read-along when the person says so, and never offers delete without the permission', async () => {
    api.fetchCandidates.mockResolvedValueOnce(candidates({ pair: pair(), pairState: 'ok' }))
    api.unpairEbook.mockResolvedValue({
      removed: pair(),
      readAlongs: [{ fileId: 9001, filename: 'Circe.readaloud.epub' }],
      canDeleteReadAlong: false,
    })
    const wrapper = await mountSheet()

    await wrapper.get('[data-testid="pair-unpair"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="unpair-delete-read-along"]').exists()).toBe(false)
    await wrapper.get('[data-testid="unpair-keep-read-along"]').trigger('click')
    expect(wrapper.find('[data-testid="unpair-offer"]').exists()).toBe(false)
    expect(api.deleteReadAlongFile).not.toHaveBeenCalled()
  })

  it('starts on a preselected ebook the matcher did not list', async () => {
    api.fetchCandidates.mockResolvedValue(candidates({ candidates: [] }))
    const wrapper = await mountSheet({ preselect: { ebookBookId: 4000, ebookFileId: 4001 } })

    expect(wrapper.find('[data-testid="pair-preselected"]').exists()).toBe(true)
    await wrapper.get('[data-testid="pair-save"]').trigger('click')
    await flushPromises()
    expect(api.pairEbook).toHaveBeenCalledWith(2238, { ebookBookId: 4000, ebookFileId: 4001 })
  })
})
