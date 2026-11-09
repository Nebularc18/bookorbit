import { effectScope, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookDetail, EditionLinkItem } from '@bookorbit/types'
import { apiJson } from '@/lib/api-json'
import { useBookEditionLinks } from './useBookEditionLinks'

const permission = vi.hoisted(() => vi.fn<() => boolean>(() => true))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/features/library/composables/useLibraryPermissions', () => ({ useLibraryPermissions: () => ({ hasLibraryPermission: permission }) }))
vi.mock('@/lib/api-json', async (original) => ({ ...(await original<typeof import('@/lib/api-json')>()), apiJson: vi.fn<typeof apiJson>() }))
const source = { id: 1, libraryId: 3, title: 'Killing Floor' } as BookDetail
const target: EditionLinkItem = {
  bookId: 2,
  libraryId: 4,
  libraryName: 'Swedish books',
  title: 'Dollar',
  language: 'sv',
  formats: ['epub'],
  workId: null,
}

function fixture() {
  const scope = effectScope()
  const book = ref(source)
  const links = scope.run(() => useBookEditionLinks(book))!
  return { book, links, stop: () => scope.stop() }
}

describe('book edition linking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permission.mockReturnValue(true)
    vi.mocked(apiJson).mockResolvedValue({ items: [], hasMore: false })
  })

  it('searches by the translated title and links the two edition IDs without changing book metadata', async () => {
    const { links, stop } = fixture()
    await nextTick()
    links.search.value = ' Dollar '
    await nextTick()
    vi.mocked(apiJson).mockResolvedValueOnce({ items: [target], hasMore: false })
    await links.submitSearch()
    expect(apiJson).toHaveBeenLastCalledWith('/api/v1/works/editions/1/candidates?search=Dollar&after=0', undefined, 'works.searchEditionsFailed')
    links.showDialog()
    vi.mocked(apiJson)
      .mockResolvedValueOnce({ id: 9 })
      .mockResolvedValueOnce({ items: [target], hasMore: false })
    await links.linkEdition(target)
    expect(apiJson).toHaveBeenCalledWith(
      '/api/v1/works',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ title: 'Killing Floor', bookIds: [1, 2] }) }),
      'works.linkEditionFailed',
    )
    expect(links.linked.value).toEqual([target])
    expect(links.open.value).toBe(false)
    expect(links.notice.value).toBe('works.editionLinked')
    stop()
  })

  it('uses keyset pagination and starts fresh after the search term changes', async () => {
    const { links, stop } = fixture()
    links.search.value = 'Dollar'
    await nextTick()
    vi.mocked(apiJson).mockResolvedValueOnce({ items: [target], hasMore: true })
    await links.submitSearch()
    await links.nextPage()
    expect(apiJson).toHaveBeenLastCalledWith('/api/v1/works/editions/1/candidates?search=Dollar&after=2', undefined, 'works.searchEditionsFailed')
    links.search.value = 'Reacher'
    await nextTick()
    expect(links.results.value).toEqual([])
    expect(links.hasMore.value).toBe(false)
    stop()
  })

  it('prevents searching and linking without source editor permission', async () => {
    permission.mockReturnValue(false)
    const { links, stop } = fixture()
    links.search.value = 'Dollar'
    await nextTick()
    vi.mocked(apiJson).mockClear()
    await links.submitSearch()
    await links.linkEdition(target)
    expect(apiJson).not.toHaveBeenCalled()
    expect(links.canLink.value).toBe(false)
    stop()
  })

  it('keeps the dialog open with an actionable error if linking fails', async () => {
    const { links, stop } = fixture()
    await nextTick()
    links.showDialog()
    vi.mocked(apiJson).mockRejectedValueOnce(new Error('Editor access required'))
    await links.linkEdition(target)
    expect(links.open.value).toBe(true)
    expect(links.error.value).toBe('Editor access required')
    expect(links.saving.value).toBe(false)
    stop()
  })

  it('discards search responses when navigating to another book', async () => {
    const { book, links, stop } = fixture()
    links.search.value = 'Dollar'
    await nextTick()
    let resolve!: (value: unknown) => void
    vi.mocked(apiJson).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }) as ReturnType<typeof apiJson>,
    )
    const pending = links.submitSearch()
    book.value = { ...source, id: 5 }
    await nextTick()
    resolve({ items: [target], hasMore: true })
    await pending
    expect(links.results.value).toEqual([])
    expect(links.hasMore.value).toBe(false)
    stop()
  })
})
