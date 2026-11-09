import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookDetail } from '@bookorbit/types'
import { apiJson } from '@/lib/api-json'
import BookEditionLinks from '../BookEditionLinks.vue'

const permission = vi.hoisted(() => vi.fn(() => true))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/features/library/composables/useLibraryPermissions', () => ({ useLibraryPermissions: () => ({ hasLibraryPermission: permission }) }))
vi.mock('@/lib/api-json', async (original) => ({ ...(await original<typeof import('@/lib/api-json')>()), apiJson: vi.fn<typeof apiJson>() }))
const book = { id: 1, libraryId: 3, title: 'Killing Floor' } as BookDetail
const edition = { bookId: 2, libraryId: 4, libraryName: 'Swedish books', title: 'Dollar', language: 'sv', formats: ['epub'], workId: 9 }
let wrapper: ReturnType<typeof mount> | undefined

describe('book edition links', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permission.mockReturnValue(true)
    vi.mocked(apiJson).mockResolvedValue({ items: [edition], hasMore: false })
  })
  afterEach(() => {
    wrapper?.unmount()
    document.body.innerHTML = ''
  })

  it('shows the translated edition with its library, language and format and opens the link dialog', async () => {
    wrapper = mount(BookEditionLinks, {
      props: { book },
      attachTo: document.body,
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('Dollar')
    expect(wrapper.text()).toContain('Swedish books · sv · EPUB')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('works.linkAnotherEdition')
    expect(document.querySelector('input[type="search"]')).not.toBeNull()
  })

  it('keeps linked editions visible to readers while hiding the link action', async () => {
    permission.mockReturnValue(false)
    wrapper = mount(BookEditionLinks, { props: { book }, global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
    await flushPromises()
    expect(wrapper.text()).toContain('Dollar')
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('works.manageLinkedEditions')
  })
})
