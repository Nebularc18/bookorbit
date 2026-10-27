import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { Permission } from '@bookorbit/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestUser } from '../../common/types/request-user';
import { AchievementEventsService, ACHIEVEMENT_EVENT_BOOK_STATUS_CHANGED } from '../achievement/achievement-events.service';
import { UserService } from '../user/user.service';
import { BookService } from '../book/book.service';
import { WorkService } from './work.service';
import { WorkReadSyncService } from './work-read-sync.service';

const reader = { id: 7, active: true, permissions: [], settings: { syncLinkedEditionsRead: true } } as unknown as RequestUser;

describe('linked edition completion sync', () => {
  let service: WorkReadSyncService;
  let events: AchievementEventsService;
  const users = { findByIdWithPermissions: vi.fn<UserService['findByIdWithPermissions']>() };
  const works = { linkedUnreadEditions: vi.fn<WorkService['linkedUnreadEditions']>() };
  const books = { bulkSetStatus: vi.fn<BookService['bulkSetStatus']>() };
  const finish = (bookId = 1, userId = 7) =>
    events.emit(ACHIEVEMENT_EVENT_BOOK_STATUS_CHANGED, { userId, bookId, newStatus: 'read', previousStatus: 'reading' });
  const settled = () => new Promise<void>((resolve) => setImmediate(resolve));

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    users.findByIdWithPermissions.mockResolvedValue(reader);
    works.linkedUnreadEditions.mockResolvedValue({ bookIds: [] });
    books.bulkSetStatus.mockResolvedValue(undefined);
    const module = await Test.createTestingModule({
      providers: [
        WorkReadSyncService,
        AchievementEventsService,
        { provide: UserService, useValue: users },
        { provide: WorkService, useValue: works },
        { provide: BookService, useValue: books },
      ],
    }).compile();
    events = module.get(AchievementEventsService);
    service = module.get(WorkReadSyncService);
    service.onModuleInit();
  });

  it('marks linked translations and formats read for the reader after a completion event', async () => {
    works.linkedUnreadEditions.mockResolvedValueOnce({ bookIds: [2, 3] });
    finish();
    await settled();
    expect(works.linkedUnreadEditions).toHaveBeenCalledWith(1, reader);
    expect(books.bulkSetStatus).toHaveBeenCalledWith([2, 3], 'read', reader);
  });

  it.each([{}, { syncLinkedEditionsRead: false }, { syncLinkedEditionsRead: 'true' }])('requires explicit opt-in: %j', async (settings) => {
    users.findByIdWithPermissions.mockResolvedValue({ ...reader, settings });
    finish();
    await settled();
    expect(works.linkedUnreadEditions).not.toHaveBeenCalled();
  });

  it.each([null, { ...reader, active: false }, { ...reader, permissions: [Permission.DemoRestricted] }])(
    'does not update editions for an unavailable or restricted reader',
    async (user) => {
      users.findByIdWithPermissions.mockResolvedValue(user);
      finish();
      await settled();
      expect(books.bulkSetStatus).not.toHaveBeenCalled();
    },
  );

  it('does not propagate reading or unread status', async () => {
    events.emit(ACHIEVEMENT_EVENT_BOOK_STATUS_CHANGED, { userId: 7, bookId: 1, newStatus: 'unread' });
    await settled();
    expect(users.findByIdWithPermissions).not.toHaveBeenCalled();
  });

  it('processes further batches without recursively syncing the generated completions', async () => {
    works.linkedUnreadEditions.mockResolvedValueOnce({ bookIds: [2] }).mockResolvedValueOnce({ bookIds: [3] });
    books.bulkSetStatus.mockImplementation((ids) => {
      finish(ids[0]);
      return Promise.resolve();
    });
    finish();
    await settled();
    expect(books.bulkSetStatus).toHaveBeenCalledTimes(2);
    expect(users.findByIdWithPermissions).toHaveBeenCalledOnce();
  });

  it('handles a failed sync and still processes the next completion', async () => {
    works.linkedUnreadEditions.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ bookIds: [4] });
    finish();
    finish(3);
    await settled();
    expect(Logger.prototype.warn).toHaveBeenCalledWith(expect.stringContaining('[work.sync_read] [fail]'));
    expect(books.bulkSetStatus).toHaveBeenCalledWith([4], 'read', reader);
  });

  it('unsubscribes on shutdown', async () => {
    service.onModuleDestroy();
    finish();
    await settled();
    expect(users.findByIdWithPermissions).not.toHaveBeenCalled();
  });
});
