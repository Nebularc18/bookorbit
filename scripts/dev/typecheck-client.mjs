#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const client = resolve(dirname(fileURLToPath(import.meta.url)), "../../client");
const require = createRequire(join(client, "package.json"));
const ts = require("typescript");
const { references } = JSON.parse(readFileSync(join(client, "tsconfig.json"), "utf8"));
function check(path) {
  console.log(`Type checking client project ${path}`);
  const result = spawnSync(process.execPath, [join(client, "node_modules/vue-tsc/bin/vue-tsc.js"), "--build", path, ...process.argv.slice(2)], {
    cwd: client,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
for (const { path } of references) {
  if (path !== "./tsconfig.vitest.json") {
    check(path);
    continue;
  }
  const configPath = resolve(client, path);
  const config = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic(diagnostic) {
        console.error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
        process.exit(1);
      },
    },
  );
  if (!config || config.errors.length) {
    console.error(config?.errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n")).join("\n"));
    process.exit(1);
  }
  const ambient = config.fileNames.filter((file) => file.endsWith(".d.ts"));
  const tests = config.fileNames.filter((file) => !file.endsWith(".d.ts")).sort();
  const directory = join(client, "node_modules/.tmp/typecheck-tests");
  mkdirSync(directory, { recursive: true });
  for (let start = 0; start < tests.length; start += 16) {
    const batch = start / 16;
    const batchPath = join(directory, `${batch}.json`);
    // Preserve ambient declarations in every batch; imported application code is resolved normally.
    const contents = JSON.stringify({
      extends: configPath,
      files: [...ambient, ...tests.slice(start, start + 16)],
      include: [],
      compilerOptions: { tsBuildInfoFile: join(directory, `${batch}.tsbuildinfo`) },
    });
    if (!ts.sys.fileExists(batchPath) || readFileSync(batchPath, "utf8") !== contents) writeFileSync(batchPath, contents);
    check(batchPath);
  }
}
