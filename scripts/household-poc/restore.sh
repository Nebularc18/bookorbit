#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/../.."
source scripts/household-poc/env.sh
backup="$(realpath "${1:?Pass the backup directory}")"
case "$backup" in "$POC_ROOT"/backups/*) ;; *) echo 'Only this prototype backup directory is allowed' >&2; exit 1;; esac
(cd "$backup" && sha256sum -c SHA256SUMS)
export PGHOST=127.0.0.1 PGPORT=55472 PGUSER=poc PGPASSWORD=household-disposable-only
# createdb fails if the destination already exists. Never drop or overwrite a database.
createdb bookorbit_poc_restore
pg_restore --dbname=bookorbit_poc_restore --no-owner --no-acl --exit-on-error "$backup/database.dump"
restore="$POC_ROOT/restore-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir "$restore"
tar -C "$restore" -xzf "$backup/application.tar.gz"
cp "$backup/development-config.sh" "$restore/development-config.sh"
printf 'Restored database: bookorbit_poc_restore\nApplication files: %s\n' "$restore"
printf 'Database absolute file paths still point to the original prototype root. Restore that mount path before launching, or explicitly relocate paths in this disposable database.\n'
