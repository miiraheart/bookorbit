import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { GoodreadsShelfRow } from '@bookorbit/types'
import { i18n } from '@/i18n'
import GoodreadsRemoteCard from '../GoodreadsRemoteCard.vue'
import { installGoodreadsMessages } from '../../i18n'

installGoodreadsMessages()
const t = i18n.global.t

function row(overrides: Partial<GoodreadsShelfRow> = {}): GoodreadsShelfRow {
  return {
    key: '62335',
    goodreadsId: '62335',
    title: 'Le Petit Prince',
    authors: ['Antoine de Saint-Exupéry'],
    rating: 5,
    isbn13: null,
    coverUrl: null,
    readAt: null,
    shelves: ['to-read'],
    bookIds: [],
    source: 'me',
    firstSeenAt: '2026-11-25T00:00:00.000Z',
    isNew: true,
    request: null,
    requests: {},
    ...overrides,
  }
}

function mountCard(props: Partial<InstanceType<typeof GoodreadsRemoteCard>['$props']> = {}) {
  const Empty = defineComponent({ render: () => null })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Empty }] })
  return mount(GoodreadsRemoteCard, {
    props: { row: row(), canRequest: true, ...props },
    global: { plugins: [router], stubs: { GoodreadsRemoteMenu: true } },
  })
}

describe('GoodreadsRemoteCard', () => {
  it('opens the book info from the centre button and never requests from it', async () => {
    const wrapper = mountCard()

    await wrapper.find('[data-testid="goodreads-remote-primary"]').trigger('click')
    await wrapper.find('[data-testid="goodreads-remote-info"]').trigger('click')
    await wrapper.find('[data-testid="goodreads-open"]').trigger('click')

    expect(wrapper.emitted('open')).toHaveLength(3)
    expect(wrapper.emitted('request')).toBeUndefined()
  })

  it('draws the library frame at 2/3 with its kebab, the NEW badge and the rating', () => {
    const wrapper = mountCard()

    expect(wrapper.find('.book-cover-surface').attributes('style')).toContain('aspect-ratio: 2 / 3')
    expect(wrapper.findComponent({ name: 'GoodreadsRemoteMenu' }).exists()).toBe(true)
    expect(wrapper.find('[data-testid="goodreads-new-badge"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="goodreads-rating"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="goodreads-remote-pill"]').text()).toBe(t('goodreads.notInLibrary'))
  })

  it('shows the request status, or the unavailable copy, in the pill', () => {
    const approved = { id: 3, status: 'approved' as const }
    expect(
      mountCard({ row: row({ request: approved, requests: { ebook: approved } }) })
        .find('[data-testid="goodreads-remote-pill"]')
        .text(),
    ).toBe(t('bookRequests.status.approved'))
    expect(
      mountCard({ row: row({ bookIds: [999] }), unavailable: true })
        .find('[data-testid="goodreads-unavailable"]')
        .text(),
    ).toBe(t('goodreads.unavailableCopy'))
  })

  it('toggles the selection instead of opening while the page is selecting', async () => {
    const wrapper = mountCard({ selectionMode: true, selected: true })

    expect(wrapper.find('[data-testid="goodreads-remote-primary"]').exists()).toBe(false)
    await wrapper.find('[data-testid="goodreads-open"]').trigger('click')

    expect(wrapper.emitted('toggle')).toHaveLength(1)
    expect(wrapper.emitted('open')).toBeUndefined()
  })

  it('puts the title and the kebab under the cover in below-cover mode', () => {
    const wrapper = mountCard({ showLabel: true })

    expect(wrapper.find('[data-testid="goodreads-remote-label"]').text()).toContain('Le Petit Prince')
    expect(wrapper.findAllComponents({ name: 'GoodreadsRemoteMenu' })).toHaveLength(1)
  })
})
