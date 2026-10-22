import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { READER_OPENABLE_FORMATS, type AudiobookPlaybackState, type BookFileRef } from '@bookorbit/types'
import { api } from '@/lib/api'
import { bookFormatEntries } from '../lib/book-formats'

interface ReaderBook {
  id: number
  status?: string
  files: BookFileRef[]
}

interface SavedPosition {
  fileId: number
  percentage: number
  updatedAt: string | null
  cfi?: string | null
  pageNumber?: number | null
  positionSeconds?: number | null
  koboLocationValue?: string | null
  koreaderProgress?: string | null
}

export function useBookReaderChoice(book: () => ReaderBook) {
  const router = useRouter()
  const choosing = ref(false)
  const resolving = ref(false)
  const entries = computed(() => bookFormatEntries(book().files))
  const choices = computed(() =>
    entries.value
      .flatMap((entry) => (entry.audio ? entry.files.slice(0, 1) : entry.files))
      .filter((file) => READER_OPENABLE_FORMATS.has(file.format?.toLowerCase() ?? '')),
  )

  function openFile(file: BookFileRef) {
    choosing.value = false
    if (book().status === 'missing') return
    void router.push({ name: 'reader', params: { bookId: book().id, fileId: file.id }, query: { format: file.format ?? 'epub' } })
  }

  function closeChoice() {
    choosing.value = false
  }

  async function openBook() {
    if (resolving.value || book().status === 'missing' || choices.value.length === 0) return
    if (choices.value.length === 1) {
      openFile(choices.value[0]!)
      return
    }

    resolving.value = true
    const bookId = book().id
    try {
      const [textResponse, audioResponse] = await Promise.all([
        api(`/api/v1/books/${bookId}/progress`),
        entries.value.some((entry) => entry.audio) ? api(`/api/v1/audiobooks/${bookId}/playback-state`) : Promise.resolve(null),
      ])
      const positions: SavedPosition[] = textResponse.ok ? await textResponse.json() : []
      const audio: AudiobookPlaybackState | null = audioResponse?.ok ? await audioResponse.json() : null
      const audioFile = entries.value.find((entry) => entry.audio)?.files[0]
      if (audio && audioFile && (audio.percentage > 0 || audio.positionMs > 0)) {
        positions.push({ fileId: audioFile.id, percentage: audio.percentage, positionSeconds: audio.positionMs / 1000, updatedAt: audio.capturedAt })
      }
      if (book().id !== bookId) return
      const recent = positions
        .filter(
          (position) =>
            position.percentage > 0 ||
            !!position.cfi ||
            (position.pageNumber ?? 0) > 0 ||
            (position.positionSeconds ?? 0) > 0 ||
            !!position.koboLocationValue ||
            !!position.koreaderProgress,
        )
        .sort((a, b) => (Date.parse(b.updatedAt ?? '') || 0) - (Date.parse(a.updatedAt ?? '') || 0))
      for (const position of recent) {
        const entry = entries.value.find((item) => item.files.some((file) => file.id === position.fileId))
        const file = entry?.audio ? entry.files[0] : choices.value.find((file) => file.id === position.fileId)
        if (file && choices.value.some((choice) => choice.id === file.id)) {
          openFile(file)
          return
        }
      }
      choosing.value = true
    } catch {
      if (book().id === bookId) choosing.value = true
    } finally {
      resolving.value = false
    }
  }

  return { choices, choosing, resolving, openBook, openFile, closeChoice }
}
