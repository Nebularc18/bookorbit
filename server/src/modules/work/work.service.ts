import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Permission, type LinkedUnreadEditions, type WorkCatalogPage } from '@bookorbit/types';
import { WorkRepository } from './work.repository';
import type { RequestUser } from '../../common/types/request-user';
import { sanitizeLogValue } from '../../common/utils/log-sanitize.utils';
import { BookService } from '../book/book.service';
import { BookQueryBuilder } from '../book/book-query-builder.service';
import { LibraryService } from '../library/library.service';
import { GroupWorkDto, WorkCatalogQueryDto } from './dto/work.dto';

@Injectable()
export class WorkService {
  private readonly logger = new Logger(WorkService.name);
  constructor(
    private readonly repository: WorkRepository,
    private readonly bookService: BookService,
    private readonly queryBuilder: BookQueryBuilder,
    private readonly libraryService: LibraryService,
  ) {}

  async catalog(query: WorkCatalogQueryDto, user: RequestUser): Promise<WorkCatalogPage> {
    await this.libraryService.verifyUserAccess(user.id, query.libraryId, user.isSuperuser);
    const visible = this.queryBuilder.buildWhere(null, {
      accessibleLibraryIds: [query.libraryId],
      userId: user.id,
      contentFilters: user.isSuperuser ? undefined : user.contentFilters,
    });
    return this.repository.catalog(query, visible);
  }

  async linkedUnreadEditions(bookId: number, user: RequestUser): Promise<LinkedUnreadEditions> {
    await this.bookService.verifyBookAccess(bookId, user);
    if (user.permissions?.includes(Permission.DemoRestricted)) return { bookIds: [] };
    const edition = await this.repository.findEditionWork(bookId);
    if (!edition?.workId) return { bookIds: [] };
    const visible = this.queryBuilder.buildWhere(null, {
      accessibleLibraryIds: [edition.libraryId],
      userId: user.id,
      contentFilters: user.isSuperuser ? undefined : user.contentFilters,
    });
    const editions = await this.repository.findUnreadEditions(edition.workId, bookId, user.id, visible);
    return { bookIds: editions.map((row) => row.bookId) };
  }

  async group(dto: GroupWorkDto, user: RequestUser) {
    if (!dto.title.trim()) throw new BadRequestException('A work title is required');
    return this.logged('group', user.id, async () =>
      this.repository.withTransaction(async (tx) => {
        const editions = await this.repository.lockEditions(dto.bookIds, tx);
        if (editions.length !== dto.bookIds.length) throw new NotFoundException('Edition not found');
        if (new Set(editions.map((row) => row.libraryId)).size !== 1)
          throw new BadRequestException('Editions must belong to the same shared library');
        const libraryId = editions[0]!.libraryId;
        await this.libraryService.verifyUserAccessLevel(user.id, libraryId, user.isSuperuser, 'editor');
        const visible = this.queryBuilder.buildWhere(null, {
          accessibleLibraryIds: [libraryId],
          userId: user.id,
          contentFilters: user.isSuperuser ? undefined : user.contentFilters,
        });
        const allowed = await this.repository.findVisibleEditions(dto.bookIds, visible, tx);
        if (allowed.length !== dto.bookIds.length) throw new NotFoundException('Edition not found');
        if (editions.some((row) => row.workId !== null)) throw new ConflictException('Ungroup the selected editions first');
        return this.repository.createAndAssign(libraryId, user.id, dto.title.trim(), dto.bookIds, tx);
      }),
    );
  }

  async ungroup(workId: number, bookId: number, user: RequestUser) {
    await this.bookService.verifyBookAccess(bookId, user, 'editor');
    return this.logged('ungroup', user.id, async () => {
      const rows = await this.repository.detachEdition(workId, bookId);
      if (!rows.length) throw new NotFoundException('Grouped edition not found');
      return { bookId };
    });
  }

  private async logged<T>(operation: string, userId: number, run: () => Promise<T>): Promise<T> {
    const started = Date.now();
    this.logger.log(`[work.${operation}] [start] userId=${userId} - grouping change started`);
    try {
      const result = await run();
      this.logger.log(`[work.${operation}] [end] userId=${userId} durationMs=${Date.now() - started} - grouping change completed`);
      return result;
    } catch (error) {
      this.logger.error(
        `[work.${operation}] [fail] userId=${userId} durationMs=${Date.now() - started} errorClass=${error instanceof Error ? error.name : 'Unknown'} error="${sanitizeLogValue(error instanceof Error ? error.message : String(error))}" - grouping change failed`,
      );
      throw error;
    }
  }
}
