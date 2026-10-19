#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/household-poc/env.sh
exec pnpm --dir client run dev --host 127.0.0.1 --port 5178 --strictPort
