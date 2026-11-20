import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { isAudioFormat, READER_OPENABLE_FORMATS, type AudiobookPlaybackState, type BookFileRef } from '@bookorbit/types'
import { api } from '@/lib/api'
import { bookFormatEntries } from '../lib/book-formats'
import { hasReadAlong } from '../lib/file-capabilities'

export type BookOpenMode = 'auto' | 'read' | 'listen'

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
  mediaOverlayFragment?: string | null
  koboLocationValue?: string | null
  koreaderProgress?: string | null
}

export function useBookReaderChoice(book: () => ReaderBook, mode: () => BookOpenMode = () => 'auto') {
  const router = useRouter()
  const choosing = ref(false)
  const resolving = ref(false)
  const entries = computed(() => bookFormatEntries(book().files))
  const choices = computed(() =>
    entries.value
      .flatMap((entry) => (entry.audio ? entry.files.slice(0, 1) : entry.files))
      .filter((file) => {
        const format = file.format?.toLowerCase() ?? ''
        if (!READER_OPENABLE_FORMATS.has(format)) return false
        if (mode() === 'read') return !isAudioFormat(format)
        if (mode() === 'listen') return isAudioFormat(format) || hasReadAlong(file)
        return true
      }),
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
    const openMode = mode()
    const audioFile = choices.value.find((file) => isAudioFormat(file.format ?? ''))
    try {
      const [textResponse, audioResponse] = await Promise.all([
        api(`/api/v1/books/${bookId}/progress`),
        audioFile ? api(`/api/v1/audiobooks/${bookId}/playback-state`) : Promise.resolve(null),
      ])
      const positions: SavedPosition[] = textResponse.ok ? await textResponse.json() : []
      const audio: AudiobookPlaybackState | null = audioResponse?.ok ? await audioResponse.json() : null
      if (audio && audioFile && (audio.percentage > 0 || audio.positionMs > 0)) {
        positions.push({ fileId: audioFile.id, percentage: audio.percentage, positionSeconds: audio.positionMs / 1000, updatedAt: audio.capturedAt })
      }
      if (book().id !== bookId || mode() !== openMode) return
      const recent = positions
        .filter((position) => {
          if (openMode === 'listen') {
            return (
              (position.fileId === audioFile?.id && position.percentage > 0) || (position.positionSeconds ?? 0) > 0 || !!position.mediaOverlayFragment
            )
          }
          return (
            position.percentage > 0 ||
            !!position.cfi ||
            position.pageNumber != null ||
            !!position.koboLocationValue ||
            !!position.koreaderProgress ||
            (openMode === 'auto' && ((position.positionSeconds ?? 0) > 0 || !!position.mediaOverlayFragment))
          )
        })
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
      if (book().id === bookId && mode() === openMode) choosing.value = true
    } finally {
      resolving.value = false
    }
  }

  return { choices, choosing, resolving, openBook, openFile, closeChoice }
}
