import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiJson, apiSend } from '@/lib/api-json'
import { toast } from 'vue-sonner'
import { notifyBookReadingStateChanged } from '../useBookProgressRefresh'
import { offerLinkedEditionsRead } from '../offerLinkedEditionsRead'

vi.mock('../useBookProgressRefresh', () => ({ notifyBookReadingStateChanged: vi.fn<typeof notifyBookReadingStateChanged>() }))

vi.mock('@/lib/api-json', async (original) => ({
  ...(await original<typeof import('@/lib/api-json')>()),
  apiJson: vi.fn<typeof apiJson>(),
  apiSend: vi.fn<typeof apiSend>(),
}))
vi.mock('vue-sonner', () => ({
  toast: Object.assign(vi.fn<typeof toast>(), { success: vi.fn<typeof toast.success>(), error: vi.fn<typeof toast.error>() }),
}))

describe('linked edition read offer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  it('waits for acceptance before changing other editions and submits only once', async () => {
    vi.mocked(apiJson).mockResolvedValue({ bookIds: [2, 3] })
    vi.mocked(apiSend).mockResolvedValue(undefined)
    await offerLinkedEditionsRead(1)
    expect(apiJson).toHaveBeenCalledWith('/api/v1/works/editions/1/linked-unread', undefined, 'common.error')
    expect(apiSend).not.toHaveBeenCalled()
    const options = vi.mocked(toast).mock.calls[0]![1]!
    const action = options.action as { onClick: () => void }
    action.onClick()
    action.onClick()
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(apiSend).toHaveBeenCalledTimes(1)
    expect(notifyBookReadingStateChanged).toHaveBeenCalledOnce()
    expect(apiSend).toHaveBeenCalledWith(
      '/api/v1/books/bulk-set-status',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookIds: [2, 3], status: 'read' }),
      }),
      'common.error',
    )
  })
  it('does not offer an update without unread linked editions', async () => {
    vi.mocked(apiJson).mockResolvedValue({ bookIds: [] })
    await offerLinkedEditionsRead(1)
    expect(toast).not.toHaveBeenCalled()
    expect(apiSend).not.toHaveBeenCalled()
  })
  it('keeps the original save successful when the optional lookup fails', async () => {
    vi.mocked(apiJson).mockRejectedValue(new Error('offline'))
    await expect(offerLinkedEditionsRead(1)).resolves.toBeUndefined()
    expect(toast).not.toHaveBeenCalled()
  })
  it('reports failure of an accepted update', async () => {
    vi.mocked(apiJson).mockResolvedValue({ bookIds: [2] })
    vi.mocked(apiSend).mockRejectedValue(new Error('forbidden'))
    await offerLinkedEditionsRead(1)
    const action = vi.mocked(toast).mock.calls[0]![1]!.action as { onClick: () => void }
    action.onClick()
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(toast.success).not.toHaveBeenCalled()
  })
})
