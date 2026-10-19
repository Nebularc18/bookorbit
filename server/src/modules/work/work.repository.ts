import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, inArray, ne, sql, type SQL } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { AUDIO_FORMAT_LIST, type WorkCatalogPage, type WorkEdition } from '@bookorbit/types';
import { DB } from '../../db';
import * as schema from '../../db/schema';
import { books, bookMetadata, works } from '../../db/schema';
import { WorkCatalogQueryDto } from './dto/work.dto';

type Db = NodePgDatabase<typeof schema>;
type DbExecutor = Pick<Db, 'select' | 'insert' | 'update'>;

@Injectable()
export class WorkRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  withTransaction<T>(run: (tx: DbExecutor) => Promise<T>): Promise<T> {
    return this.db.transaction(run);
  }

  async catalog(query: WorkCatalogQueryDto, visible: SQL | undefined): Promise<WorkCatalogPage> {
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

  lockEditions(bookIds: number[], tx: DbExecutor) {
    return tx
      .select({ id: books.id, libraryId: books.libraryId, workId: books.workId })
      .from(books)
      .where(inArray(books.id, bookIds))
      .orderBy(books.id)
      .for('update');
  }

  findVisibleEditions(bookIds: number[], visible: SQL | undefined, tx: DbExecutor) {
    return tx
      .select({ id: books.id })
      .from(books)
      .where(and(visible, inArray(books.id, bookIds), ne(books.status, 'processing')));
  }

  async createAndAssign(libraryId: number, userId: number, title: string, bookIds: number[], tx: DbExecutor) {
    const [work] = await tx.insert(works).values({ libraryId, userId, title }).returning();
    await tx.update(books).set({ workId: work!.id }).where(inArray(books.id, bookIds));
    return { id: work!.id };
  }

  detachEdition(workId: number, bookId: number) {
    return this.db
      .update(books)
      .set({ workId: null })
      .where(and(eq(books.id, bookId), eq(books.workId, workId)))
      .returning({ id: books.id });
  }
}
