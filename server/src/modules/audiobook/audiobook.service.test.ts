import { BadRequestException, ConflictException, PreconditionFailedException } from '@nestjs/common';
import { AUDIOBOOK_MANIFEST_SCHEMA, AUDIOBOOK_MANIFEST_VERSION } from '@bookorbit/types';

import type { RequestUser } from '../../common/types/request-user';
import {
  AchievementEventsService,
  ACHIEVEMENT_EVENT_BOOK_PROGRESS_CHANGED,
  ACHIEVEMENT_EVENT_READING_SESSION_SAVED,
} from '../achievement/achievement-events.service';
import { HardcoverEventListener } from '../hardcover/hardcover-event-listener.service';
import { HardcoverAutoSyncSchedulerService, HARDCOVER_AUTO_SYNC_DEBOUNCE_MS } from '../hardcover/hardcover-auto-sync-scheduler.service';
import { AudiobookService } from './audiobook.service';

const FIRST_PUBLIC_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_PUBLIC_ID = '22222222-2222-4222-8222-222222222222';

function makeUser(): RequestUser {
  return {
    id: 7,
    username: 'listener',
    name: 'Listener',
    email: null,
    active: true,
    isDefaultPassword: false,
    tokenVersion: 1,
    settings: {},
    avatarUrl: null,
    provisioningMethod: 'local',
    isSuperuser: false,
    permissions: [],
    contentFilters: null,
  };
}

