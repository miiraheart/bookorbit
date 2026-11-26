import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import type { GoodreadsShelfRow } from '@bookorbit/types'
import { i18n } from '@/i18n'
import GoodreadsRemoteMenu from '../GoodreadsRemoteMenu.vue'
import { installGoodreadsMessages } from '../../i18n'

installGoodreadsMessages()
const t = i18n.global.t

const Empty = defineComponent({ render: () => null })

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'goodreads', component: Empty },
      { path: '/requests/:id', name: 'book-request-detail', component: Empty },
    ],
  })
}

function row(overrides: Partial<GoodreadsShelfRow> = {}): GoodreadsShelfRow {
  return {
    key: '62335',
    goodreadsId: '62335',
    title: 'Le Petit Prince',
    authors: ['Antoine de Saint-Exupéry'],
    rating: null,
    isbn13: null,
    coverUrl: null,
    readAt: null,
    shelves: ['to-read'],
    bookIds: [],
    source: 'me',
    firstSeenAt: '2026-11-25T00:00:00.000Z',
    isNew: false,
    request: null,
    requests: {},
    ...overrides,
  }
}

const passThrough = { template: '<div><slot /></div>' }

async function mountMenu(props: { row: GoodreadsShelfRow; canRequest?: boolean; canReadAlong?: boolean }) {
  const router = makeRouter()
  await router.push('/')
  const wrapper = mount(GoodreadsRemoteMenu, {
    props: { canRequest: true, variant: 'overlay' as const, ...props },
    global: {
      plugins: [router],
      stubs: {
        DropdownMenu: passThrough,
        DropdownMenuTrigger: passThrough,
        DropdownMenuContent: passThrough,
        DropdownMenuItem: { template: '<div role="menuitem" @click="$emit(\'click\')"><slot /></div>', emits: ['click'] },
        DropdownMenuSeparator: true,
      },
    },
  })
  return { wrapper, router }
}

const has = (wrapper: Awaited<ReturnType<typeof mountMenu>>['wrapper'], id: string) => wrapper.find(`[data-testid="${id}"]`).exists()

describe('GoodreadsRemoteMenu', () => {
  it('offers both requests, Goodreads, book info and select for a book never requested', async () => {
    const { wrapper } = await mountMenu({ row: row() })

    expect(wrapper.find('[data-testid="goodreads-menu-request-ebook"]').text()).toContain(t('goodreads.requestEbook'))
    expect(wrapper.find('[data-testid="goodreads-menu-request-audiobook"]').text()).toContain(t('goodreads.requestAudiobook'))
    expect(has(wrapper, 'goodreads-menu-view-ebook')).toBe(false)
    expect(has(wrapper, 'goodreads-menu-view-audiobook')).toBe(false)
    expect(wrapper.find('[data-testid="goodreads-menu-goodreads"]').attributes('href')).toBe('https://www.goodreads.com/book/show/62335')
    expect(has(wrapper, 'goodreads-menu-info')).toBe(true)
    expect(wrapper.find('[data-testid="goodreads-menu-select"]').text()).toContain(t('goodreads.select'))
  })

  it('shows the ebook request instead of requesting it again, and still offers the audiobook', async () => {
    const pending = { id: 42, status: 'pending' as const }
    const { wrapper, router } = await mountMenu({ row: row({ request: pending, requests: { ebook: pending } }) })

    expect(has(wrapper, 'goodreads-menu-request-ebook')).toBe(false)
    expect(has(wrapper, 'goodreads-menu-request-audiobook')).toBe(true)
    expect(wrapper.find('[data-testid="goodreads-menu-view-ebook"]').text()).toContain(t('goodreads.viewEbookRequest'))
    expect(has(wrapper, 'goodreads-menu-view-audiobook')).toBe(false)

    await wrapper.find('[data-testid="goodreads-menu-view-ebook"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/requests/42')
  })

  it('lets a cancelled request be made again while still linking to it', async () => {
    const cancelled = { id: 7, status: 'cancelled' as const }
    const { wrapper } = await mountMenu({ row: row({ request: cancelled, requests: { audiobook: cancelled } }) })

    expect(has(wrapper, 'goodreads-menu-request-audiobook')).toBe(true)
    expect(has(wrapper, 'goodreads-menu-view-audiobook')).toBe(true)
  })

  it('hides Open on Goodreads without a Goodreads id, and the requests without the permission', async () => {
    const { wrapper } = await mountMenu({ row: row({ goodreadsId: null }), canRequest: false })

    expect(has(wrapper, 'goodreads-menu-goodreads')).toBe(false)
    expect(has(wrapper, 'goodreads-menu-request-ebook')).toBe(false)
    expect(has(wrapper, 'goodreads-menu-request-audiobook')).toBe(false)
    expect(has(wrapper, 'goodreads-menu-info')).toBe(true)
  })

  it('offers Download both for read-along only to someone who may fetch books directly', async () => {
    const { wrapper } = await mountMenu({ row: row(), canReadAlong: true })
    expect(wrapper.find('[data-testid="goodreads-menu-read-along"]').text()).toContain(t('goodreads.readAlongStart'))
    await wrapper.find('[data-testid="goodreads-menu-read-along"]').trigger('click')
    expect(wrapper.emitted('readAlong')).toHaveLength(1)

    const { wrapper: plain } = await mountMenu({ row: row() })
    expect(has(plain, 'goodreads-menu-read-along')).toBe(false)
  })

  it('offers Pick releases when both self-serve requests wait for a pick, and nothing once they download', async () => {
    const waiting = { id: 30, status: 'approved' as const, selfServe: true }
    const { wrapper } = await mountMenu({ row: row({ requests: { ebook: waiting, audiobook: { ...waiting, id: 31 } } }), canReadAlong: true })
    expect(wrapper.find('[data-testid="goodreads-menu-read-along"]').text()).toContain(t('goodreads.readAlongResume'))

    const moving = { ebook: { ...waiting, status: 'downloading' as const }, audiobook: { ...waiting, id: 31, status: 'downloading' as const } }
    const { wrapper: busy } = await mountMenu({ row: row({ requests: moving }), canReadAlong: true })
    expect(has(busy, 'goodreads-menu-read-along')).toBe(false)
  })

  it('emits the request with its media kind, and info and select', async () => {
    const { wrapper } = await mountMenu({ row: row() })

    await wrapper.find('[data-testid="goodreads-menu-request-audiobook"]').trigger('click')
    await wrapper.find('[data-testid="goodreads-menu-request-ebook"]').trigger('click')
    await wrapper.find('[data-testid="goodreads-menu-info"]').trigger('click')
    await wrapper.find('[data-testid="goodreads-menu-select"]').trigger('click')

    expect(wrapper.emitted('request')).toEqual([['audiobook'], ['ebook']])
    expect(wrapper.emitted('info')).toHaveLength(1)
    expect(wrapper.emitted('toggle')).toHaveLength(1)
  })
})
