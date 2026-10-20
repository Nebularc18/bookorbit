<script setup lang="ts">
import { onMounted } from 'vue'
import { useWorkCatalog } from './composables/useWorkCatalog'
const { language, format, offset, page, title, bookIds, error, busy, canGroup, load, filter, next, previous, group, ungroup, readerLink } =
  useWorkCatalog()
onMounted(load)
</script>

<template>
  <main class="mx-auto w-full max-w-5xl space-y-6 p-4">
    <h1 class="text-2xl font-semibold">Household works</h1>
    <p class="text-muted-foreground">Choose an edition to read or listen. Positions, ratings and history stay with each edition and account.</p>
    <form class="flex flex-wrap items-end gap-3" @submit.prevent="filter">
      <label class="flex flex-col gap-1"
        >Language
        <select v-model="language" class="rounded border border-border bg-background p-2">
          <option value="">All languages</option>
          <option value="en">English</option>
          <option value="sv">Swedish</option>
        </select>
      </label>
      <label class="flex flex-col gap-1"
        >Format
        <select v-model="format" class="rounded border border-border bg-background p-2">
          <option value="">All formats</option>
          <option value="epub">EPUB</option>
          <option value="audio">Audiobooks (all formats)</option>
          <option value="mp3">MP3</option>
          <option value="m4b">M4B</option>
        </select>
      </label>
      <button :disabled="busy" class="rounded bg-primary px-4 py-2 text-primary-foreground">Filter editions</button>
    </form>
    <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
    <p v-if="!busy && !page.items.length">No matching editions.</p>
    <article v-for="work in page.items" :key="work.key" class="space-y-3 rounded border border-border bg-card p-4">
      <h2 class="text-xl font-semibold">{{ work.title }}</h2>
      <ul class="space-y-3">
        <li v-for="edition in work.editions" :key="edition.bookId" class="flex flex-wrap items-center gap-3">
          <RouterLink :to="`/book/${edition.bookId}`" class="underline">Edition #{{ edition.bookId }}</RouterLink>
          <span>{{ edition.language || 'Unknown language' }}</span>
          <span v-if="edition.narrators.length">{{ edition.narrators.join(', ') }}</span>
          <RouterLink v-for="file in edition.files" :key="file.id" :to="readerLink(edition, file)" class="rounded border border-border px-3 py-1">
            Open {{ file.format.toUpperCase() }}
          </RouterLink>
          <button v-if="canGroup && work.workId" :disabled="busy" class="text-sm underline" @click="ungroup(work.workId, edition.bookId)">
            Ungroup edition
          </button>
        </li>
      </ul>
    </article>
    <nav aria-label="Catalog pages" class="flex gap-4">
      <button :disabled="busy || offset === 0" @click="previous">Previous</button>
      <button :disabled="busy || !page.hasMore" @click="next">Next</button>
    </nav>
    <form v-if="canGroup" class="space-y-3 rounded border border-border p-4" @submit.prevent="group">
      <h2 class="font-semibold">Group editions</h2>
      <p class="text-sm text-muted-foreground">
        Use ungrouped edition IDs from this library. Files and progress stay in place. Library editor access is required.
      </p>
      <label class="block"
        >Work title<input v-model="title" required maxlength="1000" class="mt-1 block w-full rounded border border-border bg-background p-2"
      /></label>
      <label class="block"
        >Edition IDs, separated by commas<input
          v-model="bookIds"
          required
          class="mt-1 block w-full rounded border border-border bg-background p-2"
          placeholder="1, 2, 3, 4"
      /></label>
      <button :disabled="busy" class="rounded bg-primary px-4 py-2 text-primary-foreground">Group editions</button>
    </form>
  </main>
</template>
