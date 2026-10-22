import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBookReaderChoice } from '../useBookReaderChoice'
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

function setup(files = [epub, audio]) {
  return useBookReaderChoice(() => ({ id: 10, status: 'available', files }))
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
