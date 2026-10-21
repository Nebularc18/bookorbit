import { sql } from 'drizzle-orm';
import { books, bookMetadata } from '../../db/schema';

export function workCatalogKey(autoGroup: boolean) {
  const separateKey = sql<string>`'b:' || ${books.id}::text`;
  if (!autoGroup) return separateKey;

  const title = sql`lower(btrim(regexp_replace(regexp_replace(btrim(${bookMetadata.title}), ${'[[:space:]]*[(](18|19|20|21)[0-9]{2}[)]$'}, ''), ${'[[:space:]]+'}, ' ', 'g')))`;
  const language = sql`nullif(lower(btrim(${bookMetadata.language})), '')`;
  const authors = sql`(select string_agg(ba.author_id::text, ',' order by ba.author_id) from book_authors ba where ba.book_id = ${books.id})`;

  // Missing metadata must not collapse unrelated books into a shared "unknown" group.
  return sql<string>`case
    when length(${title}) >= 3 and ${language} is not null and ${authors} is not null
    then 'a:' || md5(jsonb_build_array(${books.libraryId}, ${title}, ${language}, ${authors})::text)
    else ${separateKey} end`;
}
