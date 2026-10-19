#!/usr/bin/env node
import { globSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const server = resolve(dirname(fileURLToPath(import.meta.url)), "../../server");
const files = [...globSync(["src/**/*.ts", "apps/**/*.ts", "libs/**/*.ts", "test/**/*.ts"], { cwd: server })]
  .filter((file) => file !== "src/metadata.ts")
  .sort();
const batchSize = 128;
for (let start = 0; start < files.length; start += batchSize) {
  console.log(`Linting server files ${start + 1}-${Math.min(start + batchSize, files.length)} of ${files.length}`);
  const result = spawnSync(
    process.execPath,
    [
      join(server, "node_modules/eslint/bin/eslint.js"),
      "--cache",
      "--cache-location",
      join(server, "node_modules/.cache/eslint-batches", String(start / batchSize)),
      ...process.argv.slice(2),
      ...files.slice(start, start + batchSize),
    ],
    { cwd: server, stdio: "inherit" },
  );
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
