import { computed, ref, watch } from 'vue'
import { Permission, type WorkCatalogPage, type WorkEdition } from '@bookorbit/types'
import { useRoute } from 'vue-router'
import { apiJson, jsonBody } from '@/lib/api-json'
import { useLibraryPermissions } from '@/features/library/composables/useLibraryPermissions'

export function useWorkCatalog() {
  const route = useRoute()
  const libraryId = computed(() => Number(route.params.libraryId))
  const autoGroup = ref(true)
  const search = ref('')
  const language = ref('')
  const format = ref('')
  const offset = ref(0)
  const cursor = ref('')
  const previousCursors: string[] = []
  const page = ref<WorkCatalogPage>({ items: [], hasMore: false })
  const title = ref('')
  const bookIds = ref('')
  const selectedBookIds = ref<number[]>([])
  const error = ref('')
  const busy = ref(false)
  const { hasLibraryPermission } = useLibraryPermissions()
  const canGroup = computed(() => hasLibraryPermission(Permission.LibraryEditMetadata, libraryId.value, 'editor'))
  const groupBookIds = computed(() => bookIds.value.split(',').map((value) => Number(value.trim())))
  const canSubmitGroup = computed(
    () =>
      canGroup.value &&
      title.value.trim().length > 0 &&
      groupBookIds.value.length >= 2 &&
      groupBookIds.value.length <= 100 &&
      groupBookIds.value.every((id) => Number.isSafeInteger(id) && id > 0) &&
      new Set(groupBookIds.value).size === groupBookIds.value.length,
  )
  let requestId = 0

  async function load() {
    const currentRequest = ++requestId
    busy.value = true
    error.value = ''
    try {
      const query = new URLSearchParams({ libraryId: String(libraryId.value), offset: '0', autoGroup: String(autoGroup.value) })
      if (cursor.value) query.set('after', cursor.value)
      if (language.value) query.set('language', language.value)
      if (format.value) query.set('format', format.value)
      if (search.value.trim()) query.set('search', search.value.trim())
      const result = await apiJson<WorkCatalogPage>(`/api/v1/works?${query}`, undefined, 'common.error')
      if (currentRequest === requestId) page.value = result
    } catch (cause) {
      if (currentRequest === requestId) error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      if (currentRequest === requestId) busy.value = false
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
      title.value = ''
      bookIds.value = ''
      selectedBookIds.value = []
      await filter()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      busy.value = false
    }
  }
  function toggleEditionSelection(event: Event) {
    const input = event.target as HTMLInputElement
    const id = Number(input.dataset.bookId)
    if (!Number.isSafeInteger(id) || id <= 0) return
    if (input.checked && !selectedBookIds.value.includes(id) && selectedBookIds.value.length < 100) {
      selectedBookIds.value = [...selectedBookIds.value, id]
      if (!title.value) title.value = input.dataset.title ?? ''
    } else if (!input.checked) {
      selectedBookIds.value = selectedBookIds.value.filter((bookId) => bookId !== id)
    }
    bookIds.value = selectedBookIds.value.join(', ')
  }
  async function group() {
    if (!canSubmitGroup.value) return
    await mutate(() => apiJson('/api/v1/works', jsonBody('POST', { title: title.value, bookIds: groupBookIds.value }), 'common.error'))
  }
  async function ungroup(workId: number, bookId: number) {
    await mutate(() => apiJson(`/api/v1/works/${workId}/editions/${bookId}`, { method: 'DELETE' }, 'common.error'))
  }
  function readerLink(edition: WorkEdition, file: WorkEdition['files'][number]) {
    return { name: 'reader', params: { bookId: edition.bookId, fileId: file.id }, query: { format: file.format } }
  }
  watch(libraryId, () => {
    title.value = ''
    bookIds.value = ''
    selectedBookIds.value = []
    page.value = { items: [], hasMore: false }
    void filter()
  })
  return {
    libraryId,
    autoGroup,
    search,
    language,
    format,
    offset,
    page,
    title,
    bookIds,
    selectedBookIds,
    error,
    busy,
    canGroup,
    canSubmitGroup,
    load,
    filter,
    next,
    previous,
    group,
    ungroup,
    readerLink,
    toggleEditionSelection,
  }
}
