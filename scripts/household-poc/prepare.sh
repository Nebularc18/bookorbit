#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/household-poc/env.sh
mkdir -p "$POC_ROOT/data" "$POC_ROOT/books"
python3 scripts/household-poc/sample-files.py "$POC_ROOT/books"
export POC_FFMPEG
POC_FFMPEG="$(node -p "require('./server/node_modules/@ffmpeg-installer/ffmpeg').path")"
python3 - <<'PY'
import os, pathlib, subprocess
for path in pathlib.Path(os.environ['POC_FILES']).rglob('*.wav'):
    subprocess.run([os.environ['POC_FFMPEG'], '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(path), str(path.with_suffix('.mp3'))], check=True)
PY
pnpm --filter @bookorbit/types build
pnpm --filter @bookorbit/plugin-api build
pnpm --dir server db:migrate
pnpm --dir server exec tsx src/scripts/seed-household-poc.ts
