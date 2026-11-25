import { Injectable, Logger } from '@nestjs/common';

import { SystemCron } from '../../common/decorators/system-cron.decorator';
import { sanitizeLogValue } from '../../common/utils/log-sanitize.utils';
import { HARDCOVER_RETRY_SWEEP_BATCH_SIZE } from './hardcover.constants';
import { HardcoverRepository } from './hardcover.repository';
import { HardcoverSyncService } from './hardcover-sync.service';

const RETRY_SWEEP_EVENT = 'hardcover.retry_sweep';

@Injectable()
export class HardcoverRetrySchedulerService {
  private readonly logger = new Logger(HardcoverRetrySchedulerService.name);
  private sweepInFlight = false;

  constructor(
    private readonly repo: HardcoverRepository,
    private readonly syncService: HardcoverSyncService,
  ) {}

  @SystemCron('*/2 * * * *')
  async sweepDueRetries(): Promise<void> {
    if (this.sweepInFlight) return;
    this.sweepInFlight = true;

    const startedAt = Date.now();
    try {
      const due = await this.repo.findDueRetryBookStates(new Date(), HARDCOVER_RETRY_SWEEP_BATCH_SIZE);
      if (due.length === 0) return;

      this.logger.log(`[${RETRY_SWEEP_EVENT}] [start] dueBooks=${due.length} - retrying failed Hardcover syncs`);

      const byUser = new Map<number, number[]>();
      for (const row of due) {
        const list = byUser.get(row.userId);
        if (list) list.push(row.bookId);
        else byUser.set(row.userId, [row.bookId]);
      }

      let syncedBooks = 0;
      let failedBooks = 0;
      let skippedBooks = 0;

      await Promise.all(
        Array.from(byUser.entries()).map(async ([userId, bookIds]) => {
          if (this.syncService.getSyncStatus(userId)?.status === 'running') {
            skippedBooks += bookIds.length;
            return;
          }

          for (const bookId of bookIds) {
            try {
              const result = await this.syncService.syncBook(userId, bookId, { isRetry: true });
              if (result === 'synced') syncedBooks++;
              else if (result === 'failed') failedBooks++;
              else skippedBooks++;
            } catch (err) {
              failedBooks++;
              const errorClass = err instanceof Error ? err.constructor.name : 'Error';
              const error = sanitizeLogValue(err instanceof Error ? err.message : String(err));
              this.logger.warn(
                `[${RETRY_SWEEP_EVENT}] [fail] userId=${userId} bookId=${bookId} errorClass=${errorClass} error="${error}" - retry sync threw unexpectedly`,
              );
            }
          }
        }),
      );

      this.logger.log(
        `[${RETRY_SWEEP_EVENT}] [end] durationMs=${Date.now() - startedAt} dueBooks=${due.length} syncedBooks=${syncedBooks} failedBooks=${failedBooks} skippedBooks=${skippedBooks} - retry sweep completed`,
      );
    } catch (err) {
      const errorClass = err instanceof Error ? err.constructor.name : 'Error';
      const error = sanitizeLogValue(err instanceof Error ? err.message : String(err));
      this.logger.error(
        `[${RETRY_SWEEP_EVENT}] [fail] durationMs=${Date.now() - startedAt} errorClass=${errorClass} error="${error}" - retry sweep failed`,
      );
    } finally {
      this.sweepInFlight = false;
    }
  }
}
