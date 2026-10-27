<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import LinkedEditionReadSettings from './components/LinkedEditionReadSettings.vue'
import { useWorkCatalog } from './composables/useWorkCatalog'
const { t } = useI18n()
const {
  libraryId,
  autoGroup,
  search,
  language,
  format,
  offset,
  page,
  title,
  bookIds,
  selectedBookIds,
  error,
  busy,
  canGroup,
  canMarkRead,
  markEditionsRead,
  editionsMarkedRead,
  canSubmitGroup,
  load,
  filter,
  next,
  previous,
  group,
  ungroup,
  readerLink,
  toggleEditionSelection,
} = useWorkCatalog()
onMounted(load)
</script>

<template>
  <main class="mx-auto w-full max-w-5xl space-y-6 p-4">
    <RouterLink :to="`/library/${libraryId}`" class="text-sm underline">{{ t('works.backToLibrary') }}</RouterLink>
    <h1 class="text-2xl font-semibold">{{ t('works.title') }}</h1>
    <p class="text-muted-foreground">{{ t('works.description') }}</p>
    <LinkedEditionReadSettings />
    <label class="flex items-center gap-2">
      <input v-model="autoGroup" type="checkbox" :disabled="busy" @change="filter" />
      {{ t('works.automaticGrouping') }}
    </label>
    <p class="text-sm text-muted-foreground">{{ t('works.automaticHint') }}</p>
    <form class="flex flex-wrap items-end gap-3" @submit.prevent="filter">
      <label class="flex flex-col gap-1">
        {{ t('works.search') }}
        <input v-model="search" type="search" maxlength="200" class="rounded border border-border bg-background p-2" />
      </label>
      <label class="flex flex-col gap-1"
        >{{ t('works.language') }}
        <select v-model="language" class="rounded border border-border bg-background p-2">
          <option value="">{{ t('works.allLanguages') }}</option>
          <option value="en">English</option>
          <option value="sv">Swedish</option>
        </select>
      </label>
      <label class="flex flex-col gap-1"
        >{{ t('works.format') }}
        <select v-model="format" class="rounded border border-border bg-background p-2">
          <option value="">{{ t('works.allFormats') }}</option>
          <option value="epub">EPUB</option>
          <option value="audio">{{ t('works.allAudio') }}</option>
          <option value="mp3">MP3</option>
          <option value="m4b">M4B</option>
        </select>
      </label>
      <button :disabled="busy" class="rounded bg-primary px-4 py-2 text-primary-foreground">{{ t('works.filter') }}</button>
    </form>
    <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
    <p v-if="!busy && !page.items.length">{{ t('works.empty') }}</p>
    <article v-for="work in page.items" :key="work.key" class="space-y-3 rounded border border-border bg-card p-4">
      <h2 class="text-xl font-semibold">{{ work.title }}</h2>
      <p v-if="work.automaticallyGrouped" class="text-sm text-muted-foreground">{{ t('works.automaticMatch') }}</p>
      <button
        v-if="canMarkRead && work.editions.length"
        :disabled="busy || editionsMarkedRead(work)"
        class="rounded border border-border px-3 py-2 text-sm disabled:opacity-50"
        @click="markEditionsRead(work)"
      >
        {{ t('works.markEditionsRead', { count: work.editions.length }) }}
      </button>
      <p v-if="editionsMarkedRead(work)" role="status" class="text-sm text-muted-foreground">{{ t('works.editionsMarkedRead') }}</p>
      <ul class="space-y-3">
        <li v-for="edition in work.editions" :key="edition.bookId" class="flex flex-wrap items-center gap-3">
          <label v-if="canGroup && !edition.savedWorkId" class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              :data-book-id="edition.bookId"
              :data-title="edition.title || work.title"
              :checked="selectedBookIds.includes(edition.bookId)"
              :disabled="busy || (selectedBookIds.length >= 100 && !selectedBookIds.includes(edition.bookId))"
              @change="toggleEditionSelection"
            />
            {{ t('works.selectEdition', { id: edition.bookId }) }}
          </label>
          <RouterLink :to="`/book/${edition.bookId}`" class="underline">{{ edition.title || t('works.edition', { id: edition.bookId }) }}</RouterLink>
          <span>{{ edition.language || t('works.unknownLanguage') }}</span>
          <span v-if="edition.narrators.length">{{ edition.narrators.join(', ') }}</span>
          <RouterLink v-for="file in edition.files" :key="file.id" :to="readerLink(edition, file)" class="rounded border border-border px-3 py-1">
            {{ t('works.openFormat', { format: file.format.toUpperCase() }) }}
          </RouterLink>
          <button
            v-if="canGroup && edition.savedWorkId"
            :disabled="busy"
            class="text-sm underline"
            @click="ungroup(edition.savedWorkId, edition.bookId)"
          >
            {{ t('works.ungroup') }}
          </button>
        </li>
      </ul>
      <p v-if="work.hasMoreEditions" class="text-sm text-muted-foreground">{{ t('works.moreEditions') }}</p>
    </article>
    <nav :aria-label="t('works.pages')" class="flex gap-4">
      <button :disabled="busy || offset === 0" @click="previous">{{ t('works.previous') }}</button>
      <button :disabled="busy || !page.hasMore" @click="next">{{ t('works.next') }}</button>
    </nav>
    <form v-if="canGroup" class="space-y-3 rounded border border-border p-4" @submit.prevent="group">
      <h2 class="font-semibold">{{ t('works.group') }}</h2>
      <p class="text-sm text-muted-foreground">
        {{ t('works.groupHint') }}
      </p>
      <label class="block"
        >{{ t('works.workTitle')
        }}<input v-model="title" required maxlength="1000" class="mt-1 block w-full rounded border border-border bg-background p-2"
      /></label>
      <label class="block"
        >{{ t('works.editionIds')
        }}<input v-model="bookIds" required class="mt-1 block w-full rounded border border-border bg-background p-2" placeholder="1, 2, 3, 4"
      /></label>
      <button :disabled="busy || !canSubmitGroup" class="rounded bg-primary px-4 py-2 text-primary-foreground">{{ t('works.group') }}</button>
    </form>
  </main>
</template>
