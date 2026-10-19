#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/household-poc/env.sh
restore="$(realpath "${1:?Pass the extracted restore directory}")"
case "$restore" in "$POC_ROOT"/restore-*) ;; *) echo 'Only this prototype restore directory is allowed' >&2; exit 1;; esac
node scripts/household-poc/relocate-restore.cjs "$restore"
export DATABASE_URL=postgres://poc:household-disposable-only@127.0.0.1:55472/bookorbit_poc_restore PORT=6273
export APP_DATA_PATH="$restore/data" LIBRARY_BROWSE_ROOT="$restore/books"
exec pnpm --dir server run start --config nest-cli.dev.json
