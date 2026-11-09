import { type AnyPgColumn, integer, pgTable, serial, varchar } from 'drizzle-orm/pg-core';
import { users } from './auth';

export const works = pgTable('works', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 1000 }).notNull(),
});
