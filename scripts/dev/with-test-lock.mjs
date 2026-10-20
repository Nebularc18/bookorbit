#!/usr/bin/env node
import { hostname } from "node:os";

const guarded =
  process.env.BOOKORBIT_RESOURCE_GUARD === "1" ||
  (process.env.BOOKORBIT_RESOURCE_GUARD !== "0" &&
    hostname().toLowerCase() === "t3code");
await import(
  guarded ? "./with-resource-limits.mjs" : "./with-test-lock-legacy.mjs"
);
