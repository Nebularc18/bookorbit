import { computed, ref } from 'vue'
import type { UserSettings } from '@bookorbit/types'
import { useAuth } from '@/features/auth/composables/useAuth'
import { usePermissions } from '@/features/auth/composables/usePermissions'
import { apiSend, jsonBody } from '@/lib/api-json'

const saving = ref(false)

export function useLinkedEditionReadSettings() {
  const { user } = useAuth()
  const { isDemoRestrictedAccount } = usePermissions()
  const enabled = computed(() => user.value?.settings?.syncLinkedEditionsRead === true)
  const disabled = computed(() => saving.value || !user.value || isDemoRestrictedAccount.value)

  async function setEnabled(value: boolean): Promise<boolean> {
    if (disabled.value || !user.value) return false
    const userId = user.value.id
    saving.value = true
    try {
      const settings: Pick<UserSettings, 'syncLinkedEditionsRead'> = { syncLinkedEditionsRead: value }
      await apiSend('/api/v1/users/me/settings', jsonBody('PATCH', { settings }), 'common.error')
      if (user.value?.id !== userId) return false
      user.value = { ...user.value, settings: { ...user.value.settings, ...settings } }
      return true
    } catch {
      return false
    } finally {
      saving.value = false
    }
  }

  return { enabled, disabled, setEnabled }
}
