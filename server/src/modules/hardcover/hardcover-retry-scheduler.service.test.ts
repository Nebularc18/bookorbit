import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HARDCOVER_RETRY_SWEEP_BATCH_SIZE } from './hardcover.constants';
import { HardcoverRepository } from './hardcover.repository';
import { HardcoverRetrySchedulerService } from './hardcover-retry-scheduler.service';
import { HardcoverSyncService } from './hardcover-sync.service';

const mockRepo = {
  findDueRetryBookStates: vi.fn(),
};

const mockSyncService = {
  getSyncStatus: vi.fn(),
  syncBook: vi.fn(),
};

function makeDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('HardcoverRetrySchedulerService', () => {
  let service: HardcoverRetrySchedulerService;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo.findDueRetryBookStates.mockResolvedValue([]);
    mockSyncService.getSyncStatus.mockReturnValue(null);
    mockSyncService.syncBook.mockResolvedValue('synced');

    logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    service = new HardcoverRetrySchedulerService(mockRepo as unknown as HardcoverRepository, mockSyncService as unknown as HardcoverSyncService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing and avoids noisy logs when no failed syncs are due', async () => {
    await service.sweepDueRetries();

    expect(mockRepo.findDueRetryBookStates).toHaveBeenCalledWith(expect.any(Date), HARDCOVER_RETRY_SWEEP_BATCH_SIZE);
    expect(mockSyncService.syncBook).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('retries due books with isRetry=true and logs start/end summary', async () => {
    mockRepo.findDueRetryBookStates.mockResolvedValue([
      { userId: 1, bookId: 10, syncError: 'timeout', retryCount: 0 },
      { userId: 1, bookId: 11, syncError: 'Hardcover API error: 500', retryCount: 2 },
      { userId: 2, bookId: 20, syncError: 'Hardcover rate limit exceeded', retryCount: 1 },
    ]);
    mockSyncService.syncBook.mockResolvedValueOnce('synced').mockResolvedValueOnce('failed').mockResolvedValueOnce('skipped');

    await service.sweepDueRetries();

    expect(mockSyncService.syncBook).toHaveBeenCalledWith(1, 10, { isRetry: true });
    expect(mockSyncService.syncBook).toHaveBeenCalledWith(1, 11, { isRetry: true });
    expect(mockSyncService.syncBook).toHaveBeenCalledWith(2, 20, { isRetry: true });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[hardcover.retry_sweep] [start] dueBooks=3'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[hardcover.retry_sweep] [end]'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('syncedBooks=1 failedBooks=1 skippedBooks=1'));
  });

  it('skips users who already have a full syncAll run active', async () => {
    mockRepo.findDueRetryBookStates.mockResolvedValue([
      { userId: 1, bookId: 10, syncError: 'timeout', retryCount: 1 },
      { userId: 2, bookId: 20, syncError: 'timeout', retryCount: 1 },
    ]);
    mockSyncService.getSyncStatus.mockImplementation((userId: number) =>
      userId === 1 ? { runId: 1, syncedBooks: 0, totalBooks: 10, status: 'running' } : null,
    );

    await service.sweepDueRetries();

    expect(mockSyncService.syncBook).toHaveBeenCalledTimes(1);
    expect(mockSyncService.syncBook).toHaveBeenCalledWith(2, 20, { isRetry: true });
  });

  it('prevents overlapping sweeps while a sweep is already running', async () => {
    const pending = makeDeferred<'synced'>();
    mockRepo.findDueRetryBookStates.mockResolvedValue([{ userId: 1, bookId: 10, syncError: 'timeout', retryCount: 1 }]);
    mockSyncService.syncBook.mockReturnValueOnce(pending.promise);

    const first = service.sweepDueRetries();
    await Promise.resolve();
    await service.sweepDueRetries();

    expect(mockRepo.findDueRetryBookStates).toHaveBeenCalledTimes(1);

    pending.resolve('synced');
    await first;
  });

  it('catches unexpected per-book and sweep-level errors without crashing', async () => {
    mockRepo.findDueRetryBookStates.mockResolvedValueOnce([{ userId: 1, bookId: 10, syncError: 'timeout', retryCount: 1 }]);
    mockSyncService.syncBook.mockRejectedValueOnce(new Error('unexpected boom'));

    await service.sweepDueRetries();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[hardcover.retry_sweep] [fail] userId=1 bookId=10'));

    mockRepo.findDueRetryBookStates.mockRejectedValueOnce(new Error('db down'));
    await service.sweepDueRetries();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[hardcover.retry_sweep] [fail]'));
  });
});
