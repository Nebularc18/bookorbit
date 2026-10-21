import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, ilike, inArray, lte, ne, sql, type SQL } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { AUDIO_FORMAT_LIST, type WorkCatalogPage, type WorkEdition } from '@bookorbit/types';
import { DB } from '../../db';
import * as schema from '../../db/schema';
import { books, bookMetadata, works } from '../../db/schema';
import { WorkCatalogQueryDto } from './dto/work.dto';
import { workCatalogKey } from './work-catalog-key';
import { escapeLikePattern } from '../../common/utils/accent-insensitive-search.utils';

type Db = NodePgDatabase<typeof schema>;
type DbExecutor = Pick<Db, 'select' | 'insert' | 'update'>;

@Injectable()
export class WorkRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  withTransaction<T>(run: (tx: DbExecutor) => Promise<T>): Promise<T> {
    return this.db.transaction(run);
  }

  async catalog(query: WorkCatalogQueryDto, visible: SQL | undefined): Promise<WorkCatalogPage> {
    const key = workCatalogKey(query.autoGroup);
    const candidates = this.db.$with('edition_candidates').as(
      this.db
        .select({
          matchKey: key.as('match_key'),
          bookId: books.id,
          workId: books.workId,
          editionTitle: sql<string | null>`${bookMetadata.title}`.as('edition_title'),
          title: sql<string>`coalesce(${works.title}, ${bookMetadata.title}, 'Untitled')`.as('title'),
          language: bookMetadata.language,
        })
        .from(books)
        .leftJoin(bookMetadata, eq(bookMetadata.bookId, books.id))
        .leftJoin(works, eq(works.id, books.workId))
        .where(and(visible, eq(books.libraryId, query.libraryId), ne(books.status, 'processing'))),
    );
    const partition = sql`partition by ${candidates.matchKey}`;
    // A new edition can join a saved group only when its metadata points to one group.
    const anchorId = sql<number | null>`case when min(${candidates.workId}) over (${partition}) = max(${candidates.workId}) over (${partition})
      then min(${candidates.workId}) over (${partition}) end`;
    const anchored = this.db.$with('anchored_editions').as(
      this.db
        .select({
          bookId: candidates.bookId,
          editionTitle: candidates.editionTitle,
          savedWorkId: sql<number | null>`${candidates.workId}`.as('saved_work_id'),
          workId: sql<number | null>`coalesce(${candidates.workId}, ${anchorId})`.as('work_id'),
          key: sql<string>`coalesce('w:' || ${candidates.workId}::text, 'w:' || (${anchorId})::text, ${candidates.matchKey})`.as('key'),
          title:
            sql<string>`coalesce(case when ${anchorId} is not null then max(${candidates.title}) filter (where ${candidates.workId} is not null) over (${partition}) end, ${candidates.title})`.as(
              'title',
            ),
          language: candidates.language,
        })
        .from(candidates),
    );
    const matchingEditions = this.db.$with('matching_editions').as(
      this.db
        .select({
          key: anchored.key,
          bookId: anchored.bookId,
          editionTitle: anchored.editionTitle,
          savedWorkId: anchored.savedWorkId,
          workId: anchored.workId,
          title: anchored.title,
          language: anchored.language,
        })
        .from(anchored)
        .where(
          and(
            query.search?.trim() ? ilike(anchored.title, `%${escapeLikePattern(query.search.trim())}%`) : undefined,
            query.language ? eq(anchored.language, query.language) : undefined,
            query.format
              ? sql`exists (select 1 from book_files f where f.book_id = ${anchored.bookId} and f.role = 'content' and ${
                  query.format === 'audio'
                    ? sql`f.format in (${sql.join(
                        AUDIO_FORMAT_LIST.map((format) => sql`${format}`),
                        sql`, `,
                      )})`
                    : sql`f.format = ${query.format}`
                })`
              : undefined,
          ),
        ),
    );
    const page = await this.db
      .with(candidates, anchored, matchingEditions)
      .select({ key: matchingEditions.key, workId: matchingEditions.workId, title: sql<string>`min(${matchingEditions.title})` })
      .from(matchingEditions)
      .where(query.after ? gt(matchingEditions.key, query.after) : undefined)
      .groupBy(matchingEditions.key, matchingEditions.workId)
      .orderBy(matchingEditions.key)
      .limit(query.limit + 1)
      .offset(query.offset);
    const selected = page.slice(0, query.limit);
    if (!selected.length) return { items: [], hasMore: false };
    const ranked = this.db.$with('ranked_editions').as(
      this.db
        .select({
          key: matchingEditions.key,
          bookId: matchingEditions.bookId,
          editionTitle: matchingEditions.editionTitle,
          savedWorkId: matchingEditions.savedWorkId,
          title: matchingEditions.title,
          language: matchingEditions.language,
          position: sql<number>`row_number() over (partition by ${matchingEditions.key} order by ${matchingEditions.bookId})`.as('position'),
          total: sql<number>`count(*) over (partition by ${matchingEditions.key})`.mapWith(Number).as('total'),
        })
        .from(matchingEditions)
        .where(
          inArray(
            matchingEditions.key,
            selected.map((row) => row.key),
          ),
        ),
    );
    // Keep the correlation qualified when Drizzle simplifies a single-source SELECT.
    const editionId = sql`"ranked_editions"."id"`;
    const editions = await this.db
      .with(candidates, anchored, matchingEditions, ranked)
      .select({
        key: ranked.key,
        bookId: ranked.bookId,
        title: ranked.editionTitle,
        language: ranked.language,
        total: ranked.total,
        narrators: sql<
          string[]
        >`array(select n.name from book_narrators bn join narrators n on n.id = bn.narrator_id where bn.book_id = ${editionId} order by bn.display_order, n.id)`,
        files: sql<
          WorkEdition['files']
        >`coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'format', f.format)) from (select distinct on (format) id, format from book_files where book_id = ${editionId} and role = 'content' and format is not null order by format, sort_order nulls last, id) f), '[]'::jsonb)`,
        savedWorkId: ranked.savedWorkId,
      })
      .from(ranked)
      .where(lte(ranked.position, 100))
      .orderBy(ranked.key, ranked.bookId);
    return {
      items: selected.map((row) => ({
        ...row,
        automaticallyGrouped: row.key.startsWith('a:') && (editions.find((edition) => edition.key === row.key)?.total ?? 0) > 1,
        hasMoreEditions: (editions.find((edition) => edition.key === row.key)?.total ?? 0) > 100,
        editions: editions
          .filter((edition) => edition.key === row.key)
          .map(({ bookId, title, language, narrators, files, savedWorkId }) => ({ bookId, title, language, narrators, files, savedWorkId })),
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
