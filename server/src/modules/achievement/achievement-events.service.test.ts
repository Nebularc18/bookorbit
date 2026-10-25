import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ACHIEVEMENT_EVENT_BOOK_PROGRESS_CHANGED, AchievementEventsService } from './achievement-events.service';

const progress = { userId: 7, bookId: 30, bookFileId: 11, progress: 40, source: 'web_reader' as const };

describe('AchievementEventsService progress notifications', () => {
  afterEach(() => vi.restoreAllMocks());

  it('emits the existing progress event contract', async () => {
    const module = await Test.createTestingModule({ providers: [AchievementEventsService] }).compile();
    const service = module.get(AchievementEventsService);
    const handler = vi.fn();
    service.on(ACHIEVEMENT_EVENT_BOOK_PROGRESS_CHANGED, handler);

    service.notifyBookProgressChanged(progress);

    expect(handler).toHaveBeenCalledExactlyOnceWith(progress);
    await module.close();
  });

  it('logs notification failures without rejecting saved progress and allows a retry', () => {
    const service = new AchievementEventsService();
    const handler = vi.fn().mockImplementationOnce(() => {
      throw new Error('listener "failed"\nretry');
    });
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    service.on(ACHIEVEMENT_EVENT_BOOK_PROGRESS_CHANGED, handler);

    expect(() => service.notifyBookProgressChanged(progress)).not.toThrow();
    service.notifyBookProgressChanged(progress);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[book.progress_notification] [fail] userId=7 bookId=30'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('error="listener \\"failed\\" retry"'));
  });
});
