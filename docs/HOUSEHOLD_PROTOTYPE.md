# Household works prototype

## Recommendation

Continue with BookOrbit with specific compromises. Keep existing book IDs as editions, use a library as the shared household boundary, and add works above editions. Keep native clients on edition APIs until each client explicitly adopts a works interface. Treat ebook conflict handling, supported iOS customization, and automated recovery as acceptance gates before trusting this fork as the household's primary system.

This is a development prototype, not a migration plan for an existing household library. No production service, credentials, library or database was used. No changes were pushed or published.

## What changed

- Additive generated migration `0121_household_works`: `works` table and nullable `books.work_id`. A composite foreign key keeps a work inside one library. Existing IDs are unchanged. No bulk backfill is required; the grouped catalog can match editions at read time without saving memberships.
- `GET /api/v1/works?libraryId=1&language=sv&format=audio` returns a bounded page of works with only matching, accessible editions. `audio` means every audio format supported by the existing server; a concrete format such as `epub` or `mp3` is also accepted. Both filters apply to the same book record. Grouping happens before pagination.
- `POST /api/v1/works` accepts `{ "title": "Example", "bookIds": [1,2,3,4] }`. It locks editions in ID order, checks editor access and content restrictions, and changes only grouping metadata in a transaction. Existing groups must be ungrouped before regrouping. At most 100 editions per group.
- `DELETE /api/v1/works/:workId/editions/:bookId` detaches one edition. Files, user positions, ratings and reading attempts remain attached to their original IDs.
- `/library/:libraryId/works` is linked from the library toolbar. It shows one title and selectable edition links to existing reader/player routes. Existing library screens, mobile catalog routes and series views remain edition based.
- Grouping requires `library_edit_metadata` and editor access to the library, with superuser bypass through the established library access service. The UI checks both permission and library access level. Ordinary household viewers can select editions and maintain their own progress.

No scheduled backup service or guided restore UI was added. The development backup/restore scripts were exercised; scheduled recovery remains an adoption requirement.

The launch/test scripts use the package scripts, which currently include the resource wrapper added by concurrent work. Those resource-wrapper changes are preserved separately.

A work is shared library data. `works.user_id` records its creator, not exclusive ownership. Every list is library and content-filter scoped. Private user data remains in the existing user/edition tables.

## Grouping ebook and audiobook editions

Open **Grouped books** from a library's toolbar to see matching editions together, even when they are stored in separate folders. Automatic grouping is enabled on that page. It matches the same authors, language and title, ignoring capitalization, repeated whitespace and a trailing publication year in parentheses. It does not use fuzzy title matching. Editions without enough metadata remain separate.

For editions that do not match automatically, select their checkboxes, enter a book title and choose **Group editions**. This saves a group without moving files or changing edition IDs, positions, ratings or history. A newly scanned edition with matching metadata also appears with a saved group when there is exactly one matching saved group. Conflicting saved groups remain separate.

Turn off **Automatically group matching editions** to inspect each ungrouped edition separately. **Ungroup edition** removes a saved membership; automatic matching can still display that edition with others while automatic grouping is enabled. The regular library grid, series views and native clients continue to list individual editions.

The catalog API accepts `autoGroup=false` and a bounded `search` title query. Automatic group cursors use `a:` followed by a 32-character digest. Grouping precedes pagination, and each result includes at most 100 matching editions with `hasMoreEditions` when truncated. Library access and content restrictions apply before matching, including when discovering saved groups.

## Verified architecture

The initial observations were checked against this checkout at `ce118e38`:

