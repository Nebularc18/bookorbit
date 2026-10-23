import 'reflect-metadata';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { describe, expect, it, vi } from 'vitest';
import * as schema from '../../db/schema';
import { WorkCatalogQueryDto } from './dto/work.dto';
import { WorkRepository } from './work.repository';

function fixture(results: unknown[][][]) {
  const query = vi.fn();
  for (const rows of results) query.mockResolvedValueOnce({ rows });
  const db = drizzle({ client: { query } as never, schema });
  return { repository: new WorkRepository(db), query };
}

describe('WorkRepository catalog', () => {
  it('returns one entry with both formats and keeps edition IDs and reader files intact', async () => {
    const key = `a:${'a'.repeat(32)}`;
    const { repository, query } = fixture([
      [[key, null, 'To All the Boys']],
      [
        [key, 1, 'To All the Boys (2014)', 'en', 2, [], [{ id: 10, format: 'epub' }]],
        [key, 2, 'To All the Boys (2020)', 'en', 2, ['Narrator'], [{ id: 20, format: 'm4b' }]],
      ],
    ]);
    const result = await repository.catalog(Object.assign(new WorkCatalogQueryDto(), { libraryId: 7 }), eq(schema.books.libraryId, 7));
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ key, automaticallyGrouped: true, hasMoreEditions: false });
    expect(result.items[0]!.editions.map((edition) => [edition.bookId, edition.files[0]!.format])).toEqual([
      [1, 'epub'],
      [2, 'm4b'],
    ]);
    expect(query).toHaveBeenCalledTimes(2);
    for (const [config, params] of query.mock.calls) {
      expect(config.text).toContain('"books"."library_id" =');
      expect(config.text).toContain('"books"."status" <>');
      expect(params).toContain(7);
      expect(params).toContain('processing');
    }
    expect(query.mock.calls[1]![0].text).toContain('where book_id = "ranked_editions"."id"');
  });

  it('bounds group pages and editions per group before file hydration', async () => {
    const { repository, query } = fixture([
      [
        ['w:1', 1, 'A'],
        ['w:2', 2, 'B'],
      ],
      [['w:1', 1, 'A', 'en', 101, [], []]],
    ]);
    const result = await repository.catalog(
      Object.assign(new WorkCatalogQueryDto(), { libraryId: 7, limit: 1, after: 'w:0' }),
      eq(schema.books.libraryId, 7),
    );
    expect(result.hasMore).toBe(true);
    expect(result.items[0]!.hasMoreEditions).toBe(true);
    expect(query.mock.calls[0]![0].text).toContain('where "key" >');
    expect(query.mock.calls[0]![1]).toContain(2);
    expect(query.mock.calls[1]![0].text).toContain('row_number() over');
    expect(query.mock.calls[1]![0].text).toContain('where "position" <=');
    expect(query.mock.calls[1]![1]).toContain(100);
    expect(query.mock.calls[1]![1]).not.toContain('w:2');
  });

  it('does not infer matches when automatic grouping is disabled', async () => {
    const { repository, query } = fixture([[]]);
    await repository.catalog(Object.assign(new WorkCatalogQueryDto(), { libraryId: 7, autoGroup: false }), eq(schema.books.libraryId, 7));
    expect(query.mock.calls[0]![0].text).not.toContain('md5');
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('WorkRepository unread linked editions', () => {
  it('bounds results and filters by work, reader status, library visibility and source exclusion', async () => {
    const { repository, query } = fixture([[[2]]]);
    await expect(repository.findUnreadEditions(9, 1, 7, eq(schema.books.libraryId, 3))).resolves.toEqual([{ bookId: 2 }]);
    const [config, params] = query.mock.calls[0]!;
    expect(config.text).toContain('"user_book_status"."user_id" =');
    expect(config.text).toContain('"books"."work_id" =');
    expect(config.text).toContain('"books"."library_id" =');
    expect(config.text).toContain('"books"."id" <>');
    expect(config.text).toContain("<> 'read'");
    expect(config.text).toContain('limit');
    expect(params).toEqual(expect.arrayContaining([9, 1, 7, 3, 100, 'processing']));
  });
});
