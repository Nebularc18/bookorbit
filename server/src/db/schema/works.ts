import { type AnyPgColumn, index, integer, pgTable, serial, unique, varchar } from 'drizzle-orm/pg-core';
import { libraries } from './libraries';
import { users } from './auth';

export const works = pgTable(
  'works',
  {
    id: serial('id').primaryKey(),
    libraryId: integer('library_id')
      .notNull()
      .references(() => libraries.id, { onDelete: 'cascade' }),
    userId: integer('user_id').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 1000 }).notNull(),
  },
  (t) => [unique('works_id_library_unique').on(t.id, t.libraryId), index('works_library_idx').on(t.libraryId)],
);
