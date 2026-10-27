import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Permission } from '@bookorbit/types';
import { sanitizeLogValue } from '../../common/utils/log-sanitize.utils';
import {
  AchievementEventsService,
  ACHIEVEMENT_EVENT_BOOK_STATUS_CHANGED,
  type BookStatusChangedPayload,
} from '../achievement/achievement-events.service';
import { BookService } from '../book/book.service';
import { UserService } from '../user/user.service';
import { WorkService } from './work.service';

@Injectable()
export class WorkReadSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkReadSyncService.name);
  private readonly syncing = new AsyncLocalStorage<boolean>();
  private readonly pending = new Map<number, Promise<void>>();

  constructor(
    private readonly events: AchievementEventsService,
    private readonly users: UserService,
    private readonly works: WorkService,
    private readonly books: BookService,
  ) {}

  private readonly onStatusChanged = (payload: BookStatusChangedPayload): void => {
    if (payload.newStatus !== 'read' || this.syncing.getStore()) return;
    const previous = this.pending.get(payload.userId) ?? Promise.resolve();
    const next = previous.then(() => this.syncing.run(true, () => this.sync(payload)));
    this.pending.set(payload.userId, next);
    void next.finally(() => {
      if (this.pending.get(payload.userId) === next) this.pending.delete(payload.userId);
    });
  };

  onModuleInit(): void {
    this.events.on(ACHIEVEMENT_EVENT_BOOK_STATUS_CHANGED, this.onStatusChanged);
  }

  onModuleDestroy(): void {
    this.events.off(ACHIEVEMENT_EVENT_BOOK_STATUS_CHANGED, this.onStatusChanged);
  }

  private async sync({ userId, bookId }: BookStatusChangedPayload): Promise<void> {
    const started = Date.now();
    try {
      const user = await this.users.findByIdWithPermissions(userId);
      if (!user?.active || user.settings.syncLinkedEditionsRead !== true || user.permissions.includes(Permission.DemoRestricted)) return;
      this.logger.log(`[work.sync_read] [start] userId=${userId} bookId=${bookId} - linked edition read sync started`);
      let updated = 0;
      for (;;) {
        const { bookIds } = await this.works.linkedUnreadEditions(bookId, user);
        if (!bookIds.length) break;
        await this.books.bulkSetStatus(bookIds, 'read', user);
        updated += bookIds.length;
      }
      this.logger.log(
        `[work.sync_read] [end] userId=${userId} bookId=${bookId} durationMs=${Date.now() - started} updated=${updated} - linked edition read sync completed`,
      );
    } catch (error) {
      this.logger.warn(
        `[work.sync_read] [fail] userId=${userId} bookId=${bookId} durationMs=${Date.now() - started} errorClass=${error instanceof Error ? error.name : 'Unknown'} error="${sanitizeLogValue(error instanceof Error ? error.message : String(error))}" - linked edition read sync failed`,
      );
    }
  }
}
