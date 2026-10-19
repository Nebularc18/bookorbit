#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/household-poc/env.sh
export POC_API_URL=http://127.0.0.1:6272
exec pnpm --dir server run test test/work-household.test.ts --maxWorkers=1
