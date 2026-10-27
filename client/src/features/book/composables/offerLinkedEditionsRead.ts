import { toast } from 'vue-sonner'
import type { LinkedUnreadEditions } from '@bookorbit/types'
import { i18n } from '@/i18n'
import { notifyBookReadingStateChanged } from './useBookProgressRefresh'
import { apiJson, apiSend, jsonBody } from '@/lib/api-json'

export async function offerLinkedEditionsRead(bookId: number): Promise<void> {
  try {
    const { bookIds, automaticReadSync } = await apiJson<LinkedUnreadEditions>(
      `/api/v1/works/editions/${bookId}/linked-unread`,
      undefined,
      'common.error',
    )
    if (automaticReadSync || !bookIds.length) return
    const { t } = i18n.global
    let submitted = false
    toast(t('works.offerRead', { count: bookIds.length }), {
      id: `linked-editions-read-${bookId}`,
      duration: 15000,
      action: {
        label: t('works.markOtherEditionsRead'),
        onClick: () => {
          if (submitted) return
          submitted = true
          void apiSend('/api/v1/books/bulk-set-status', jsonBody('POST', { bookIds, status: 'read' }), 'common.error')
            .then(() => {
              notifyBookReadingStateChanged()
              toast.success(t('works.editionsMarkedRead'))
            })
            .catch(() => toast.error(t('works.markReadFailed')))
        },
      },
    })
  } catch {
    // The original status was saved even if the optional edition lookup fails.
  }
}
