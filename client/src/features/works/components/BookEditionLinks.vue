<script setup lang="ts">
import { toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import type { BookDetail, EditionLinkItem } from '@bookorbit/types'
import { useBookEditionLinks } from '../composables/useBookEditionLinks'

const props = defineProps<{ book: BookDetail }>()
const { t } = useI18n()
const {
  canLink,
  open,
  search,
  linked,
  results,
  hasMore,
  searching,
  saving,
  error,
  notice,
  searched,
  showDialog,
  updateOpen,
  closeDialog,
  submitSearch,
  nextPage,
  alreadyLinked,
  linkEdition,
} = useBookEditionLinks(toRef(props, 'book'))

function editionDescription(edition: EditionLinkItem) {
  return [edition.libraryName, edition.language, edition.formats.map((format) => format.toUpperCase()).join(', ')].filter(Boolean).join(' · ')
}
</script>

<template>
  <div v-if="canLink || linked.length || error" class="mt-3 space-y-2 border-t border-border pt-3">
    <p v-if="linked.length" class="text-xs font-medium">{{ t('works.linkedEditions') }}</p>
    <ul v-if="linked.length" class="space-y-2">
      <li v-for="edition in linked" :key="edition.bookId" class="min-w-0 text-xs">
        <RouterLink :to="`/book/${edition.bookId}`" class="break-words text-primary underline">
          {{ edition.title || t('works.edition', { id: edition.bookId }) }}
        </RouterLink>
        <p class="break-words text-muted-foreground">{{ editionDescription(edition) }}</p>
      </li>
    </ul>
    <RouterLink v-if="canLink && linked.length" :to="`/library/${book.libraryId}/works`" class="block text-xs text-primary underline">
      {{ t('works.manageLinkedEditions') }}
    </RouterLink>
    <button v-if="canLink" type="button" class="text-xs text-primary underline" @click="showDialog">{{ t('works.linkAnotherEdition') }}</button>
    <p v-if="notice" role="status" class="text-xs text-muted-foreground">{{ notice }}</p>
    <p v-if="error && !open" role="alert" class="text-xs text-destructive">{{ error }}</p>

    <DialogRoot :open="open" @update:open="updateOpen">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-50 bg-scrim backdrop-blur-sm" />
        <DialogContent
          class="fixed left-1/2 top-1/2 z-50 max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 space-y-4 overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-lg"
        >
          <DialogTitle class="text-lg font-semibold">{{ t('works.linkAnotherEdition') }}</DialogTitle>
          <DialogDescription class="text-sm text-muted-foreground">{{ t('works.linkEditionHint') }}</DialogDescription>
          <form class="flex flex-wrap gap-2" @submit.prevent="submitSearch">
            <label class="min-w-0 flex-1 space-y-1 text-sm">
              <span>{{ t('works.search') }}</span>
              <input
                v-model="search"
                type="search"
                minlength="2"
                maxlength="200"
                required
                :disabled="saving"
                class="block w-full rounded border border-border bg-background p-2"
              />
            </label>
            <button
              type="submit"
              :disabled="search.trim().length < 2 || searching || saving"
              class="self-end rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
            >
              {{ t('common.search') }}
            </button>
          </form>
          <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
          <p v-if="searched && !searching && !results.length" class="text-sm text-muted-foreground">{{ t('works.empty') }}</p>
          <ul :aria-busy="searching || saving" class="space-y-2">
            <li v-for="edition in results" :key="edition.bookId" class="flex items-center gap-3 rounded border border-border p-3">
              <div class="min-w-0 flex-1">
                <p class="break-words text-sm font-medium">{{ edition.title || t('works.edition', { id: edition.bookId }) }}</p>
                <p class="break-words text-xs text-muted-foreground">{{ editionDescription(edition) }}</p>
              </div>
              <button
                type="button"
                :disabled="saving || searching || alreadyLinked(edition)"
                class="shrink-0 rounded border border-border px-3 py-2 text-sm disabled:opacity-50"
                @click="linkEdition(edition)"
              >
                {{ alreadyLinked(edition) ? t('works.alreadyLinked') : t('works.linkEdition') }}
              </button>
            </li>
          </ul>
          <div class="flex justify-between gap-3">
            <button v-if="hasMore" type="button" :disabled="searching || saving" class="text-sm underline disabled:opacity-50" @click="nextPage">
              {{ t('works.next') }}
            </button>
            <button
              type="button"
              :disabled="saving"
              class="ml-auto rounded border border-border px-3 py-2 text-sm disabled:opacity-50"
              @click="closeDialog"
            >
              {{ t('common.close') }}
            </button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </div>
</template>
