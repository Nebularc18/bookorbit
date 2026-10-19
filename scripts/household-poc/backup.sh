#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/household-poc/env.sh
umask 077
backup="$POC_ROOT/backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup"
# Stop the prototype server before running this to quiesce application file writes.
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --file="$backup/database.dump"
tar -C "$POC_ROOT" -czf "$backup/application.tar.gz" data books
cp scripts/household-poc/env.sh "$backup/development-config.sh"
git rev-parse HEAD > "$backup/base-commit.txt"
git diff --binary HEAD -- client/src/router/index.ts client/src/views/HomeView.vue packages/types/src/index.ts server/src/app.module.ts server/src/db/schema/books.ts server/src/db/schema/index.ts server/src/db/migrations/meta/_journal.json > "$backup/prototype.patch"
git ls-files --others --exclude-standard -z -- client/src/features/works docker-compose.household-poc.yml docs/HOUSEHOLD_PROTOTYPE.md packages/types/src/works.ts scripts/household-poc server/src/db/migrations/0121_household_works.sql server/src/db/migrations/meta/0121_snapshot.json server/src/db/schema/works.ts server/src/modules/work server/src/scripts/seed-household-poc.ts server/test/work-household.test.ts | tar --null -T - -czf "$backup/additive-source.tar.gz"
(cd "$backup" && sha256sum database.dump application.tar.gz development-config.sh base-commit.txt prototype.patch additive-source.tar.gz > SHA256SUMS)
printf '%s\n' "$backup"
