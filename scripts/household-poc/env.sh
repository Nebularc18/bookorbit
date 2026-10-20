#!/usr/bin/env bash
POC_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/local/household-poc"
export POC_ROOT
export DATABASE_URL=postgres://poc:household-disposable-only@127.0.0.1:55472/bookorbit_poc
export PORT=6272 HOST=127.0.0.1 NODE_ENV=development
export JWT_SECRET=household-disposable-development-only-472 JWT_EXPIRES_IN=1d JWT_REFRESH_EXPIRES_IN=7d
export APP_DATA_PATH="$POC_ROOT/data" LIBRARY_BROWSE_ROOT="$POC_ROOT/books" POC_FILES="$POC_ROOT/books"
export COVER_SLOTS_BACKFILL_MODE=skip BOOKORBIT_API_TARGET=http://127.0.0.1:6272
