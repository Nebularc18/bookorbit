# Local development resource guard

On T3Code, package scripts serialize type checks, builds and tests with one host-wide flock, across worktrees. Each check runs in a separate systemd scope outside T3Code's shared agent slice, with a 4 GiB hard memory limit, no swap, one test worker and a 15-minute timeout. A busy lock waits at most two minutes and exits 75. The check fails rather than stalling every T3 agent.

Client build stages run sequentially. Dev scripts use separate bookorbit-dev.slice scopes with a 3 GiB limit per server and do not hold the check lock. Already-running servers are not moved or restarted by installation.

Use package scripts, for example pnpm typecheck:client, pnpm test:client and pnpm build:client. For a targeted check, use:

```sh
node scripts/dev/with-resource-limits.mjs -- pnpm --dir client exec vitest run path/to/test.ts --maxWorkers=1
```

Do not launch vue-tsc, tsc, vitest or build commands directly with pnpm exec on T3Code. Direct commands bypass the guard. Do not disable the guard to retry a failed check. Split or optimize a check that exceeds its budget. The existing vue-tsc project references and incremental build information are retained; no type checking is skipped.

The guard activates automatically on hostname T3Code, or explicitly with BOOKORBIT_RESOURCE_GUARD=1 on Linux with systemd, flock and timeout. It fails closed when required tools or the user systemd session are unavailable. Root uses the system manager; other users use their user manager. Other hosts, containers and CI retain normal command execution by default. BOOKORBIT_CHECK_MEMORY_MB can lower the budget for verification.

Rollback: restore the modified package.json files and with-test-lock.mjs from the deployment backup. The wrapper creates only transient scopes and a reusable lock file; it installs no background service. Nothing changes the live NAS BookOrbit app.
