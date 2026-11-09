import { computed, ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Permission, type BookDetail, type EditionLinkItem, type EditionLinkPage } from '@bookorbit/types'
import { apiJson, errorMessage, jsonBody } from '@/lib/api-json'
import { useLibraryPermissions } from '@/features/library/composables/useLibraryPermissions'

export function useBookEditionLinks(book: Readonly<Ref<BookDetail>>) {
  const { t } = useI18n()
  const { hasLibraryPermission } = useLibraryPermissions()
  const canLink = computed(() => hasLibraryPermission(Permission.LibraryEditMetadata, book.value.libraryId, 'editor'))
  const open = ref(false)
  const search = ref('')
  const linked = ref<EditionLinkItem[]>([])
  const results = ref<EditionLinkItem[]>([])
  const hasMore = ref(false)
  const searching = ref(false)
  const saving = ref(false)
  const error = ref('')
  const notice = ref('')
  const searched = ref(false)
  let requestId = 0
  let linksRequestId = 0

  async function loadLinked() {
    const id = ++linksRequestId
    try {
      const page = await apiJson<EditionLinkPage>(`/api/v1/works/editions/${book.value.id}/linked`, undefined, 'works.loadEditionLinksFailed')
      if (id === linksRequestId) linked.value = page.items
    } catch (cause) {
      if (id === linksRequestId) error.value = errorMessage(cause, 'works.loadEditionLinksFailed')
    }
  }

  async function runSearch(after = 0) {
    const term = search.value.trim()
    if (!canLink.value || term.length < 2 || saving.value) return
    const id = ++requestId
    searching.value = true
    error.value = ''
    const bookId = book.value.id
    try {
      const query = new URLSearchParams({ search: term, after: String(after) })
      const page = await apiJson<EditionLinkPage>(`/api/v1/works/editions/${bookId}/candidates?${query}`, undefined, 'works.searchEditionsFailed')
      if (id !== requestId) return
      results.value = page.items
      hasMore.value = page.hasMore
      searched.value = true
    } catch (cause) {
      if (id === requestId) error.value = errorMessage(cause, 'works.searchEditionsFailed')
    } finally {
      if (id === requestId) searching.value = false
    }
  }

  function submitSearch() {
    return runSearch()
  }
  function nextPage() {
    const last = results.value.at(-1)
    if (hasMore.value && last) return runSearch(last.bookId)
  }
  function showDialog() {
    error.value = ''
    notice.value = ''
    open.value = true
  }
  function updateOpen(value: boolean) {
    if (!saving.value) open.value = value
  }
  function closeDialog() {
    if (!saving.value) open.value = false
  }
  function alreadyLinked(edition: EditionLinkItem) {
    return linked.value.some((item) => item.bookId === edition.bookId)
  }
  async function linkEdition(edition: EditionLinkItem) {
    if (!canLink.value || saving.value || alreadyLinked(edition)) return
    saving.value = true
    error.value = ''
    const bookId = book.value.id
    try {
      await apiJson(
        '/api/v1/works',
        jsonBody('POST', {
          title: book.value.title || edition.title || t('works.edition', { id: bookId }),
          bookIds: [bookId, edition.bookId],
        }),
        'works.linkEditionFailed',
      )
      if (book.value.id !== bookId) return
      await loadLinked()
      open.value = false
      notice.value = t('works.editionLinked')
    } catch (cause) {
      if (book.value.id === bookId) error.value = errorMessage(cause, 'works.linkEditionFailed')
    } finally {
      saving.value = false
    }
  }

  watch(search, () => {
    ++requestId
    searching.value = false
    results.value = []
    searched.value = false
    hasMore.value = false
  })
  watch(
    () => book.value.id,
    () => {
      ++requestId
      ++linksRequestId
      open.value = false
      search.value = ''
      linked.value = []
      results.value = []
      hasMore.value = false
      searched.value = false
      searching.value = false
      error.value = ''
      notice.value = ''
      void loadLinked()
    },
    { immediate: true },
  )

  return {
    canLink,
    open,
    search,
    linked,
    results,
    hasMore,
    searching,
    saving,
    error,
    notice,
    searched,
    showDialog,
    updateOpen,
    closeDialog,
    submitSearch,
    nextPage,
    alreadyLinked,
    linkEdition,
  }
}
