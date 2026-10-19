#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

const argv = process.argv.slice(2);
const dev = argv[0] === "--dev";
if (dev) argv.shift();
let runTimeoutMs = 15 * 60 * 1000;
let waitTimeoutMs = 120 * 1000;
while (argv[0] !== "--" && argv.length) {
  const flag = argv.shift();
  const match = /^--(run|wait)-timeout=(\d+)$/.exec(flag);
  if (!match || Number(match[2]) <= 0) {
    console.error("[resource-guard] Invalid timeout option: " + flag);
    process.exit(2);
  }
  if (match[1] === "run") runTimeoutMs = Number(match[2]);
  else waitTimeoutMs = Number(match[2]);
}
if (argv.shift() !== "--" || !argv.length) {
  console.error("Usage: with-resource-limits.mjs [--dev] -- command [args...]");
  process.exit(2);
}
const guarded =
  process.env.BOOKORBIT_RESOURCE_GUARD === "1" ||
  (process.env.BOOKORBIT_RESOURCE_GUARD !== "0" &&
    hostname().toLowerCase() === "t3code");
const nested = !dev && process.env.BOOKORBIT_HEAVY_CHECK_ACTIVE === "1";
let command = argv;
let scopeName;
let managerArgs = [];
const env = { ...process.env };
if (guarded && process.platform !== "linux") {
  console.error(
    "[resource-guard] Linux/systemd is required when the guard is enabled.",
  );
  process.exit(2);
}
if (guarded && !nested) {
  const memoryMb = Number(
    process.env.BOOKORBIT_CHECK_MEMORY_MB ?? (dev ? 3072 : 4096),
  );
  if (
    !Number.isInteger(memoryMb) ||
    memoryMb < 32 ||
    memoryMb > (dev ? 3072 : 4096)
  ) {
    console.error(
      "[resource-guard] Invalid memory budget; checks allow 32-4096 MiB, servers 32-3072 MiB.",
    );
    process.exit(2);
  }
  const root = process.getuid() === 0;
  managerArgs = root ? [] : ["--user"];
  scopeName =
    "bookorbit-" + (dev ? "dev-" : "check-") + randomUUID() + ".scope";
  const runtime = root ? "/run/lock" : process.env.XDG_RUNTIME_DIR;
  if (!runtime) {
    console.error(
      "[resource-guard] No user systemd session. Refusing to run an unbounded check.",
    );
    process.exit(2);
  }
  mkdirSync(runtime, { recursive: true });
  const scope = [
    "systemd-run",
    ...(root ? [] : ["--user"]),
    "--scope",
    "--quiet",
    "--collect",
    "--unit=" + scopeName,
    "--slice=bookorbit-" + (dev ? "dev" : "checks") + ".slice",
    "--property=MemoryHigh=infinity",
    "--property=MemoryMax=" + memoryMb + "M",
    "--property=MemorySwapMax=0",
    "--property=OOMPolicy=stop",
    "--property=TimeoutStopSec=5s",
    "--",
  ];
  if (!dev) {
    env.BOOKORBIT_HEAVY_CHECK_ACTIVE = "1";
    env.BO_TEST_MAX_WORKERS = "1";
    command = [
      "flock",
      "--timeout",
      String(waitTimeoutMs / 1000),
      "--conflict-exit-code",
      "75",
      join(runtime, "bookorbit-heavy-check.lock"),
      ...scope,
      "timeout",
      "--signal=TERM",
      "--kill-after=5s",
      String(runTimeoutMs / 1000) + "s",
      ...argv,
    ];
    console.error(
      "[resource-guard] Host-wide check lock; budget " +
        memoryMb +
        " MiB; deadline " +
        runTimeoutMs +
        " ms.",
    );
  } else command = [...scope, ...argv];
}
const child = spawn(command[0], command.slice(1), {
  stdio: "inherit",
  env,
  detached: process.platform !== "win32",
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (scopeName) {
      spawnSync("systemctl", [...managerArgs, "stop", scopeName], {
        timeout: 10000,
        stdio: "ignore",
      });
    }
    try {
      if (process.platform === "win32") child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch {}
  });
}
child.on("error", (error) => {
  console.error("[resource-guard] Could not start command: " + error.message);
  process.exitCode = 127;
});
child.on("exit", (code, signal) => {
  if (guarded && !dev && code !== 0) {
    console.error(
      "[resource-guard] Check failed or exceeded its budget. Do not rerun it unguarded; reduce its scope or inspect the unit logs.",
    );
  }
  process.exitCode = code ?? (signal === "SIGINT" ? 130 : 143);
});