function makeFixture() {
  const files = [
    {
      id: 12,
      publicId: SECOND_PUBLIC_ID,
      absolutePath: '/library/Part 2.mp3',
      format: 'mp3',
      sizeBytes: 2_000,
      durationSeconds: 20,
      sortOrder: 2,
      mtime: new Date('2026-01-02T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
    {
      id: 11,
      publicId: FIRST_PUBLIC_ID,
      absolutePath: '/library/Part 1.mp3',
      format: 'mp3',
      sizeBytes: 1_000,
      durationSeconds: 10.125,
      sortOrder: 1,
      mtime: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  ];
  const repo = {
    findAudioFiles: vi.fn().mockResolvedValue(files),
    findAsset: vi.fn(),
    findPlaybackState: vi.fn().mockResolvedValue(null),
    createPlaybackState: vi.fn(),
    updatePlaybackState: vi.fn(),
    deletePlaybackState: vi.fn(),
    findAudioBookmarks: vi.fn(),
    createAudioBookmark: vi.fn(),
    updateAudioBookmark: vi.fn(),
    deleteAudioBookmark: vi.fn(),
  };
  const bookService = {
    verifyBookAccess: vi.fn().mockResolvedValue(undefined),
    getFileInfo: vi.fn(),
    getDetail: vi.fn().mockResolvedValue({
      id: 30,
      libraryId: 4,
      title: 'A Long Listen',
      folderPath: '/library/A Long Listen',
      authors: [{ name: 'Author' }],
      coverSource: 'embedded',
      audioMetadata: {
        durationSeconds: 30.125,
        narrators: [{ name: 'Narrator' }],
        chapters: [
          { title: 'Opening', startMs: 0 },
          { title: 'Second Part', startMs: 10_125 },
        ],
      },
    }),
    autoUpdateReadStatusForProgress: vi.fn().mockResolvedValue(undefined),
    syncEbookProgressForAudiobookPlayback: vi.fn().mockResolvedValue(undefined),
  };
  const events = new AchievementEventsService();
  const progressChanged = vi.fn();
  const sessionSaved = vi.fn();
  events.on(ACHIEVEMENT_EVENT_BOOK_PROGRESS_CHANGED, progressChanged);
  events.on(ACHIEVEMENT_EVENT_READING_SESSION_SAVED, sessionSaved);
  return {
    repo,
    bookService,
    events,
    progressChanged,
    sessionSaved,
    service: new AudiobookService(repo as never, bookService as never, events),
  };
}

describe('AudiobookService', () => {
  it.each([true, false])('routes intermediate position updates through Hardcover with progress auto-sync=%s', async (enabled) => {
    vi.useFakeTimers();
    try {
      const { service, repo, bookService, events, sessionSaved } = makeFixture();
      const syncBook = vi.fn().mockResolvedValue(undefined);
      const settings = { getSettings: vi.fn().mockResolvedValue({ effectiveEnabled: true, autoSyncOnProgressUpdate: enabled }) };
      const scheduler = new HardcoverAutoSyncSchedulerService(settings as never, { syncBook } as never, {} as never);
      const listener = new HardcoverEventListener(events, scheduler, {} as never);
      listener.onModuleInit();
      const manifest = await service.getManifest(30, makeUser());
      repo.findPlaybackState.mockResolvedValue({ percentage: 20, operationId: 'old-operation' });
      repo.updatePlaybackState.mockImplementation((_userId, _bookId, revision, values) => Promise.resolve({ ...values, revision: revision + 1 }));
      const dto = {
        assetId: manifest.assets[0]!.assetId,
        positionMs: 7_000,
        capturedAt: '2026-02-01T00:00:00.000Z',
        operationId: '33333333-3333-4333-8333-333333333333',
        baseRevision: 2,
        manifestRevision: manifest.revision,
      };
      await service.putPlaybackState(30, dto, makeUser());
      await service.putPlaybackState(
        30,
        { ...dto, operationId: '44444444-4444-4444-8444-444444444444', positionMs: 8_000, baseRevision: 3 },
        makeUser(),
      );
      expect(syncBook).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(HARDCOVER_AUTO_SYNC_DEBOUNCE_MS);
      expect(syncBook).toHaveBeenCalledTimes(enabled ? 1 : 0);
      if (enabled) expect(syncBook).toHaveBeenCalledWith(7, 30);
      expect(bookService.autoUpdateReadStatusForProgress).toHaveBeenCalledTimes(2);
      expect(sessionSaved).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries a failed notification on replay without repeating writes or reading activity', async () => {
    const { service, repo, bookService, events, sessionSaved } = makeFixture();
    const manifest = await service.getManifest(30, makeUser());
    const notify = vi.fn().mockImplementationOnce(() => {
      throw new Error('notification unavailable');
    });
    events.on(ACHIEVEMENT_EVENT_BOOK_PROGRESS_CHANGED, notify);
    const dto = {
      assetId: manifest.assets[0]!.assetId,
      positionMs: 7_000,
      capturedAt: '2026-02-01T00:00:00.000Z',
      operationId: '33333333-3333-4333-8333-333333333333',
      baseRevision: 0,
      manifestRevision: manifest.revision,
    };
    repo.createPlaybackState.mockImplementation((_userId, _bookId, values) => {
      const saved = { ...values, revision: 1 };
      repo.findPlaybackState.mockResolvedValue(saved);
      return Promise.resolve(saved);
    });
    const first = await service.putPlaybackState(30, dto, makeUser());
    expect(await service.putPlaybackState(30, dto, makeUser())).toEqual(first);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(repo.createPlaybackState).toHaveBeenCalledTimes(1);
    expect(repo.updatePlaybackState).not.toHaveBeenCalled();
    expect(bookService.autoUpdateReadStatusForProgress).toHaveBeenCalledTimes(1);
    expect(sessionSaved).not.toHaveBeenCalled();
  });

  it('retries downstream EPUB sync after a committed write without repeating reading activity', async () => {
    const { service, repo, bookService, progressChanged, sessionSaved } = makeFixture();
    const manifest = await service.getManifest(30, makeUser());
    const dto = {
      assetId: manifest.assets[0]!.assetId,
      positionMs: 7_000,
      capturedAt: '2026-02-01T00:00:00.000Z',
      operationId: '33333333-3333-4333-8333-333333333333',
      baseRevision: 0,
      manifestRevision: manifest.revision,
    };
    repo.createPlaybackState.mockImplementation((_userId, _bookId, values) => {
      const saved = { ...values, revision: 1 };
      repo.findPlaybackState.mockResolvedValue(saved);
      return Promise.resolve(saved);
    });
    bookService.syncEbookProgressForAudiobookPlayback.mockRejectedValueOnce(new Error('EPUB sync unavailable'));

    await expect(service.putPlaybackState(30, dto, makeUser())).rejects.toThrow('EPUB sync unavailable');
    await expect(service.putPlaybackState(30, dto, makeUser())).resolves.toMatchObject({ revision: 1, positionMs: 7_000 });

    expect(repo.createPlaybackState).toHaveBeenCalledTimes(1);
    expect(repo.updatePlaybackState).not.toHaveBeenCalled();
    expect(bookService.autoUpdateReadStatusForProgress).toHaveBeenCalledTimes(1);
    expect(bookService.syncEbookProgressForAudiobookPlayback).toHaveBeenCalledTimes(2);
    expect(progressChanged).toHaveBeenCalledTimes(2);
    expect(sessionSaved).not.toHaveBeenCalled();
  });

  it('builds a versioned manifest with stable opaque assets and full chapter ranges', async () => {
    const { service, bookService } = makeFixture();

    const manifest = await service.getManifest(30, makeUser());

    expect(bookService.verifyBookAccess).toHaveBeenCalledWith(30, expect.objectContaining({ id: 7 }));
    expect(manifest.schema).toBe(AUDIOBOOK_MANIFEST_SCHEMA);
    expect(manifest.schemaVersion).toBe(AUDIOBOOK_MANIFEST_VERSION);
    expect(manifest.revision).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.assets).toEqual([
      expect.objectContaining({ assetId: `aud_${FIRST_PUBLIC_ID}`, fileId: 11, sequence: 0, durationMs: 10_125 }),
      expect.objectContaining({ assetId: `aud_${SECOND_PUBLIC_ID}`, fileId: 12, sequence: 1, durationMs: 20_000 }),
    ]);
    expect(manifest.chapters).toEqual([
      expect.objectContaining({ sequence: 0, startMs: 0, endMs: 10_125, assetId: `aud_${FIRST_PUBLIC_ID}`, assetOffsetMs: 0 }),
      expect.objectContaining({ sequence: 1, startMs: 10_125, endMs: 30_125, assetId: `aud_${SECOND_PUBLIC_ID}`, assetOffsetMs: 0 }),
    ]);
  });

  it('keeps the manifest revision independent of the file ids it exposes', async () => {
    const { service, repo } = makeFixture();
    const before = await service.getManifest(30, makeUser());
    const files = await repo.findAudioFiles();
    repo.findAudioFiles.mockResolvedValue(files.map((file) => ({ ...file, id: file.id + 900 })));

    const after = await service.getManifest(30, makeUser());

    expect(after.assets.map((asset) => asset.fileId)).toEqual([911, 912]);
    expect(after.revision).toBe(before.revision);
  });

  it('derives percentage and creates revision one from a matching manifest write', async () => {
    const { service, repo, bookService, progressChanged } = makeFixture();
    const manifest = await service.getManifest(30, makeUser());
    repo.createPlaybackState.mockResolvedValue({
      capturedAt: new Date('2026-02-01T00:00:00.000Z'),
      revision: 1,
    });

    const saved = await service.putPlaybackState(
      30,
      {
        assetId: manifest.assets[1]!.assetId,
        positionMs: 5_000,
        capturedAt: '2026-02-01T00:00:00.000Z',
        operationId: '33333333-3333-4333-8333-333333333333',
        baseRevision: 0,
        manifestRevision: manifest.revision,
      },
      makeUser(),
    );

    expect(saved.percentage).toBeCloseTo((15_125 / 30_125) * 100);
    expect(saved.revision).toBe(1);
    expect(progressChanged).toHaveBeenCalledWith({ userId: 7, bookId: 30, bookFileId: 12, progress: saved.percentage, source: 'web_reader' });
    expect(repo.createPlaybackState).toHaveBeenCalledWith(
      7,
      30,
      expect.objectContaining({ currentFileId: 12, positionSeconds: 5, percentage: saved.percentage }),
    );
    expect(bookService.autoUpdateReadStatusForProgress).toHaveBeenCalledWith(7, { bookId: 30, libraryId: 4 }, saved.percentage, {});
    expect(bookService.syncEbookProgressForAudiobookPlayback).toHaveBeenCalledWith(
      makeUser(),
      30,
      12,
      5,
      saved.percentage,
      new Date('2026-02-01T00:00:00.000Z'),
    );
  });

  it('uses complete per-file durations instead of stale aggregate metadata', async () => {
    const { service, bookService } = makeFixture();
    const detail = await bookService.getDetail();
    bookService.getDetail.mockResolvedValue({
      ...detail,
      audioMetadata: { ...detail.audioMetadata, durationSeconds: 60 },
    });

    const manifest = await service.getManifest(30, makeUser());

    expect(manifest.totalDurationMs).toBe(30_125);
  });

  it('does not derive false completion while any asset duration is missing', async () => {
    const { service, repo, bookService } = makeFixture();
    const files = await repo.findAudioFiles();
    repo.findAudioFiles.mockResolvedValue(files.map((file, index) => (index === 0 ? { ...file, durationSeconds: null } : file)));
    const manifest = await service.getManifest(30, makeUser());
    repo.createPlaybackState.mockResolvedValue({
      capturedAt: new Date('2026-02-01T00:00:00.000Z'),
      revision: 1,
    });

    const saved = await service.putPlaybackState(
      30,
      {
        assetId: manifest.assets[1]!.assetId,
        positionMs: 20_000,
        capturedAt: '2026-02-01T00:00:00.000Z',
        operationId: '99999999-9999-4999-8999-999999999999',
        baseRevision: 0,
        manifestRevision: manifest.revision,
      },
      makeUser(),
    );

    expect(saved.percentage).toBe(0);
    expect(saved.completed).toBe(false);
    expect(bookService.autoUpdateReadStatusForProgress).toHaveBeenCalledWith(7, { bookId: 30, libraryId: 4 }, 0, {});
  });

  it('syncs EPUB progress only after the revision-controlled write is accepted', async () => {
    const { service, repo, bookService } = makeFixture();
    const manifest = await service.getManifest(30, makeUser());
    const dto = {
      assetId: manifest.assets[0]!.assetId,
      positionMs: 2_000,
      capturedAt: '2026-02-01T00:00:00.000Z',
      operationId: '77777777-7777-4777-8777-777777777777',
      baseRevision: 0,
      manifestRevision: manifest.revision,
    };

    repo.createPlaybackState.mockResolvedValue(null);
    await expect(service.putPlaybackState(30, dto, makeUser())).rejects.toThrow(ConflictException);
    expect(bookService.syncEbookProgressForAudiobookPlayback).not.toHaveBeenCalled();

    repo.createPlaybackState.mockResolvedValue({ capturedAt: new Date(dto.capturedAt), revision: 1 });
    await service.putPlaybackState(30, dto, makeUser());

    expect(bookService.syncEbookProgressForAudiobookPlayback).toHaveBeenCalledTimes(1);
    expect(bookService.syncEbookProgressForAudiobookPlayback.mock.invocationCallOrder[0]!).toBeGreaterThan(
      repo.createPlaybackState.mock.invocationCallOrder[1]!,
    );
  });

  it('retries notifications and EPUB sync for an idempotent replay without recording activity again', async () => {
    const { service, repo, bookService, progressChanged, sessionSaved } = makeFixture();
    const manifest = await service.getManifest(30, makeUser());
    const capturedAt = new Date('2026-02-01T00:00:00.000Z');
    repo.findPlaybackState.mockResolvedValue({
      userId: 7,
      bookId: 30,
      currentFileId: 11,
      positionSeconds: 2,
      percentage: 6.63,
      capturedAt,
      revision: 4,
      operationId: '88888888-8888-4888-8888-888888888888',
      manifestRevision: manifest.revision,
    });

    const result = await service.putPlaybackState(
      30,
      {
        assetId: manifest.assets[0]!.assetId,
        positionMs: 2_000,
        capturedAt: capturedAt.toISOString(),
        operationId: '88888888-8888-4888-8888-888888888888',
        baseRevision: 3,
        manifestRevision: manifest.revision,
      },
      makeUser(),
    );

    expect(result).toMatchObject({ revision: 4, positionMs: 2_000 });
    expect(progressChanged).toHaveBeenCalledExactlyOnceWith({ userId: 7, bookId: 30, bookFileId: 11, progress: 6.63, source: 'web_reader' });
    expect(bookService.autoUpdateReadStatusForProgress).not.toHaveBeenCalled();
    expect(sessionSaved).not.toHaveBeenCalled();
    expect(repo.createPlaybackState).not.toHaveBeenCalled();
    expect(repo.updatePlaybackState).not.toHaveBeenCalled();
    expect(bookService.syncEbookProgressForAudiobookPlayback).toHaveBeenCalledWith(makeUser(), 30, 11, 2, 6.63, capturedAt);
  });

  it('rejects stale manifests, unknown assets, and revision conflicts without notifying progress', async () => {
    const { service, repo, progressChanged } = makeFixture();
    const manifest = await service.getManifest(30, makeUser());
    const base = {
      assetId: manifest.assets[0]!.assetId,
      positionMs: 1_000,
      capturedAt: '2026-02-01T00:00:00.000Z',
      operationId: '44444444-4444-4444-8444-444444444444',
      baseRevision: 0,
      manifestRevision: manifest.revision,
    };

    await expect(service.putPlaybackState(30, { ...base, manifestRevision: '0'.repeat(64) }, makeUser())).rejects.toThrow(
      PreconditionFailedException,
    );
    await expect(service.putPlaybackState(30, { ...base, assetId: 'aud_55555555-5555-4555-8555-555555555555' }, makeUser())).rejects.toThrow(
      BadRequestException,
    );

    repo.createPlaybackState.mockResolvedValue(null);
    await expect(service.putPlaybackState(30, base, makeUser())).rejects.toThrow(ConflictException);
    repo.updatePlaybackState.mockResolvedValue(null);
    await expect(service.putPlaybackState(30, { ...base, baseRevision: 3 }, makeUser())).rejects.toThrow(ConflictException);
    expect(progressChanged).not.toHaveBeenCalled();
  });

  it('accepts a position in the rounded-off tail of a track and stores it clamped to the duration', async () => {
    const { service, repo } = makeFixture();
    const manifest = await service.getManifest(30, makeUser());
    repo.createPlaybackState.mockResolvedValue({ capturedAt: new Date('2026-02-01T00:00:00.000Z'), revision: 1 });
    const dto = {
      assetId: manifest.assets[1]!.assetId,
      positionMs: 20_300,
      capturedAt: '2026-02-01T00:00:00.000Z',
      operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      baseRevision: 0,
      manifestRevision: manifest.revision,
    };

    const saved = await service.putPlaybackState(30, dto, makeUser());

    expect(manifest.assets[1]!.durationMs).toBe(20_000);
    expect(saved).toMatchObject({ positionMs: 20_000, percentage: 100 });
    expect(repo.createPlaybackState).toHaveBeenCalledWith(7, 30, expect.objectContaining({ currentFileId: 12, positionSeconds: 20 }));
    await expect(service.putPlaybackState(30, { ...dto, positionMs: 21_001 }, makeUser())).rejects.toThrow(BadRequestException);
  });

  it('accepts a bookmark just past the rounded audiobook duration and stores it clamped', async () => {
    const { service, repo } = makeFixture();
    repo.createAudioBookmark.mockResolvedValue({
      clientId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      bookId: 30,
      positionSeconds: 30.125,
      chapterId: null,
      title: 'End',
      note: null,
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
      updatedAt: new Date('2026-02-01T00:00:00.000Z'),
    });
    const dto = { clientId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', positionMs: 30_600, title: 'End' };

    const bookmark = await service.createBookmark(30, dto, makeUser());

    expect(bookmark.positionMs).toBe(30_125);
    expect(repo.createAudioBookmark).toHaveBeenCalledWith(7, 30, expect.objectContaining({ positionSeconds: 30.125 }));
    await expect(service.createBookmark(30, { ...dto, positionMs: 31_126 }, makeUser())).rejects.toThrow(BadRequestException);
  });

  it('resolves asset content through the access-checked file path', async () => {
    const { service, repo, bookService } = makeFixture();
    repo.findAsset.mockResolvedValue({ id: 11, format: 'mp3' });
    bookService.getFileInfo.mockResolvedValue({ path: '/library/Part 1.mp3', size: 1_234, format: 'mp3' });

    await expect(service.getAsset(30, `aud_${FIRST_PUBLIC_ID}`, makeUser())).resolves.toEqual({
      absolutePath: '/library/Part 1.mp3',
      sizeBytes: 1_234,
      format: 'mp3',
    });
    expect(bookService.getFileInfo).toHaveBeenCalledWith(11, expect.objectContaining({ id: 7 }));
  });

  it('requires an actual field when updating an audiobook bookmark', async () => {
    const { service, repo } = makeFixture();

    await expect(service.updateBookmark(30, '66666666-6666-4666-8666-666666666666', {}, makeUser())).rejects.toThrow(BadRequestException);
    expect(repo.updateAudioBookmark).not.toHaveBeenCalled();
  });
});
