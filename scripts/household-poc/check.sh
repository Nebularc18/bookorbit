#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
pnpm run typecheck:server
pnpm --dir server run test src/modules/audiobook/audiobook.service.test.ts src/modules/book/book-access-hides-existence.test.ts src/modules/series/utils/series-ladder.utils.test.ts --maxWorkers=1
pnpm --dir client run test:unit --run src/features/works/composables/useWorkCatalog.test.ts --maxWorkers=1
pnpm --dir server exec eslint src/modules/work src/db/schema/works.ts src/scripts/seed-household-poc.ts test/work-household.test.ts
pnpm --dir client exec eslint src/features/works src/router/index.ts src/views/HomeView.vue
