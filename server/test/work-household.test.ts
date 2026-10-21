import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';

const enabled =
  process.env.POC_API_URL === 'http://127.0.0.1:6272' &&
  ['postgres://poc@127.0.0.1:55472/bookorbit_poc', 'postgres://poc:household-disposable-only@127.0.0.1:55472/bookorbit_poc'].includes(
    process.env.DATABASE_URL ?? '',
  );
describe.skipIf(!enabled)('household works on disposable PostgreSQL and real HTTP routes', () => {
  let pool: Pool;
  let admin: string;
  let reader: string;
  let outsider: string;
  async function request(path: string, token = admin, method = 'GET', body?: unknown) {
    return fetch(`${process.env.POC_API_URL}/api/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  async function json(path: string, token = admin) {
    const response = await request(path, token);
    expect(response.status).toBe(200);
    return response.json();
  }
  async function snapshot() {
    const tables = ['book_files', 'reading_progress', 'audiobook_progress', 'user_book_ratings', 'reading_attempts'];
    const rows = await Promise.all(
      tables.map(async (table) => (await pool.query(`select to_jsonb(t) as data from ${table} t order by to_jsonb(t)::text`)).rows),
    );
    const paths = (await pool.query('select absolute_path from book_files order by id')).rows;
    const hashes = await Promise.all(
      paths.map(async (row) =>
        createHash('sha256')
          .update(await readFile(row.absolute_path))
          .digest('hex'),
      ),
    );
    return { rows, hashes };
  }
  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const login = async (username: string) => {
      const r = await fetch(`${process.env.POC_API_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: 'Household-demo-472!' }),
      });
      expect(r.status).toBe(200);
      return (await r.json()).accessToken;
    };
    admin = await login('poc-admin');
    reader = await login('poc-reader');
    outsider = await login('poc-outsider');
  });
  afterAll(async () => {
    await pool?.end();
  });

  it('groups before pagination and filters language and format on the same edition', async () => {
    const all = await json('/works?libraryId=1');
    expect(all.items).toHaveLength(1);
    expect(all.items[0].editions.map((e: { bookId: number }) => e.bookId)).toEqual([1, 2, 3, 4]);
    expect((await json('/works?libraryId=1&language=sv&format=mp3')).items).toEqual([]);
    expect((await json('/works?libraryId=1&language=sv&format=audio')).items).toEqual([]);
    expect((await json('/works?libraryId=1&language=en&format=audio')).items[0].editions).toHaveLength(2);
    expect((await json('/works?libraryId=1&language=sv&format=epub')).items[0].editions.map((e: { bookId: number }) => e.bookId)).toEqual([2]);
    expect((await json('/works?libraryId=1&language=en&format=mp3')).items[0].editions.map((e: { bookId: number }) => e.bookId)).toEqual([3, 4]);
  });
  it('ungroups and regroups without changing files, positions, ratings or history', async () => {
    const before = await snapshot();
    const work = (await json('/works?libraryId=1')).items[0];
    for (const bookId of [1, 2, 3, 4]) expect((await request(`/works/${work.workId}/editions/${bookId}`, admin, 'DELETE')).status).toBe(200);
    expect((await json('/works?libraryId=1')).items).toHaveLength(4);
    const first = await json('/works?libraryId=1&limit=1');
    expect(first.hasMore).toBe(true);
    const second = await json(`/works?libraryId=1&limit=1&after=${encodeURIComponent(first.items[0].key)}`);
    expect(second.items).toHaveLength(1);
    expect(second.items[0].key).not.toBe(first.items[0].key);
    expect(await snapshot()).toEqual(before);
    const response = await request('/works', admin, 'POST', { title: 'The household sample', bookIds: [1, 2, 3, 4] });
    expect(response.status).toBe(201);
    expect((await json('/works?libraryId=1')).items).toHaveLength(1);
    expect(await snapshot()).toEqual(before);
    expect((await request('/works', admin, 'POST', { title: 'Duplicate', bookIds: [1, 2] })).status).toBe(409);
  });
  it('keeps narration manifests separate and serves actual track bytes', async () => {
    const a = await json('/audiobooks/3/manifest');
    const b = await json('/audiobooks/4/manifest');
    expect(a.assets).toHaveLength(1);
    expect(b.assets).toHaveLength(2);
    expect(a.assets.some((asset: { assetId: string }) => b.assets.some((other: { assetId: string }) => asset.assetId === other.assetId))).toBe(false);
    const response = await request(`/audiobooks/4/assets/${b.assets[0].assetId}/content`);
    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBe(b.assets[0].sizeBytes);
    expect((await request(`/audiobooks/3/assets/${b.assets[0].assetId}/content`)).status).toBe(404);
  });
  it('preserves independent users and editions and rejects an offline stale revision', async () => {
    const manifest = await json('/audiobooks/4/manifest');
    const initial = await json('/audiobooks/4/playback-state');
    const otherUser = await json('/audiobooks/4/playback-state', reader);
    const otherEdition = await json('/audiobooks/3/playback-state');
    const write = {
      assetId: manifest.assets[0].assetId,
      positionMs: 20000,
      capturedAt: new Date().toISOString(),
      operationId: randomUUID(),
      baseRevision: initial.revision,
      manifestRevision: manifest.revision,
    };
    const saved = await request('/audiobooks/4/playback-state', admin, 'PUT', write);
    expect(saved.status).toBe(200);
    const current = await saved.json();
    expect(current.revision).toBe(initial.revision + 1);
    expect((await request('/audiobooks/4/playback-state', admin, 'PUT', write)).status).toBe(200);
    expect((await request('/audiobooks/4/playback-state', admin, 'PUT', { ...write, operationId: randomUUID(), positionMs: 10000 })).status).toBe(
      409,
    );
    const reread = await json('/audiobooks/4/playback-state');
    expect(reread.percentage).toBeCloseTo(current.percentage, 4);
    expect({ ...reread, percentage: current.percentage }).toEqual(current);
    expect(await json('/audiobooks/4/playback-state', reader)).toEqual(otherUser);
    expect(await json('/audiobooks/3/playback-state')).toEqual(otherEdition);
  });
  it('applies household content restrictions to editions inside grouped works', async () => {
    const tag = (await pool.query("insert into tags (name) values ('poc-hidden') returning id")).rows[0].id;
    const userId = (await pool.query("select id from users where username='poc-reader'")).rows[0].id;
    await pool.query('insert into book_tags (book_id,tag_id) values (2,$1)', [tag]);
    await pool.query("insert into user_content_filter_tags (user_id,filter_type,tag_id) values ($1,'exclude',$2)", [userId, tag]);
    try {
      expect((await json('/works?libraryId=1', reader)).items[0].editions.map((e: { bookId: number }) => e.bookId)).toEqual([1, 3, 4]);
      expect((await json('/works?libraryId=1&language=sv', reader)).items).toEqual([]);
      expect((await request('/books/2', reader)).status).toBe(404);
    } finally {
      await pool.query('delete from tags where id=$1', [tag]);
    }
  });

  it('requires editor library access even with metadata permission', async () => {
    const userId = (await pool.query("select id from users where username='poc-reader'")).rows[0].id;
    await pool.query("insert into user_permissions (user_id,permission_name) values ($1,'library_edit_metadata')", [userId]);
    try {
      expect((await request('/works', reader, 'POST', { title: 'Denied', bookIds: [1, 2] })).status).toBe(403);
      const workId = (await json('/works?libraryId=1')).items[0].workId;
      expect((await request(`/works/${workId}/editions/1`, reader, 'DELETE')).status).toBe(403);
    } finally {
      await pool.query("delete from user_permissions where user_id=$1 and permission_name='library_edit_metadata'", [userId]);
    }
  });
  it('refuses grouping across household library boundaries', async () => {
    const libraryId = (await pool.query("insert into libraries (name) values ('Other prototype library') returning id")).rows[0].id;
    try {
      const folderId = (await pool.query("insert into library_folders (library_id,path) values ($1,'/poc-other') returning id", [libraryId])).rows[0]
        .id;
      const bookId = (
        await pool.query("insert into books (library_id,library_folder_id,folder_path) values ($1,$2,'/poc-other/edition') returning id", [
          libraryId,
          folderId,
        ])
      ).rows[0].id;
      expect((await request('/works', admin, 'POST', { title: 'Denied', bookIds: [1, bookId] })).status).toBe(400);
      expect((await json('/works?libraryId=1')).items[0].editions).toHaveLength(4);
    } finally {
      await pool.query('delete from libraries where id=$1', [libraryId]);
    }
  });

  it('enforces library visibility, mutation permission and strict DTO validation', async () => {
    expect((await json('/works?libraryId=1', reader)).items).toHaveLength(1);
    expect((await request('/works?libraryId=1', outsider)).status).toBe(403);
    expect((await request('/audiobooks/4/manifest', outsider)).status).toBe(404);
    expect((await request('/works', reader, 'POST', { title: 'Denied', bookIds: [1, 2] })).status).toBe(403);
    expect((await request('/works/1/editions/1', reader, 'DELETE')).status).toBe(403);
    expect((await request('/works', admin, 'POST', { title: 'Invalid', bookIds: [1, 1] })).status).toBe(400);
    expect((await request('/works', admin, 'POST', { title: 'Invalid', bookIds: [1, 2], moveFiles: true })).status).toBe(400);
    expect((await request('/works?libraryId=1&limit=1000')).status).toBe(400);
  });
});
