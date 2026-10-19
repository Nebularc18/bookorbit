const { resolve, join } = require("node:path");
const { stat } = require("node:fs/promises");
const { Pool } = require("../../server/node_modules/pg");

async function main() {
  const root = resolve(__dirname, "../../local/household-poc");
  const destination = resolve(process.argv[2] || "");
  if (!destination.startsWith(`${root}/restore-`)) throw new Error("Only a prototype restore directory is allowed");
  if (!(await stat(join(destination, "books"))).isDirectory()) throw new Error("Restored books are missing");
  const pool = new Pool({ connectionString: "postgres://poc:household-disposable-only@127.0.0.1:55472/bookorbit_poc_restore" });
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const [table, column] of [
      ["library_folders", "path"],
      ["books", "folder_path"],
      ["book_files", "absolute_path"],
    ]) {
      await client.query(`update ${table} set ${column}=replace(${column},$1,$2) where starts_with(${column},$1)`, [
        join(root, "books"),
        join(destination, "books"),
      ]);
    }
    await client.query("commit");
    console.log("Relocated only bookorbit_poc_restore to its restored sample files");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
