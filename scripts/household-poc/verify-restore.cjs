const assert = require("node:assert/strict");
const { Pool } = require("../../server/node_modules/pg");
async function run() {
  const source = new Pool({ connectionString: "postgres://poc:household-disposable-only@127.0.0.1:55472/bookorbit_poc" });
  const restored = new Pool({ connectionString: "postgres://poc:household-disposable-only@127.0.0.1:55472/bookorbit_poc_restore" });
  try {
    for (const table of [
      "works",
      "books",
      "book_files",
      "users",
      "user_permissions",
      "user_library_access",
      "reading_progress",
      "audiobook_progress",
      "user_book_ratings",
      "reading_attempts",
    ]) {
      const query = `select to_jsonb(t) as data from ${table} t order by to_jsonb(t)::text`;
      assert.deepEqual((await restored.query(query)).rows, (await source.query(query)).rows, table);
      console.log(`PASS restored ${table}`);
    }
  } finally {
    await source.end();
    await restored.end();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