- `server/src/db/schema/books.ts` owns multiple `book_files` per book. `book_metadata` owns book-level language, ISBN and publisher. `book_narrators` relates narrators to book IDs.
- `AudiobookService.loadManifestContext()` builds one sequence from the audio files belonging to that book. A different narrator must be a different existing book record. Grouping file records under one book would incorrectly concatenate narrations, so the prototype never does that.
- EPUB progress is keyed by user and file; audiobook progress by user and book. Ratings, statuses and reading attempts are user/book scoped. A work does not introduce a shared position.
- The newer audiobook API checks `manifestRevision`, uses an optimistic `baseRevision`, and handles the latest `operationId` retry. This is not a permanent ledger of every operation ever submitted.
- `series/utils/series-gaps.utils.ts` uses reliable provider totals only when local indices support them; otherwise it reports interior gaps. Keep this code. Series lists still count editions, so work-aware series presentation needs follow-up.
- `book-dock`, scanner, `file-write/file-rename.service.ts` and `library/bulk-rename.service.ts` implement real ingestion and filesystem organization. They remain intact. Their full runtime workflows were not exercised in this slice.
- No complete built-in scheduled application backup and guided database/files restore workflow was found. Migration tools, deleted-item restores and frontend table-preference backups are different operations.

A book with mixed translations/narrations already incorrectly combined in one upstream record still needs manual splitting before grouping. This prototype intentionally does not infer or split it. Multiple interchangeable ebook formats can stay under one edition; existing per-file ebook positions remain intact. The upstream read-aloud bridge can align media within one record; this prototype adds no bridge between editions.

## Launch on a fresh development machine

Requirements: Node 24+, pnpm 11, Python 3, Docker Compose, and PostgreSQL 16 client tools for backup/restore. `corepack pnpm` works if pnpm is not on PATH; enable a user-local Corepack shim so package scripts can also find `pnpm`.

From the repository root:

```bash
pnpm install --frozen-lockfile
docker compose -f docker-compose.household-poc.yml up -d --wait
bash scripts/household-poc/prepare.sh
bash scripts/household-poc/server.sh
```

In another terminal:

```bash
bash scripts/household-poc/client.sh
```

Open `http://localhost:5178/library/1/works`. Accounts `poc-admin`, `poc-reader` and `poc-outsider` use development password `Household-demo-472!`. Admin can group; reader has viewer/download access; outsider has no access. These are disposable fixture credentials, never use them outside this local prototype.

Preparation refuses to seed a nonempty database. It creates English and Swedish EPUBs containing original sample text, Narrator A with one 60-second MP3 and Narrator B with two 60-second MP3s. Audio fixtures use distinguishable synthetic tones, not actual spoken narrations. FFmpeg comes from the existing development dependency. It also seeds individual progress, ratings and reading history. Scanning, renaming, write-back and metadata acquisition are not enabled for the sample library.

Ports are 55472 for PostgreSQL, 6272 for the API and 5178 for the client. Data lives under ignored `local/household-poc`. The separate Compose project has no fixed container name and never uses the production Compose configuration. If a port is already occupied, stop and inspect the conflict; do not shut down another installation to make room.

In this session Docker was unavailable. A rootless PostgreSQL 16 cluster with pgvector was extracted under `/tmp/bookorbit-poc-tools` and started only on `127.0.0.1:55472`; it is not a system service. The running development API was bound to the development host interface only for the remote Android emulator test. Launch scripts default to loopback. Sample files/application data now use the `local/household-poc` paths above. The temporary cluster is not durable across `/tmp` cleanup. Reproduce with the dedicated Compose file on a fresh machine rather than attaching this prototype to an existing database.

## Backup and restore

Stop the prototype API before taking a backup so application data and book files are quiescent. The client may remain open.

```bash
bash scripts/household-poc/backup.sh
bash scripts/household-poc/restore.sh local/household-poc/backups/REPLACE_WITH_BACKUP_DIRECTORY
node scripts/household-poc/verify-restore.cjs
```

The backup contains a custom-format PostgreSQL dump, application data, sample books, development configuration, base commit, tracked diff and additive source files. Checksums cover all artifacts. Directories/files are private to the current user. Restore creates `bookorbit_poc_restore` and refuses an existing destination; it never drops a database. The verification script compares grouping, books/files, accounts/access, ebook/audio progress, ratings and reading attempts.

