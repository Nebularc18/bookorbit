<script setup lang="ts">
import type { BookFileRef } from '@bookorbit/types'
import { isAudioFormat } from '@bookorbit/types'
import { BookOpen, Play, X } from '@lucide/vue'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { useI18n } from 'vue-i18n'
import { fileFormatKey, formatKeyName } from '../lib/book-formats'
import { formatBytes } from '@/lib/formatting'
import BookFormatChip from './BookFormatChip.vue'

defineProps<{ files: BookFileRef[] }>()
const emit = defineEmits<{ select: [file: BookFileRef]; close: [] }>()
const { t } = useI18n()

function handleOpenChange(open: boolean) {
  if (!open) emit('close')
}
function close() {
  emit('close')
}
function select(file: BookFileRef) {
  emit('select', file)
}
function label(file: BookFileRef) {
  const format = formatKeyName(fileFormatKey(file) ?? '?')
  return t(isAudioFormat(file.format ?? '') ? 'book.table.read.playFormat' : 'book.table.read.readFormat', { format })
}
</script>

<template>
  <DialogRoot :open="true" @update:open="handleOpenChange">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-scrim" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-5 shadow-xl"
        @click.stop
      >
        <DialogTitle class="pr-8 text-base font-semibold text-foreground">{{ t('book.table.read.chooseFormat') }}</DialogTitle>
        <DialogDescription class="mt-1 text-sm text-muted-foreground">{{ t('book.actions.chooseVersionDescription') }}</DialogDescription>
        <button
          type="button"
          class="absolute right-4 top-4 rounded-sm p-1 text-muted-foreground hover:text-foreground"
          :aria-label="t('common.close')"
          @click="close"
        >
          <X class="size-4" />
        </button>
        <div class="mt-4 max-h-80 space-y-2 overflow-y-auto">
          <button
            v-for="file in files"
            :key="file.id"
            type="button"
            class="flex w-full items-center gap-3 rounded-md border border-border px-3 py-3 text-left text-sm text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            @click="select(file)"
          >
            <Play v-if="isAudioFormat(file.format ?? '')" class="size-4 shrink-0 text-primary" />
            <BookOpen v-else class="size-4 shrink-0 text-primary" />
            <span class="min-w-0 flex-1">
              <span class="block">{{ label(file) }}</span>
              <span v-if="file.sizeBytes != null" class="block text-xs text-muted-foreground">{{ formatBytes(file.sizeBytes) }}</span>
            </span>
            <BookFormatChip :format-key="fileFormatKey(file) ?? '?'" />
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
