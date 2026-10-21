import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./classify-upstream-sync-pr.sh", import.meta.url));
const classify = (...args) => execFileSync("bash", [script, ...args], { encoding: "utf8" }).trim();

test("recognizes trusted upstream syncs within a downstream repository", () => {
  for (const association of ["OWNER", "MEMBER", "COLLABORATOR"]) {
    assert.equal(classify("example/bookorbit", "example/bookorbit", "sync/upstream-main-20261021", association), "true");
  }
});

test("keeps normal contribution policy for other pull requests", () => {
  for (const args of [
    ["bookorbit/bookorbit", "bookorbit/bookorbit", "sync/upstream-main-20261021", "OWNER"],
    ["example/bookorbit", "outside/bookorbit", "sync/upstream-main-20261021", "OWNER"],
    ["example/bookorbit", "example/bookorbit", "BO-123-add-books", "OWNER"],
    ["example/bookorbit", "example/bookorbit", "sync/upstream-main-20261021-extra", "OWNER"],
    ["example/bookorbit", "example/bookorbit", "sync/upstream-main-20261021", "CONTRIBUTOR"],
    ["example/bookorbit", "example/bookorbit", "sync/upstream-main-20261021", "NONE"],
  ]) {
    assert.equal(classify(...args), "false");
  }
});
