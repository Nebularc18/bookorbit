import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { useReadingSession } from '../useReadingSession'

const apiMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>())
vi.mock('@/lib/api', () => ({ api: apiMock }))

describe('useReadingSession - elapsedMinutes', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    apiMock.mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('starts elapsedMinutes at 0', () => {
    const { elapsedMinutes } = useReadingSession(1, () => ({ percentage: 0 }))
    expect(elapsedMinutes.value).toBe(0)
  })

  it('updates elapsedMinutes after onActivity and elapsed time', async () => {
    const { onActivity, elapsedMinutes } = useReadingSession(1, () => ({ percentage: 10 }))

    onActivity()
    expect(elapsedMinutes.value).toBe(0)

    // Advance 2 minutes
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000)
    onActivity()

    // After the 30-second interval update
    await vi.advanceTimersByTimeAsync(30 * 1000)

    expect(elapsedMinutes.value).toBeGreaterThanOrEqual(2)
  })

  it('resets elapsedMinutes to 0 when session ends', async () => {
    const { onActivity, elapsedMinutes, endSession } = useReadingSession(1, () => ({ percentage: 10 }))

    onActivity()
    await vi.advanceTimersByTimeAsync(60 * 1000)
    onActivity()
    await vi.advanceTimersByTimeAsync(30 * 1000)

    expect(elapsedMinutes.value).toBeGreaterThanOrEqual(1)

    endSession()
    expect(elapsedMinutes.value).toBe(0)
  })

  it('pauses elapsed tracking when visibility is hidden', async () => {
    const { onActivity, elapsedMinutes } = useReadingSession(1, () => ({ percentage: 10 }))

    onActivity()
    await vi.advanceTimersByTimeAsync(60 * 1000)

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))

    const elapsed1 = elapsedMinutes.value

    // Time passes while hidden
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)

    // Elapsed should not have increased significantly (only from the interval that ran before pause)
    expect(elapsedMinutes.value).toBeLessThanOrEqual(elapsed1 + 1)

    // Restore visibility
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })

  it('starts a new session after idle timeout', async () => {
    const { onActivity, elapsedMinutes } = useReadingSession(1, () => ({ percentage: 10 }))

    onActivity()
    await vi.advanceTimersByTimeAsync(60 * 1000)
    onActivity()
    await vi.advanceTimersByTimeAsync(30 * 1000)

    const elapsed = elapsedMinutes.value
    expect(elapsed).toBeGreaterThanOrEqual(1)

    // Wait for idle timeout (5 minutes)
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000)

    // After idle timeout, session ends, elapsedMinutes resets
    expect(elapsedMinutes.value).toBe(0)

    // New activity starts a new session
    onActivity()
    expect(elapsedMinutes.value).toBe(0)
  })

  it('caps reading time and its end timestamp when idle timers are suspended for weeks', () => {
    const start = new Date('2026-10-22T10:00:00.000Z')
    vi.setSystemTime(start)
    const { onActivity, endSession } = useReadingSession(1, () => ({ percentage: 10 }))
    onActivity()

    vi.setSystemTime(new Date('2026-11-08T15:45:00.000Z'))
    endSession()

    const body = JSON.parse((apiMock.mock.calls[0]![1] as { body: string }).body)
    expect(body.durationSeconds).toBe(300)
    expect(body.startedAt).toBe(start.toISOString())
    expect(body.endedAt).toBe('2026-10-22T10:05:00.000Z')
  })

  it('starts a separate session when activity resumes before an overdue idle callback runs', async () => {
    vi.setSystemTime(new Date('2026-10-22T10:00:00.000Z'))
    const { onActivity, endSession } = useReadingSession(1, () => ({ percentage: 10 }))
    onActivity()

    vi.setSystemTime(new Date('2026-11-08T15:45:00.000Z'))
    onActivity()
    await vi.advanceTimersByTimeAsync(60_000)
    endSession()

    const bodies = apiMock.mock.calls.map((call) => JSON.parse((call[1] as { body: string }).body))
    expect(bodies).toHaveLength(2)
    expect(bodies[0].durationSeconds).toBe(300)
    expect(bodies[1].durationSeconds).toBe(60)
    expect(bodies[1].startedAt).toBe('2026-11-08T15:45:00.000Z')
    expect(bodies[1].sessionId).not.toBe(bodies[0].sessionId)
  })

  it('caps each active period after a suspended clock before pausing for a hidden tab', async () => {
    vi.setSystemTime(new Date('2026-10-22T10:00:00.000Z'))
    const { onActivity, endSession } = useReadingSession(1, () => ({ percentage: 10 }))
    onActivity()

    vi.setSystemTime(new Date('2026-11-08T15:45:00.000Z'))
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(60_000)
    endSession()

    const body = JSON.parse((apiMock.mock.calls[0]![1] as { body: string }).body)
    expect(body.durationSeconds).toBe(360)
  })

  it('does not track elapsed time or save sessions when tracking is disabled', async () => {
    const trackingEnabled = ref(false)
    const { onActivity, elapsedMinutes, endSession } = useReadingSession(1, () => ({ percentage: 10 }), { trackingEnabled })

    onActivity()
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000)
    endSession()

    expect(elapsedMinutes.value).toBe(0)
    expect(apiMock).not.toHaveBeenCalled()
  })
})

describe('useReadingSession - sessionType', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    apiMock.mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  async function savedBody(options?: Parameters<typeof useReadingSession>[2]): Promise<Record<string, unknown>> {
    const { onActivity, endSession } = useReadingSession(7, () => ({ percentage: 10 }), options)
    onActivity()
    await vi.advanceTimersByTimeAsync(20 * 1000)
    endSession()
    expect(apiMock).toHaveBeenCalledTimes(1)
    const [url, init] = apiMock.mock.calls[0] as [string, { body: string }]
    expect(url).toBe('/api/v1/books/files/7/sessions')
    return JSON.parse(init.body) as Record<string, unknown>
  }

  it('omits sessionType by default so the server records a read session', async () => {
    const body = await savedBody()
    expect(body).not.toHaveProperty('sessionType')
    expect(body).not.toHaveProperty('source')
  })

  it('sends the configured sessionType', async () => {
    const body = await savedBody({ sessionType: 'listen' })
    expect(body.sessionType).toBe('listen')
    expect(body).not.toHaveProperty('source')
  })
})
