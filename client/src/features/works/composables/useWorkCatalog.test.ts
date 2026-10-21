import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiJson } from '@/lib/api-json'
import type { WorkCatalogPage } from '@bookorbit/types'
import { useWorkCatalog } from './useWorkCatalog'
const permission = vi.hoisted(() => vi.fn<() => boolean>(() => true))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { libraryId: '7' } }) }))
vi.mock('@/features/library/composables/useLibraryPermissions', () => ({ useLibraryPermissions: () => ({ hasLibraryPermission: permission }) }))
vi.mock('@/lib/api-json', async (original) => ({ ...(await original<typeof import('@/lib/api-json')>()), apiJson: vi.fn<typeof apiJson>() }))

describe('work catalog request and reader contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permission.mockReturnValue(true)
    vi.mocked(apiJson).mockResolvedValue({ items: [], hasMore: false })
  })
  it('sends both filters to the matching backend route', async () => {
    const catalog = useWorkCatalog()
    catalog.language.value = 'sv'
    catalog.format.value = 'mp3'
    await catalog.filter()
    expect(apiJson).toHaveBeenCalledWith('/api/v1/works?libraryId=7&offset=0&autoGroup=true&language=sv&format=mp3', undefined, 'common.error')
  })
  it('pages by work cursor without a growing database offset', async () => {
    const catalog = useWorkCatalog()
    vi.mocked(apiJson).mockResolvedValueOnce({ items: [{ key: 'w:10001', workId: 10001, title: 'Sample', editions: [] }], hasMore: true })
    await catalog.load()
    await catalog.next()
    expect(apiJson).toHaveBeenLastCalledWith('/api/v1/works?libraryId=7&offset=0&autoGroup=true&after=w%3A10001', undefined, 'common.error')
    await catalog.previous()
    expect(apiJson).toHaveBeenLastCalledWith('/api/v1/works?libraryId=7&offset=0&autoGroup=true', undefined, 'common.error')
  })
  it('groups and ungroups using DTO fields and JSON content type', async () => {
    const catalog = useWorkCatalog()
    catalog.title.value = 'Sample'
    catalog.bookIds.value = '1, 2, 3, 4'
    await catalog.group()
    expect(apiJson).toHaveBeenCalledWith(
      '/api/v1/works',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Sample', bookIds: [1, 2, 3, 4] }),
      }),
      'common.error',
    )
    await catalog.ungroup(9, 2)
    expect(apiJson).toHaveBeenCalledWith('/api/v1/works/9/editions/2', { method: 'DELETE' }, 'common.error')
  })
  it('requires metadata permission and editor access for controls', () => {
    permission.mockReturnValue(false)
    expect(useWorkCatalog().canGroup.value).toBe(false)
    expect(permission).toHaveBeenCalledWith('library_edit_metadata', 7, 'editor')
  })
  it('opens the chosen edition and format through the existing reader route', () => {
    const catalog = useWorkCatalog()
    const file = { id: 55, format: 'mp3' }
    expect(catalog.readerLink({ bookId: 4, title: 'Sample', language: 'en', narrators: ['B'], files: [file] }, file)).toEqual({
      name: 'reader',
      params: { bookId: 4, fileId: 55 },
      query: { format: 'mp3' },
    })
  })
  it('can turn off automatic grouping without retaining the previous page cursor', async () => {
    const catalog = useWorkCatalog()
    vi.mocked(apiJson).mockResolvedValueOnce({ items: [{ key: `a:${'a'.repeat(32)}`, workId: null, title: 'Sample', editions: [] }], hasMore: true })
    await catalog.load()
    await catalog.next()
    catalog.autoGroup.value = false
    await catalog.filter()
    expect(catalog.offset.value).toBe(0)
    expect(apiJson).toHaveBeenLastCalledWith('/api/v1/works?libraryId=7&offset=0&autoGroup=false', undefined, 'common.error')
  })
  it('selects editions for a saved group and clears the selection after saving', async () => {
    const catalog = useWorkCatalog()
    function select(id: number, checked: boolean) {
      catalog.toggleEditionSelection({ target: { dataset: { bookId: String(id), title: 'Sample' }, checked } } as unknown as Event)
    }
    select(1, true)
    select(2, true)
    select(1, false)
    expect(catalog.selectedBookIds.value).toEqual([2])
    select(1, true)
    expect(catalog.title.value).toBe('Sample')
    await catalog.group()
    expect(apiJson).toHaveBeenCalledWith(
      '/api/v1/works',
      expect.objectContaining({ body: JSON.stringify({ title: 'Sample', bookIds: [2, 1] }) }),
      'common.error',
    )
    expect(catalog.selectedBookIds.value).toEqual([])
    expect(catalog.bookIds.value).toBe('')
  })
  it('ignores a stale response after a newer filter result arrives', async () => {
    const catalog = useWorkCatalog()
    let resolveFirst!: (page: WorkCatalogPage) => void
    vi.mocked(apiJson).mockReturnValueOnce(
      new Promise<WorkCatalogPage>((resolve) => {
        resolveFirst = resolve
      }),
    )
    const first = catalog.load()
    await catalog.filter()
    resolveFirst({ items: [], hasMore: true })
    await first
    expect(catalog.page.value.hasMore).toBe(false)
  })
  it('searches titles on the server and rejects invalid manual selections before submitting', async () => {
    const catalog = useWorkCatalog()
    catalog.search.value = '  Jenny Han  '
    await catalog.filter()
    expect(apiJson).toHaveBeenLastCalledWith('/api/v1/works?libraryId=7&offset=0&autoGroup=true&search=Jenny+Han', undefined, 'common.error')
    vi.mocked(apiJson).mockClear()
    catalog.title.value = 'Sample'
    for (const ids of ['1', '1, 1', '1, invalid', '1, -2']) {
      catalog.bookIds.value = ids
      expect(catalog.canSubmitGroup.value).toBe(false)
      await catalog.group()
    }
    expect(apiJson).not.toHaveBeenCalled()
  })
})