After the comparison, a separate restored server can be launched against the extracted files:

```bash
bash scripts/household-poc/restored-server.sh local/household-poc/restore-REPLACE_WITH_DIRECTORY
```

It relocates paths only inside `bookorbit_poc_restore`, uses restored application data and listens on 6273. For the browser, set `BOOKORBIT_API_TARGET=http://127.0.0.1:6273` when launching a separate Vite instance on a different free port. Do the equality comparison before starting a restored server, because login/activity legitimately changes restored state.

The database stores absolute library paths. Restored application files are extracted into a separate restore directory. Before serving a restored installation, restore the original mount paths, or explicitly relocate `library_folders.path`, `books.folder_path` and `book_files.absolute_path` in the restored database. Point `APP_DATA_PATH` at the restored application-data directory. Do not run both instances against writable shared files.

The included fixture credentials/key are development-only. A real backup design must separately encrypt and protect library files, database dumps, application configuration, JWT and encryption keys, TLS/reverse-proxy configuration, and external credentials. Preserve `server_identity` from the database for existing native clients. Test recovery without relying on the source machine. Set retention, off-host copies, disk-space monitoring and failure alerts before scheduling. A daily scheduler entry can invoke a quiesced snapshot job, but no scheduler or production job was installed here.

## Mobile investigation

Sources checked on 2026-10-17:

