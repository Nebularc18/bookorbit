import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
    withTransaction: vi.fn<WorkRepository['withTransaction']>(),
    lockEditions: vi.fn<WorkRepository['lockEditions']>(),
    findVisibleEditions: vi.fn<WorkRepository['findVisibleEditions']>(),
    createAndAssign: vi.fn<WorkRepository['createAndAssign']>(),
    detachEdition: vi.fn<WorkRepository['detachEdition']>(),
    catalog: vi.fn<WorkRepository['catalog']>(),
  };
  const library = { verifyUserAccess: vi.fn(), verifyUserAccessLevel: vi.fn() };
  const book = { verifyBookAccess: vi.fn() };
  const query = { buildWhere: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
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
    expect(repository.createAndAssign).toHaveBeenCalledWith(3, 7, 'Sample', [1, 2], expect.anything());
  });

  it('checks book access before detaching an edition', async () => {
    book.verifyBookAccess.mockRejectedValue(new ForbiddenException());
    await expect(service.ungroup(9, 1, user)).rejects.toThrow(ForbiddenException);
    expect(repository.detachEdition).not.toHaveBeenCalled();
  });

  it('detaches only the requested edition and reports missing membership', async () => {
    repository.detachEdition.mockResolvedValue([{ id: 1 }]);
    await expect(service.ungroup(9, 1, user)).resolves.toEqual({ bookId: 1 });
    expect(repository.detachEdition).toHaveBeenCalledWith(9, 1);
    repository.detachEdition.mockResolvedValue([]);
    await expect(service.ungroup(9, 1, user)).rejects.toThrow(NotFoundException);
  });
});
