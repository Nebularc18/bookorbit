import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import type { AudiobookManifestChapter } from '@bookorbit/types'
import { useAudioChapterProgress } from '../useAudioChapterProgress'

function chapter(startMs = 60_000, endMs = 180_000): AudiobookManifestChapter {
  return { id: 'chapter-2', title: 'Chapter 2', assetId: 'asset-1', sequence: 1, startMs, endMs, assetOffsetMs: startMs }
}

describe('useAudioChapterProgress', () => {
  it('tracks chapter progress on the book timeline and adjusts remaining listening time for speed', () => {
    const position = ref(90_000)
    const speed = ref(1)
    const progress = useAudioChapterProgress(ref(chapter()), position, speed)

    expect(progress.visible.value).toBe(true)
    expect(progress.percentage.value).toBe(25)
    expect(progress.remainingSeconds.value).toBe(90)

    speed.value = 1.5
    expect(progress.remainingSeconds.value).toBe(60)
    expect(progress.percentage.value).toBe(25)

    position.value = 90_100
    expect(progress.remainingSeconds.value).toBe(60)
    position.value = 180_000
    expect(progress.percentage.value).toBe(100)
    expect(progress.remainingSeconds.value).toBe(0)
  })

  it('resets when the active chapter changes and clamps positions outside its bounds', () => {
    const current = ref<AudiobookManifestChapter | null>(chapter())
    const position = ref(180_000)
    const progress = useAudioChapterProgress(current, position, ref(1))

    current.value = chapter(180_000, 240_000)
    expect(progress.percentage.value).toBe(0)
    expect(progress.remainingSeconds.value).toBe(60)
    position.value = 179_000
    expect(progress.percentage.value).toBe(0)
    expect(progress.remainingSeconds.value).toBe(60)
    position.value = 241_000
    expect(progress.percentage.value).toBe(100)
    expect(progress.remainingSeconds.value).toBe(0)
  })

  it('hides the bar without a chapter or a positive chapter duration', () => {
    const current = ref<AudiobookManifestChapter | null>(null)
    const progress = useAudioChapterProgress(current, ref(0), ref(1))

    expect(progress.visible.value).toBe(false)
    expect(progress.percentage.value).toBe(0)
    expect(progress.remainingSeconds.value).toBe(0)
    current.value = chapter(60_000, 60_000)
    expect(progress.visible.value).toBe(false)
    current.value = chapter(60_000, 0)
    expect(progress.visible.value).toBe(false)
    expect(progress.remainingSeconds.value).toBe(0)
  })
})
