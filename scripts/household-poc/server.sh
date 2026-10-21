#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/household-poc/env.sh
exec pnpm --dir server run start --config nest-cli.dev.json
