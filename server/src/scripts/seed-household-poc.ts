import { resolve, join } from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { hash } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { Permission } from '@bookorbit/types';
import * as schema from '../db/schema';

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/bookorbit_poc') throw new Error('Only local bookorbit_poc is allowed');
  const root = resolve(process.env.POC_FILES!);
  const pool = new Pool({ connectionString: url.toString() });
  const db = drizzle(pool, { schema });
  try {
    if ((await db.select({ id: schema.users.id }).from(schema.users).limit(1)).length) throw new Error('Seed requires a fresh database');
    const passwordHash = await hash('Household-demo-472!', 10);
    const accounts = await db
      .insert(schema.users)
      .values([
        { username: 'poc-admin', name: 'Prototype admin', passwordHash, isSuperuser: true },
        { username: 'poc-reader', name: 'Household reader', passwordHash },
        { username: 'poc-outsider', name: 'No library access', passwordHash },
      ])
      .returning();
    await db.insert(schema.userPermissions).values({ userId: accounts[1]!.id, permissionName: Permission.LibraryDownload });
    const [library] = await db
      .insert(schema.libraries)
      .values({ name: 'Household prototype', watch: false, autoScanCronExpression: null })
      .returning();
    const [folder] = await db.insert(schema.libraryFolders).values({ libraryId: library!.id, path: root }).returning();
    await db.insert(schema.userLibraryAccess).values({ userId: accounts[1]!.id, libraryId: library!.id, accessLevel: 'viewer' });
    const [work] = await db
      .insert(schema.works)
      .values({ libraryId: library!.id, userId: accounts[0]!.id, title: 'The household sample' })
      .returning();
    const ids: number[] = [];
    for (const [directory, language, narrator] of [
      ['en', 'en', null],
      ['sv', 'sv', null],
      ['narrator-a', 'en', 'Narrator A'],
      ['narrator-b', 'en', 'Narrator B'],
    ] as const) {
      const [edition] = await db
        .insert(schema.books)
        .values({ libraryId: library!.id, libraryFolderId: folder!.id, workId: work!.id, folderPath: join(root, directory) })
        .returning({ id: schema.books.id });
      ids.push(edition!.id);
      await db.insert(schema.userBookRatings).values({ userId: accounts[1]!.id, bookId: edition!.id, rating: 4 });
      await db.insert(schema.readingAttempts).values({
        userId: accounts[1]!.id,
        bookId: edition!.id,
        origin: 'manual',
        startedOn: '2026-10-01',
        endedOn: '2026-10-02',
        outcome: 'completed',
      });
      await db.insert(schema.bookMetadata).values({ bookId: edition!.id, title: 'The household sample', language });
      if (narrator) {
        const [n] = await db.insert(schema.narrators).values({ name: narrator }).returning();
        await db.insert(schema.bookNarrators).values({ bookId: edition!.id, narratorId: n!.id });
      }
      const names = (await readdir(join(root, directory))).filter((name) => /\.(epub|mp3)$/.test(name)).sort();
      for (const [index, name] of names.entries()) {
        const absolutePath = join(root, directory, name);
        const info = await stat(absolutePath);
        const [file] = await db
          .insert(schema.bookFiles)
          .values({
            bookId: edition!.id,
            libraryFolderId: folder!.id,
            absolutePath,
            ino: BigInt(info.ino),
            sizeBytes: info.size,
            mtime: info.mtime,
            format: narrator ? 'mp3' : 'epub',
            sortOrder: index,
            durationSeconds: narrator ? 60 : null,
          })
          .returning({ id: schema.bookFiles.id });
        if (index === 0) {
          await db.update(schema.books).set({ primaryFileId: file!.id }).where(eq(schema.books.id, edition!.id));
          for (const account of accounts.slice(0, 2)) {
            if (narrator)
              await db
                .insert(schema.audiobookProgress)
                .values({ userId: account.id, bookId: edition!.id, currentFileId: file!.id, percentage: 10, positionSeconds: 6 });
            else
              await db
                .insert(schema.readingProgress)
                .values({ userId: account.id, bookFileId: file!.id, percentage: account.id === accounts[0]!.id ? 12 : 24 });
          }
        }
      }
    }
    console.log(JSON.stringify({ libraryId: library!.id, workId: work!.id, editionIds: ids, accounts: accounts.map((a) => a.username) }));
  } finally {
    await pool.end();
  }
}
void main();
