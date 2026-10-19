import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiJson } from '@/lib/api-json'
import { useWorkCatalog } from './useWorkCatalog'
const permission = vi.hoisted(() => vi.fn(() => true))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { libraryId: '7' } }) }))
vi.mock('@/features/library/composables/useLibraryPermissions', () => ({ useLibraryPermissions: () => ({ hasLibraryPermission: permission }) }))
vi.mock('@/lib/api-json', async (original) => ({ ...(await original<typeof import('@/lib/api-json')>()), apiJson: vi.fn() }))

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
    expect(apiJson).toHaveBeenCalledWith('/api/v1/works?libraryId=7&offset=0&language=sv&format=mp3', undefined, 'common.error')
  })
  it('pages by work cursor without a growing database offset', async () => {
    const catalog = useWorkCatalog()
    vi.mocked(apiJson).mockResolvedValueOnce({ items: [{ key: 'w:10001', workId: 10001, title: 'Sample', editions: [] }], hasMore: true })
    await catalog.load()
    await catalog.next()
    expect(apiJson).toHaveBeenLastCalledWith('/api/v1/works?libraryId=7&offset=0&after=w%3A10001', undefined, 'common.error')
    await catalog.previous()
    expect(apiJson).toHaveBeenLastCalledWith('/api/v1/works?libraryId=7&offset=0', undefined, 'common.error')
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
})
