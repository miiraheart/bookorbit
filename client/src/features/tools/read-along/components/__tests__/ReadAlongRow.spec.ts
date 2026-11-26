import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n } from '@/i18n'
import ReadAlongRow from '../ReadAlongRow.vue'
import { candidate, pair, row } from '@/features/read-along-pairs/__tests__/fixtures'

const t = i18n.global.t
const Empty = defineComponent({ render: () => null })

async function mountRow(props: Parameters<typeof row>[0] = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Empty },
      { path: '/read/:bookId/:fileId', name: 'reader', component: Empty },
      { path: '/book/:bookId', name: 'book-detail', component: Empty },
    ],
  })
  await router.push('/')
  const wrapper = mount(ReadAlongRow, { props: { row: row(props) }, global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('ReadAlongRow', () => {
  it('offers one-click Pair on a suggested match, with its tier, library and reasons', async () => {
    const wrapper = await mountRow()

    expect(wrapper.find('[data-testid="read-along-status-suggested"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="read-along-tier-exact"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="read-along-candidate"]').text()).toContain('English ebooks')
    expect(wrapper.get('[data-testid="read-along-candidate"]').text()).toContain(t('tools.readAlong.reason.title_exact'))

    await wrapper.get('[data-testid="read-along-pair"]').trigger('click')
    expect(wrapper.emitted('pair')?.[0]?.[0]).toMatchObject({ audiobook: { bookId: 2238 } })
    expect(wrapper.find('[data-testid="read-along-unpair"]').exists()).toBe(false)
  })

  it('sends ambiguous and flagged rows through the sheet instead of one click', async () => {
    const flagged = await mountRow({ status: 'flagged', best: candidate({ tier: 'maybe', flags: ['part_of', 'dramatized'] }) })

    expect(flagged.find('[data-testid="read-along-pair"]').exists()).toBe(false)
    expect(flagged.find('[data-testid="read-along-flag-part_of"]').exists()).toBe(true)
    expect(flagged.find('[data-testid="read-along-flag-dramatized"]').exists()).toBe(true)
    await flagged.get('[data-testid="read-along-choose"]').trigger('click')
    expect(flagged.emitted('choose')).toHaveLength(1)
  })

  it('offers Change, Unpair and Create read-along once paired', async () => {
    const wrapper = await mountRow({ status: 'paired', pair: pair() })

    expect(wrapper.get('[data-testid="read-along-choose"]').text()).toBe(t('tools.readAlong.actions.change'))
    expect(wrapper.get('[data-testid="read-along-paired-ebook"]').text()).toContain('Circe')
    await wrapper.get('[data-testid="read-along-unpair"]').trigger('click')
    await wrapper.get('[data-testid="read-along-create"]').trigger('click')
    expect(wrapper.emitted('unpair')).toHaveLength(1)
    expect(wrapper.emitted('create')).toHaveLength(1)
  })

  it('opens the read-along in the reader on the audiobook record', async () => {
    const wrapper = await mountRow({ status: 'paired', pair: pair(), readAlong: { fileId: 9001, stale: false } })

    expect(wrapper.find('[data-testid="read-along-ready"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="read-along-open"]').attributes('href')).toBe('/read/2238/9001?format=epub')
  })

  it('says a stale read-along came from another ebook and offers Regenerate', async () => {
    const wrapper = await mountRow({ status: 'paired', pair: pair(), readAlong: { fileId: 9001, stale: true } })

    expect(wrapper.find('[data-testid="read-along-stale"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="read-along-create"]').text()).toContain(t('tools.readAlong.actions.regenerate'))
  })

  it('links to the job on the Files tab while one runs, instead of Create', async () => {
    const wrapper = await mountRow({ status: 'paired', pair: pair(), activeJobId: 'job-1' })

    expect(wrapper.find('[data-testid="read-along-create"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="read-along-job"]').attributes('href')).toBe('/book/2238?tab=files')
  })

  it('shows a pair to an ebook the user cannot open as paired, without a link', async () => {
    const wrapper = await mountRow({ status: 'paired', pair: null, pairHidden: true })

    expect(wrapper.get('[data-testid="read-along-paired-hidden"]').text()).toBe(
      t('tools.readAlong.row.pairedWith', { title: t('tools.readAlong.sheet.hiddenEbook') }),
    )
    expect(wrapper.find('[data-testid="read-along-paired-ebook"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="read-along-unpair"]').exists()).toBe(true)
  })

  it('names an audiobook with no candidate', async () => {
    const wrapper = await mountRow({ status: 'none', best: null })

    expect(wrapper.get('[data-testid="read-along-candidate"]').text()).toBe(t('tools.readAlong.row.noCandidate'))
    expect(wrapper.get('[data-testid="read-along-choose"]').text()).toBe(t('tools.readAlong.actions.choose'))
  })
})
