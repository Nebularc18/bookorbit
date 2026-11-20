import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBookReaderChoice, type BookOpenMode } from '../useBookReaderChoice'
import type { BookFileRef } from '@bookorbit/types'
import type { RouteLocationRaw } from 'vue-router'

const { push, api } = vi.hoisted(() => ({
  push: vi.fn<(location: RouteLocationRaw) => void>(),
  api: vi.fn<(url: string) => Promise<Pick<Response, 'ok' | 'json'>>>(),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/lib/api', () => ({ api }))

const epub: BookFileRef = { id: 1, format: 'epub', role: 'primary', sizeBytes: 100 }
const audio: BookFileRef = { id: 2, format: 'm4b', role: 'content', sizeBytes: 1000 }
const track: BookFileRef = { ...audio, id: 3 }
const readAlong: BookFileRef = { ...epub, id: 4, mediaOverlay: { available: true, durationSeconds: 600 } }

function setup(files = [epub, audio], mode: BookOpenMode = 'auto') {
  return useBookReaderChoice(
    () => ({ id: 10, status: 'available', files }),
    () => mode,
  )
}

function respond(text: unknown = [], audioProgress: unknown = null) {
  api.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () => (url.endsWith('/playback-state') ? audioProgress : text),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  respond()
})

describe('useBookReaderChoice', () => {
  it('asks before opening an unstarted book with reading and listening versions', async () => {
    const choice = setup()
    await choice.openBook()
    expect(choice.choosing.value).toBe(true)
    expect(push).not.toHaveBeenCalled()
    choice.openFile(audio)
    expect(choice.choosing.value).toBe(false)
    expect(push).toHaveBeenCalledWith({ name: 'reader', params: { bookId: 10, fileId: 2 }, query: { format: 'm4b' } })
  })

  it('opens a single version without fetching progress', async () => {
    await setup([epub]).openBook()
    expect(api).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ params: { bookId: 10, fileId: 1 } }))
  })

  it('resumes an ebook with a saved location even at zero percent', async () => {
    respond([{ fileId: 1, percentage: 0, cfi: 'epubcfi(/6/2)', updatedAt: '2026-10-01' }])
    const choice = setup()
    await choice.openBook()
    expect(choice.choosing.value).toBe(false)
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ params: { bookId: 10, fileId: 1 } }))
  })

  it('resumes the most recently used version, including audiobook progress', async () => {
    respond([{ fileId: 1, percentage: 40, updatedAt: '2026-10-01' }], {
      assetId: 'track-3',
      percentage: 20,
      positionMs: 50000,
      capturedAt: '2026-10-02',
    })
    const choice = setup([epub, audio, track])
    expect(choice.choices.value.map((file) => file.id)).toEqual([1, 2])
    await choice.openBook()
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ params: { bookId: 10, fileId: 2 } }))
  })

  it('resumes a reading version on Continue Reading, ignoring newer audio progress', async () => {
    const pdf: BookFileRef = { ...epub, id: 5, format: 'pdf' }
    respond([
      { fileId: 5, pageNumber: 0, updatedAt: '2026-10-01' },
      { fileId: 2, percentage: 50, updatedAt: '2026-10-02' },
    ])
    await setup([epub, audio, pdf], 'read').openBook()

    expect(api).toHaveBeenCalledExactlyOnceWith('/api/v1/books/10/progress')
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ params: { bookId: 10, fileId: 5 } }))
  })

  it('opens the only audio edition directly on Continue Listening', async () => {
    const choice = setup([epub, audio, track], 'listen')
    await choice.openBook()

    expect(choice.choosing.value).toBe(false)
    expect(api).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ params: { bookId: 10, fileId: 2 } }))
  })

  it('resumes saved read-along narration on Continue Listening', async () => {
    respond([{ fileId: 4, mediaOverlayFragment: 'chapter.xhtml#start', updatedAt: '2026-10-02' }])
    const choice = setup([epub, audio, readAlong], 'listen')
    await choice.openBook()

    expect(choice.choosing.value).toBe(false)
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ params: { bookId: 10, fileId: 4 } }))
  })

  it('does not confuse reading a read-along with listening to it', async () => {
    respond([{ fileId: 4, percentage: 50, updatedAt: '2026-10-02' }], { percentage: 25, positionMs: 50000, capturedAt: '2026-10-01' })
    await setup([epub, audio, readAlong], 'listen').openBook()

    expect(push).toHaveBeenCalledWith(expect.objectContaining({ params: { bookId: 10, fileId: 2 } }))
  })

  it('ignores empty progress rows and progress for unavailable files', async () => {
    respond([
      { fileId: 1, percentage: 0, updatedAt: '2026-10-02' },
      { fileId: 99, percentage: 25, updatedAt: '2026-10-03' },
    ])
    const choice = setup()
    await choice.openBook()
    expect(choice.choosing.value).toBe(true)
    expect(push).not.toHaveBeenCalled()
  })

  it('offers a choice when progress cannot be fetched', async () => {
    api.mockRejectedValue(new TypeError('offline'))
    const choice = setup()
    await choice.openBook()
    expect(choice.choosing.value).toBe(true)
    expect(choice.resolving.value).toBe(false)
  })

  it('does not open missing books', async () => {
    const choice = useBookReaderChoice(() => ({ id: 10, status: 'missing', files: [epub, audio] }))
    await choice.openBook()
    expect(push).not.toHaveBeenCalled()
    expect(api).not.toHaveBeenCalled()
  })

  it('keeps separate ebook files selectable and groups audio tracks', () => {
    expect(setup([epub, { ...epub, id: 4, role: 'content' }, audio, track]).choices.value.map((file) => file.id)).toEqual([1, 4, 2])
  })

  it('allows dismissing without opening a version', async () => {
    const choice = setup()
    await choice.openBook()
    choice.closeChoice()
    expect(choice.choosing.value).toBe(false)
    expect(push).not.toHaveBeenCalled()
  })
})
