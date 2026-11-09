import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestUser } from '../../common/types/request-user';
import { BookService } from '../book/book.service';
import { BookQueryBuilder } from '../book/book-query-builder.service';
import { LibraryService } from '../library/library.service';
import { WorkRepository } from './work.repository';
import { WorkService } from './work.service';

const user = { id: 7, isSuperuser: false, contentFilters: {} } as RequestUser;
const dto = { title: ' Sample ', bookIds: [1, 2] };

describe('WorkService repository boundary', () => {
  let service: WorkService;
  const repository = {
    lockGrouping: vi.fn<WorkRepository['lockGrouping']>(),
    groupEditions: vi.fn<WorkRepository['groupEditions']>(),
    editionLinks: vi.fn<WorkRepository['editionLinks']>(),
    withTransaction: vi.fn<WorkRepository['withTransaction']>(),
    lockEditions: vi.fn<WorkRepository['lockEditions']>(),
    findVisibleEditions: vi.fn<WorkRepository['findVisibleEditions']>(),
    createAndAssign: vi.fn<WorkRepository['createAndAssign']>(),
    detachEdition: vi.fn<WorkRepository['detachEdition']>(),
    catalog: vi.fn<WorkRepository['catalog']>(),
    findEditionWork: vi.fn<WorkRepository['findEditionWork']>(),
    findUnreadEditions: vi.fn<WorkRepository['findUnreadEditions']>(),
  };
  const library = { findAccessibleLibraryIds: vi.fn(), findEditableLibraryIds: vi.fn(), verifyUserAccess: vi.fn(), verifyUserAccessLevel: vi.fn() };
  const book = { verifyBookAccess: vi.fn() };
  const query = { buildWhere: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    library.findAccessibleLibraryIds.mockResolvedValue([3, 4]);
    library.findEditableLibraryIds.mockResolvedValue([3]);
    repository.withTransaction.mockImplementation((run) => run({} as Parameters<Parameters<WorkRepository['withTransaction']>[0]>[0]));
    repository.lockEditions.mockResolvedValue([
      { id: 1, libraryId: 3, workId: null },
      { id: 2, libraryId: 3, workId: null },
    ]);
    repository.findVisibleEditions.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    repository.createAndAssign.mockResolvedValue({ id: 9 });
    const module = await Test.createTestingModule({
      providers: [
        WorkService,
        { provide: WorkRepository, useValue: repository },
        { provide: LibraryService, useValue: library },
        { provide: BookService, useValue: book },
        { provide: BookQueryBuilder, useValue: query },
      ],
    }).compile();
    service = module.get(WorkService);
  });

  it('checks source access before looking up linked editions', async () => {
    book.verifyBookAccess.mockRejectedValue(new ForbiddenException());
    await expect(service.linkedUnreadEditions(1, user)).rejects.toThrow(ForbiddenException);
    expect(repository.findEditionWork).not.toHaveBeenCalled();
  });
  it('returns only visible unread editions scoped to the current reader across accessible libraries', async () => {
    repository.findEditionWork.mockResolvedValue({ workId: 9, libraryId: 3 });
    repository.findUnreadEditions.mockResolvedValue([{ bookId: 2 }]);
    await expect(service.linkedUnreadEditions(1, user)).resolves.toEqual({ bookIds: [2] });
    expect(query.buildWhere).toHaveBeenCalledWith(null, { accessibleLibraryIds: [3, 4], userId: 7, contentFilters: user.contentFilters });
    expect(repository.findUnreadEditions).toHaveBeenCalledWith(9, 1, 7, undefined);
  });
  it('tells the client to skip the manual offer when automatic completion sync is enabled', async () => {
    repository.findEditionWork.mockResolvedValue({ workId: 9, libraryId: 3 });
    repository.findUnreadEditions.mockResolvedValue([{ bookId: 2 }]);
    await expect(service.linkedUnreadEditions(1, { ...user, settings: { syncLinkedEditionsRead: true } })).resolves.toEqual({
      bookIds: [2],
      automaticReadSync: true,
    });
  });
  it('does not infer links for editions without a saved group', async () => {
    repository.findEditionWork.mockResolvedValue({ workId: null, libraryId: 3 });
    await expect(service.linkedUnreadEditions(1, user)).resolves.toEqual({ bookIds: [] });
    expect(repository.findUnreadEditions).not.toHaveBeenCalled();
  });
  it('requires editor access before creating or assigning a work', async () => {
    library.verifyUserAccessLevel.mockRejectedValue(new ForbiddenException());
    await expect(service.group(dto, user)).rejects.toThrow(ForbiddenException);
    expect(repository.createAndAssign).not.toHaveBeenCalled();
  });

  it('rejects content-hidden editions before writing', async () => {
    repository.findVisibleEditions.mockResolvedValue([{ id: 1 }]);
    await expect(service.group(dto, user)).rejects.toThrow(NotFoundException);
    expect(repository.createAndAssign).not.toHaveBeenCalled();
    expect(query.buildWhere).toHaveBeenCalledWith(null, { accessibleLibraryIds: [3], userId: 7, contentFilters: user.contentFilters });
  });

  it('creates the group only after verifying the locked editions', async () => {
    await expect(service.group(dto, user)).resolves.toEqual({ id: 9 });
    expect(library.verifyUserAccessLevel).toHaveBeenCalledWith(7, 3, false, 'editor');
    expect(repository.createAndAssign).toHaveBeenCalledWith(7, 'Sample', [1, 2], expect.anything(), undefined);
  });

  it('checks book access before detaching an edition', async () => {
    book.verifyBookAccess.mockRejectedValue(new ForbiddenException());
    await expect(service.ungroup(9, 1, user)).rejects.toThrow(ForbiddenException);
    expect(repository.detachEdition).not.toHaveBeenCalled();
  });

  it('detaches only the requested edition and reports missing membership', async () => {
    repository.detachEdition.mockResolvedValue([{ id: 1 }]);
    await expect(service.ungroup(9, 1, user)).resolves.toEqual({ bookId: 1 });
    expect(repository.detachEdition).toHaveBeenCalledWith(9, 1, expect.anything());
    repository.detachEdition.mockResolvedValue([]);
    await expect(service.ungroup(9, 1, user)).rejects.toThrow(NotFoundException);
  });
  it('links translations across libraries after checking editor access to both', async () => {
    repository.lockEditions.mockResolvedValue([
      { id: 1, libraryId: 3, workId: null },
      { id: 2, libraryId: 4, workId: null },
    ]);
    await expect(service.group(dto, user)).resolves.toEqual({ id: 9 });
    expect(library.verifyUserAccessLevel).toHaveBeenCalledWith(7, 3, false, 'editor');
    expect(library.verifyUserAccessLevel).toHaveBeenCalledWith(7, 4, false, 'editor');
    expect(query.buildWhere).toHaveBeenCalledWith(null, { accessibleLibraryIds: [3, 4], userId: 7, contentFilters: user.contentFilters });
  });

  it('preserves existing members when joining two edition groups', async () => {
    repository.lockEditions.mockResolvedValue([
      { id: 1, libraryId: 3, workId: 9 },
      { id: 2, libraryId: 4, workId: 10 },
    ]);
    repository.groupEditions.mockResolvedValue([
      { id: 1, libraryId: 3, workId: 9 },
      { id: 2, libraryId: 4, workId: 10 },
      { id: 5, libraryId: 4, workId: 10 },
    ]);
    repository.findVisibleEditions.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 5 }]);
    await service.group(dto, user);
    expect(repository.createAndAssign).toHaveBeenCalledWith(7, 'Sample', [1, 2, 5], expect.anything(), 9);
    expect(repository.lockGrouping).toHaveBeenCalled();
  });

  it('rejects linking when any existing group member is in a library the editor cannot edit', async () => {
    repository.lockEditions.mockResolvedValue([
      { id: 1, libraryId: 3, workId: 9 },
      { id: 2, libraryId: 3, workId: null },
    ]);
    repository.groupEditions.mockResolvedValue([{ id: 5, libraryId: 4, workId: 9 }]);
    library.verifyUserAccessLevel.mockImplementation((_userId, libraryId) =>
      libraryId === 4 ? Promise.reject(new ForbiddenException()) : Promise.resolve(),
    );
    await expect(service.group(dto, user)).rejects.toThrow(ForbiddenException);
    expect(repository.createAndAssign).not.toHaveBeenCalled();
  });

  it('rejects hidden existing group members and oversized merged groups without writing', async () => {
    repository.lockEditions.mockResolvedValue([
      { id: 1, libraryId: 3, workId: 9 },
      { id: 2, libraryId: 3, workId: null },
    ]);
    repository.groupEditions.mockResolvedValue([{ id: 5, libraryId: 3, workId: 9 }]);
    await expect(service.group(dto, user)).rejects.toThrow(NotFoundException);
    repository.groupEditions.mockResolvedValue(Array.from({ length: 101 }, (_, i) => ({ id: i + 1, libraryId: 3, workId: 9 })));
    await expect(service.group(dto, user)).rejects.toThrow(BadRequestException);
    expect(repository.createAndAssign).not.toHaveBeenCalled();
  });

  it('searches only editable libraries and checks the source edition first', async () => {
    await service.editionLinks(1, user, { search: 'Dollar', after: 0 });
    expect(book.verifyBookAccess).toHaveBeenCalledWith(1, user, 'editor');
    expect(query.buildWhere).toHaveBeenCalledWith(null, { accessibleLibraryIds: [3], userId: 7, contentFilters: user.contentFilters });
    expect(repository.editionLinks).toHaveBeenCalledWith(1, undefined, { search: 'Dollar', after: 0 });
  });

  it('lists linked editions only across libraries the reader can access', async () => {
    await service.editionLinks(1, user);
    expect(book.verifyBookAccess).toHaveBeenCalledWith(1, user, 'viewer');
    expect(query.buildWhere).toHaveBeenCalledWith(null, { accessibleLibraryIds: [3, 4], userId: 7, contentFilters: user.contentFilters });
  });
});