- [Official iOS support](https://bookorbit.app/support/) documents offline support. The [public iOS repository](https://github.com/bookorbit/bookorbit-ios-support) contains support/privacy material, not the app implementation. The server checkout documents iOS 26+ and BookOrbit 3.0+. Customizing that native UI requires source access or cooperation with its developer. There is no iOS runtime pass here: the available hosts lack macOS with Xcode and working `xcrun simctl`; no physical test iPhone was attached.
- [deranjer/bookorbit-android](https://github.com/deranjer/bookorbit-android) has Kotlin/Compose, Room, WorkManager downloads, a Foliate reader and Media3 playback. Released APK v0.6.0 was installed unchanged on the remote Pixel 9 Pro emulator, Android 15. Source inspected at `f2de4a7a30ea651dab4807078cd4cf76d850a6c4`; inspected main-source behavior is not necessarily identical to the release binary.
- [Lagrange Reader](https://github.com/van-geaux/lagrange-reader) is another open-source Android candidate advertising offline books/audio and BookOrbit integration. Not installed or runtime tested here.
- [StarBookOrbit](https://github.com/Star-Trowa/StarBookOrbit) embeds the server's web interface. It could expose grouped works through that interface, but its documentation is not proof of a durable native offline download and reconciliation pipeline. Not runtime tested here.
- The checkout's “Android coming soon” badge is stale relative to the current [official Android support page](https://bookorbit.app/android/support/). Official availability/documentation does not prove compatibility of a particular installed binary with this fork.

Unchanged native clients still see four editions, retain the old download and progress contracts, and do not automatically gain a grouped works UI. No mobile catalog endpoint was changed to return work IDs masquerading as book IDs. Generic OPDS readers can download editions but OPDS download compatibility alone does not establish two-way progress sync or audiobook offline behavior.

Android audio source uses revision conflicts plus captured-time comparison. Reader source queues unversioned file-progress writes and lets a dirty local position win. The server ebook DTO has no capture time/base revision. This is a concrete conflict-handling gap and must be resolved before claiming safe multi-device offline ebook sync. Clock skew also remains an audio conflict-policy risk.

## Later integration and remaining work

Shelfmark should remain an explicit user action. A concrete first integration is a manual download destination into the prototype's existing Book Dock staging directory, followed by user-reviewed finalization into the selected library. Preserve download provenance and chosen edition language/narrator. Never point a download client at organized library paths or automatically merge its output into a work. The existing Book Dock upload/finalize service is the API boundary for a future adapter. [Shelfmark's own scope](https://github.com/calibrain/shelfmark/blob/main/readme.md) is manual search/download, not automatic library monitoring. No adapter or acquisition was implemented.

Practical planning ranges for one developer already comfortable with this stack, stated as engineering effort rather than delivery promises:

- Harden works, editing, import/merge/move/delete interactions, cleanup of empty work records, metadata ownership and work-aware series views: 2 to 4 person-weeks.
- Finish browser catalog integration, discovery/search, accessible edition labels, localization, bookmarks/back navigation and large-library query plans: 1 to 3 person-weeks.
- Adopt grouped browsing in an open Android client and validate download/restart/network-conflict matrices on real devices: 2 to 4 person-weeks.
- Fix ebook offline revisions/idempotency and choose explicit conflict UX across clients: 1 to 3 person-weeks, plus coordination with closed clients.
- iOS compatibility validation on physical hardware: 3 to 5 engineering days once the devices/builds are available. A grouped native UI cannot be estimated responsibly without source access; a new iOS client is a separate multi-month project.
- Scheduled encrypted backups, retention/alerts, path/secret recovery and guided restore with recurring restore drills: 1 to 2 person-weeks.
- Manual Shelfmark handoff with provenance and reviewed imports: 3 to 7 engineering days.
- Validate metadata/renaming, series reliability and household permissions at realistic library scale: 1 to 2 person-weeks.

These areas overlap and are not an additive fixed-price estimate. No full-library performance benchmark, metadata-provider runtime pass, production migration, mobile rewrite, or production backup deployment is claimed.

## Prototype limits

The prototype limits groups to 100 editions, pages to 50 works. The browser uses a work-key cursor so browsing is not capped at 10,000 works; the optional offset fallback is capped at 10,000. It uses two catalog queries rather than loading the whole library or issuing a query per displayed edition. A manual group checks visibility in a batch and locks book records in stable order. Query-plan/load testing at tens of thousands of books is still required. Concrete ebook formats are independently selectable using existing file IDs; only the first track for an audio format is linked, and the existing player assembles that edition's whole sequence.

The UI intentionally has only English/Swedish language choices and common format choices for this fixture. The API accepts existing stored language codes. Production needs normalized language facets, search and complete format facets. Work titles are entered manually. Automatic deduplication, metadata authority at work level, cover selection, localized UI, and cross-library works are not part of this slice. Empty work records are retained but excluded from the catalog. To move an edition to a different library, ungroup it first; the new foreign key rejects a grouped cross-library move. A user-visible preflight for that upstream workflow remains follow-up work.

The session began clean on branch `t3/grouped-edition-prototype` in the supplied isolated worktree. Resource-guard, package-script and AGENTS.md changes appeared concurrently during execution. They were left intact and are excluded from the prototype backup patch. No commit was created.

## Checks completed

- Eight real HTTP/PostgreSQL scenarios pass in `server/test/work-household.test.ts`: grouping/ungrouping, source-byte/path and progress preservation, combined language/format filtering including all audio formats, separate narration manifests and content delivery, independent users/editions, idempotent latest audio operation and stale revision rejection, hidden editions, editor/permission gates, cross-library denial and strict DTO validation.
- Five frontend contract tests pass in `useWorkCatalog.test.ts`: exact API paths, both filters, JSON request shape, library-specific permissions, chosen reader route and cursor navigation.
- Relevant upstream checks pass: audiobook service 12, book access nondisclosure 4, series ladder/gap behavior 13.
- Server TypeScript check passes. Targeted ESLint and Prettier checks cover modified/new application code. `git diff --check` passes.
- Follow-up push-hook verification: full server and frontend lint and type checking passed within the required 4 GiB guard after reducing checker memory retention. Server lint runs in batches; frontend application typing runs in full, and test typing uses batches that inherit the original configuration. All test files are checked, although global declarations in different test batches are not checked together. Initial full-process runs exhausted their Node heaps. Nine resource-guard tests and all five prototype frontend tests passed. Full builds and the complete monorepo test suite were not run.
- One repeated HTTP-suite run hit the development login throttle, HTTP 429, after repeated logins within a minute. A later complete run passed all eight scenarios. Run `bash scripts/household-poc/test.sh` against the fixture, allowing the normal login cooldown between repeated runs.
- Browser runtime verified a single work with four edition choices, a negative Swedish-audiobook filter, actual EPUB page rendering and Narrator B playback advancing from 20 seconds, with a two-minute multipart duration. Earlier startup 502 and login-throttle 429 entries were transient test setup errors; they are not described as a clean error-free session.

## Android runtime outcomes

Unchanged community APK v0.6.0 on Android 15 connected to the fork, logged in as the household reader, browsed four separate editions and downloaded the Swedish EPUB and the Narrator B edition. The server manifest contains its two MP3 tracks; offline playback was exercised on the first track, while the offline transition to track two was not separately tested. Airplane mode was enabled and Wi-Fi disabled. The home screen showed Retry after relaunch while cached downloads remained available.

The EPUB rendered offline and page turns worked. After another forced relaunch and reopening the cached edition, it showed the beginning again rather than the previously advanced page. Persisted ebook resume is a failed acceptance check for this fixture, not a runtime pass based on the source's Room implementation.

Narrator B played offline. Before forced restart the screenshot showed about 17 seconds; reopening the paused player offline showed about 15 seconds. Thus audiobook position survived restart with approximately two seconds of checkpoint loss. While offline the server stayed at its previous position.

A second API session for the same user then advanced Narrator B to 45 seconds, revision 4, captured at 2026-10-17T19:55:58.504Z. It also advanced the Swedish EPUB to 90%. On reconnect the server retained audiobook 45 seconds/revision 4, but ebook progress fell from 90% to the queued offline 12.5% with its older reading location. This is a runtime demonstration of the ebook conflict gap. The other user's positions and Narrator A's position remained independent.

This APK therefore does not satisfy the complete mobile requirement as tested. It is a useful open-source Android candidate if its ebook resume and conflict behavior are fixed. A web wrapper or an OPDS client should not be substituted without independently passing the same acceptance sequence.

A second offline listening interval, with no competing newer write afterward, reconnected successfully and saved 35.75 seconds at revision 5 for the household reader. This confirms ordinary queued audiobook progress upload as well as the earlier conflict rejection. Timestamp ordering, rather than greatest percentage, decides which intentional seek wins.

## Backup exercise result

Backup `local/household-poc/backups/20261017T195752Z` was created while the development API was stopped. All six artifact checksums verified. Restore created a new `bookorbit_poc_restore` database and extracted files to `local/household-poc/restore-20261017T195807Z`. All ten compared tables matched, including accounts/access, grouping, file identities, progress, ratings and reading history. Every restored application/sample-file byte matched its source. Backup directory permissions were 0700 and the dump 0600.

After equality checks, only the restored database's library paths were relocated to its extracted files. A separate API on 127.0.0.1:6273 successfully logged in all three fixture accounts, enforced outsider denial, returned one work/four editions, returned the saved EPUB 12.5% and audiobook 35.75-second positions, and served a restored multipart track. It used the extracted application-data directory and restored file paths, not the original book directory. This was an actual restore and runtime check, not only a dump listing.

The local evidence directory `local/household-poc/evidence` contains test logs, the guarded frontend failure, progress snapshots and Android screenshots. It is ignored by Git. A second archive, `local/household-poc/backups/20261017T200204Z`, captured the final implementation after cursor pagination was verified. The full restore exercise used the first archive; the second archive is a later snapshot, not a separately claimed restore pass.

Current local review endpoints are the browser at `http://localhost:5178/library/1/works` and the development API at `http://127.0.0.1:6272`. The temporary restored API on 6273 was stopped after verification; both databases and restore artifacts remain available. Re-run the launch scripts when these development processes are no longer running. Avoid starting duplicate instances on occupied ports.
