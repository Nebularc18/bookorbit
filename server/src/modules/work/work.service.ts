import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, gt, inArray, ne, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { AUDIO_FORMAT_LIST, type WorkCatalogPage, type WorkEdition } from '@bookorbit/types';
import { DB } from '../../db';
import * as schema from '../../db/schema';
import { books, bookMetadata, works } from '../../db/schema';
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
    @Inject(DB) private readonly db: NodePgDatabase<typeof schema>,
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
    const matching = and(
      visible,
      ne(books.status, 'processing'),
      query.language ? eq(bookMetadata.language, query.language) : undefined,
      query.format
        ? sql`exists (select 1 from book_files f where f.book_id = ${books.id} and f.role = 'content' and ${
            query.format === 'audio'
              ? sql`f.format in (${sql.join(
                  AUDIO_FORMAT_LIST.map((format) => sql`${format}`),
                  sql`, `,
                )})`
              : sql`f.format = ${query.format}`
          })`
        : undefined,
    );
    const key = sql<string>`coalesce('w:' || ${books.workId}::text, 'b:' || ${books.id}::text)`;
    const title = sql<string>`coalesce(${works.title}, ${bookMetadata.title}, 'Untitled')`;
    const page = await this.db
      .select({ key, workId: books.workId, title })
      .from(books)
      .leftJoin(bookMetadata, eq(bookMetadata.bookId, books.id))
      .leftJoin(works, eq(works.id, books.workId))
      .where(and(matching, query.after ? gt(key, query.after) : undefined))
      .groupBy(key, books.workId, title)
      .orderBy(key)
      .limit(query.limit + 1)
      .offset(query.offset);
    const selected = page.slice(0, query.limit);
    if (!selected.length) return { items: [], hasMore: false };
    const editions = await this.db
      .select({
        key,
        bookId: books.id,
        title: bookMetadata.title,
        language: bookMetadata.language,
        narrators: sql<
          string[]
        >`array(select n.name from book_narrators bn join narrators n on n.id = bn.narrator_id where bn.book_id = ${books.id} order by bn.display_order, n.id)`,
        files: sql<
          WorkEdition['files']
        >`coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'format', f.format)) from (select distinct on (format) id, format from book_files where book_id = ${books.id} and role = 'content' and format is not null order by format, sort_order nulls last, id) f), '[]'::jsonb)`,
      })
      .from(books)
      .leftJoin(bookMetadata, eq(bookMetadata.bookId, books.id))
      .where(
        and(
          matching,
          inArray(
            key,
            selected.map((row) => row.key),
          ),
        ),
      )
      .orderBy(books.id);
    return {
      items: selected.map((row) => ({
        ...row,
        editions: editions
          .filter((edition) => edition.key === row.key)
          .map(({ bookId, title, language, narrators, files }) => ({ bookId, title, language, narrators, files })),
      })),
      hasMore: page.length > query.limit,
    };
  }

  async group(dto: GroupWorkDto, user: RequestUser) {
    if (!dto.title.trim()) throw new BadRequestException('A work title is required');
    return this.logged('group', user.id, async () =>
      this.db.transaction(async (tx) => {
        const editions = await tx
          .select({ id: books.id, libraryId: books.libraryId, workId: books.workId })
          .from(books)
          .where(inArray(books.id, dto.bookIds))
          .orderBy(books.id)
          .for('update');
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
        const allowed = await tx
          .select({ id: books.id })
          .from(books)
          .where(and(visible, inArray(books.id, dto.bookIds), ne(books.status, 'processing')));
        if (allowed.length !== dto.bookIds.length) throw new NotFoundException('Edition not found');
        if (editions.some((row) => row.workId !== null)) throw new ConflictException('Ungroup the selected editions first');
        const [work] = await tx.insert(works).values({ libraryId: editions[0]!.libraryId, userId: user.id, title: dto.title.trim() }).returning();
        await tx.update(books).set({ workId: work!.id }).where(inArray(books.id, dto.bookIds));
        return { id: work!.id };
      }),
    );
  }

  async ungroup(workId: number, bookId: number, user: RequestUser) {
    await this.bookService.verifyBookAccess(bookId, user, 'editor');
    return this.logged('ungroup', user.id, async () => {
      const rows = await this.db
        .update(books)
        .set({ workId: null })
        .where(and(eq(books.id, bookId), eq(books.workId, workId)))
        .returning({ id: books.id });
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
