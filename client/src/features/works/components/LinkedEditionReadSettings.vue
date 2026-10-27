<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'
import { useLinkedEditionReadSettings } from '../composables/useLinkedEditionReadSettings'

const props = defineProps<{ libraryId?: number; libraries?: { id: number; name: string }[] }>()
const catalogLinks = computed(() => (props.libraryId ? [{ id: props.libraryId, name: '' }] : (props.libraries ?? [])))
const { t } = useI18n()
const { enabled, disabled, setEnabled } = useLinkedEditionReadSettings()

async function handleToggle(value: boolean) {
  if (!(await setEnabled(value))) toast.error(t('works.syncReadSaveFailed'))
}
</script>

<template>
  <div class="space-y-2 rounded-lg border border-border bg-card p-4">
    <div class="flex items-center justify-between gap-4">
      <div class="min-w-0 space-y-1">
        <p class="text-sm font-medium">{{ t('works.syncReadLabel') }}</p>
        <p class="text-xs text-muted-foreground">{{ t('works.syncReadHint') }}</p>
      </div>
      <ToggleSwitch :model-value="enabled" :disabled="disabled" :aria-label="t('works.syncReadLabel')" @update:model-value="handleToggle" />
    </div>
    <p class="text-xs text-muted-foreground">{{ t('works.syncReadGroupingHint') }}</p>
    <div v-if="catalogLinks.length" class="flex flex-wrap gap-x-4 gap-y-2">
      <RouterLink v-for="library in catalogLinks" :key="library.id" :to="`/library/${library.id}/works`" class="text-sm text-primary underline">
        {{ t('works.manageLinkedEditions') }}<span v-if="library.name">: {{ library.name }}</span>
      </RouterLink>
    </div>
  </div>
</template>
