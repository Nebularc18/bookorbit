import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import LinkedEditionReadSettings from '../LinkedEditionReadSettings.vue'
import { apiSend } from '@/lib/api-json'

const auth = vi.hoisted(() => ({
  user: null as unknown as ReturnType<typeof ref<{ id: number; permissions: string[]; settings: Record<string, unknown> } | null>>,
}))
vi.mock('@/features/auth/composables/useAuth', () => ({ useAuth: () => auth }))
vi.mock('@/lib/api-json', async (original) => ({
  ...(await original<typeof import('@/lib/api-json')>()),
  apiSend: vi.fn<typeof apiSend>(),
}))
vi.mock('vue-sonner', () => ({ toast: { error: vi.fn<(...args: unknown[]) => void>() } }))

function render() {
  return mount(LinkedEditionReadSettings, {
    props: { libraryId: 3 },
    global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
  })
}

describe('linked edition completion setting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.user = ref({ id: 7, permissions: [], settings: {} })
    vi.mocked(apiSend).mockResolvedValue(undefined)
  })

  it('saves the opt-in for the current account and links to edition management', async () => {
    const wrapper = render()
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('false')
    expect(wrapper.get('a').attributes('href')).toBe('/library/3/works')
    await wrapper.get('[role="switch"]').trigger('click')
    await flushPromises()
    expect(apiSend).toHaveBeenCalledWith(
      '/api/v1/users/me/settings',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ settings: { syncLinkedEditionsRead: true } }) }),
      'common.error',
    )
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true')
    wrapper.unmount()
    expect(render().get('[role="switch"]').attributes('aria-checked')).toBe('true')
  })

  it('keeps the previous value if saving fails', async () => {
    vi.mocked(apiSend).mockRejectedValue(new Error('offline'))
    const wrapper = render()
    await wrapper.get('[role="switch"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('false')
  })

  it('does not apply a completed save to a different signed-in account', async () => {
    let complete!: () => void
    vi.mocked(apiSend).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve
        }),
    )
    const wrapper = render()
    await wrapper.get('[role="switch"]').trigger('click')
    auth.user.value = { id: 8, permissions: [], settings: {} }
    complete()
    await flushPromises()
    expect(auth.user.value.settings).toEqual({})
  })
})
