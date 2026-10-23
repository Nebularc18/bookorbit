import { getCurrentScope, onScopeDispose } from 'vue'
import { useBookEvents } from './useBookEvents'

const PROGRESS_REFRESH_DEBOUNCE_MS = 250
const readingStateCallbacks = new Set<() => void>()

export function notifyBookReadingStateChanged(): void {
  for (const callback of readingStateCallbacks) callback()
}

export function useBookProgressRefresh(refresh: () => void | Promise<void>): void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const scheduleRefresh = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void refresh()
    }, PROGRESS_REFRESH_DEBOUNCE_MS)
  }
  const cleanup = useBookEvents().onBookProgressChanged(scheduleRefresh)
  readingStateCallbacks.add(scheduleRefresh)

  if (getCurrentScope()) {
    onScopeDispose(() => {
      cleanup()
      readingStateCallbacks.delete(scheduleRefresh)
      if (timer) clearTimeout(timer)
    })
  }
}
