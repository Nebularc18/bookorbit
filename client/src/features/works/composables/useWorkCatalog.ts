import { computed, ref } from 'vue'
import { Permission, type WorkCatalogPage, type WorkEdition } from '@bookorbit/types'
import { useRoute } from 'vue-router'
import { apiJson, jsonBody } from '@/lib/api-json'
import { useLibraryPermissions } from '@/features/library/composables/useLibraryPermissions'

export function useWorkCatalog() {
  const route = useRoute()
  const libraryId = Number(route.params.libraryId)
  const language = ref('')
  const format = ref('')
  const offset = ref(0)
  const cursor = ref('')
  const previousCursors: string[] = []
  const page = ref<WorkCatalogPage>({ items: [], hasMore: false })
  const title = ref('')
  const bookIds = ref('')
  const error = ref('')
  const busy = ref(false)
  const { hasLibraryPermission } = useLibraryPermissions()
  const canGroup = computed(() => hasLibraryPermission(Permission.LibraryEditMetadata, libraryId, 'editor'))

  async function load() {
    busy.value = true
    error.value = ''
    try {
      const query = new URLSearchParams({ libraryId: String(libraryId), offset: '0' })
      if (cursor.value) query.set('after', cursor.value)
      if (language.value) query.set('language', language.value)
      if (format.value) query.set('format', format.value)
      page.value = await apiJson<WorkCatalogPage>(`/api/v1/works?${query}`, undefined, 'common.error')
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      busy.value = false
    }
  }
  async function filter() {
    offset.value = 0
    cursor.value = ''
    previousCursors.length = 0
    await load()
  }
  async function next() {
    if (!page.value.hasMore) return
    const last = page.value.items.at(-1)
    if (!last) return
    previousCursors.push(cursor.value)
    cursor.value = last.key
    offset.value += 25
    await load()
  }
  async function previous() {
    cursor.value = previousCursors.pop() ?? ''
    offset.value = Math.max(0, offset.value - 25)
    await load()
  }
  async function mutate(run: () => Promise<unknown>) {
    busy.value = true
    error.value = ''
    try {
      await run()
      await filter()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      busy.value = false
    }
  }
  async function group() {
    await mutate(() =>
      apiJson(
        '/api/v1/works',
        jsonBody('POST', { title: title.value, bookIds: bookIds.value.split(',').map((value) => Number(value.trim())) }),
        'common.error',
      ),
    )
  }
  async function ungroup(workId: number, bookId: number) {
    await mutate(() => apiJson(`/api/v1/works/${workId}/editions/${bookId}`, { method: 'DELETE' }, 'common.error'))
  }
  function readerLink(edition: WorkEdition, file: WorkEdition['files'][number]) {
    return { name: 'reader', params: { bookId: edition.bookId, fileId: file.id }, query: { format: file.format } }
  }
  return { language, format, offset, page, title, bookIds, error, busy, canGroup, load, filter, next, previous, group, ungroup, readerLink }
}
