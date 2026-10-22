import { computed, type Ref } from 'vue'
import type { AudiobookManifestChapter } from '@bookorbit/types'

export function useAudioChapterProgress(chapter: Ref<AudiobookManifestChapter | null>, positionMs: Ref<number>, playbackSpeed: Ref<number>) {
  const durationMs = computed(() => (chapter.value ? Math.max(0, chapter.value.endMs - chapter.value.startMs) : 0))
  const elapsedMs = computed(() => (chapter.value ? Math.min(durationMs.value, Math.max(0, positionMs.value - chapter.value.startMs)) : 0))
  const percentage = computed(() => (durationMs.value > 0 ? (elapsedMs.value / durationMs.value) * 100 : 0))
  const remainingSeconds = computed(() => Math.ceil((durationMs.value - elapsedMs.value) / 1000 / playbackSpeed.value))
  const visible = computed(() => durationMs.value > 0)

  return { percentage, remainingSeconds, visible }
}
