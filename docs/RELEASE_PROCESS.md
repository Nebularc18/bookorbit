# Release Process

This document covers how releases are created, what triggers Docker image publishing, and how to roll back if needed.

---

## Overview

BookOrbit uses [semantic-release](https://github.com/semantic-release/semantic-release) for automated versioning and GitHub Release creation. Releases are triggered manually via `workflow_dispatch` and produce:

- A Git tag (`nebularc-vX.Y.Z`)
- A GitHub Release with auto-generated release notes

Publishing the draft release then builds and scans the Docker image before publishing
it to GHCR as `X.Y.Z` and, for GitHub's latest release, `latest`.

---

## PR Requirements

### Squash merge required

All PRs to `main` must use **squash merge**. The squash commit message becomes the commit that semantic-release analyzes for version bumps.

### PR title, commit message, and issue link format

PR titles and all commits in a PR must follow the [commit guidelines](COMMIT_GUIDELINES.md):

```
<type>(<scope>): <summary>
```

Why PR title is required: with squash merges, the final commit analyzed by semantic-release is based on the PR title.

Validation runs once in the CI workflow:

- PR branch name must follow `BO-123-fix-reader-pagination`
- PR title must match commitlint rules
  - Example: `fix(reader): reduce rerendering in chapter list`
- PR commit headers must match commitlint rules
- PR description must include at least one GitHub closing-keyword issue reference:
  - `close`, `closes`, `closed`, `fix`, `fixes`, `fixed`, `resolve`, `resolves`, `resolved`
  - Examples: `Closes #123`, `Fixes: #123`, `RESOLVED owner/repo#123`
- Branch issue number must exist in this repository
- PR description issue references must resolve to valid GitHub issues (same repo or `owner/repo#issue`)

Examples:

- Valid:

```md
## What does this PR do?

Improve reader performance when opening large EPUB files.

Fixes #145
```

- Invalid (fails lint):

```md
## What does this PR do?

Improve reader performance when opening large EPUB files.

fixes issue 145
```

### Types that trigger releases

| Type       | Release | Notes                    |
| ---------- | ------- | ------------------------ |
| `feat`     | minor   | New features             |
| `fix`      | patch   | Bug fixes                |
| `perf`     | patch   | Performance improvements |
| `security` | patch   | Security patches         |
| `db`       | patch   | Database/schema changes  |
| `style`    | patch   | Visual/CSS changes       |
| `revert`   | none    | No release               |
| `refactor` | none    | No release               |
| `docs`     | none    | No release               |
| `test`     | none    | No release               |
| `build`    | none    | No release               |
| `ci`       | none    | No release               |
| `chore`    | none    | No release               |

Breaking changes (`BREAKING CHANGE:` in footer) always trigger a **major** release regardless of type.

---

## Manual Release Runbook

Releases are triggered manually from the GitHub Actions UI.

### Prerequisites

1. All changes are merged to `main`.
2. CI has passed for the latest commit on `main`.

### Steps

1. Go to **Actions** > **Release** workflow.
2. Click **Run workflow**.
3. Select `main` branch.
4. Click **Run workflow**.

The workflow will:

1. Verify the dispatch is from `main`.
2. Verify CI has passed for the current commit.
3. Run semantic-release to determine the next version.
4. Create a Git tag and GitHub Release with release notes.
5. Leave the release as a draft for review. Publishing it starts the image workflow.

### No release produced

If all commits since the last release are non-releasable types (`chore`, `docs`, `test`, `build`, `ci`, `refactor`), semantic-release will skip the release. No container build runs.

### Authoring the "What's New" highlights

semantic-release creates the GitHub release as a **draft** with a `## Highlights` scaffold (added by `release.config.js`) that lists this release's `feat` commits as candidate highlights. Open the draft, curate those candidates into user-facing highlight bullets (with optional icons and dragged-in media), validate with `cd server && pnpm whats-new:check <tag>`, then click **Publish release**. The highlights power the in-app "What's New" popup and the `/whats-new` archive; the draft stays hidden in the app until you publish and publishing starts the container build.

Full step-by-step walkthrough, format reference, and pre-publish checklist: [docs/whats-new-authoring-guide.md](whats-new-authoring-guide.md).

---

## Docker Image Publishing

### Release images

The `container-image.yml` workflow runs when a stable `nebularc-vX.Y.Z` release is
published. It verifies that the tagged commit is on `main` and has successful CI,
then builds native amd64 and arm64 images. Each image must pass Trivy before the
versioned multi-architecture manifest is published.

- `ghcr.io/nebularc18/bookorbit:<X.Y.Z>` is the version-specific tag.
- `ghcr.io/nebularc18/bookorbit:latest` follows GitHub's latest stable release.

Pushes to `main`, PRs, and draft releases do not build container images.
To retry a published release, manually run Container Image with its `release_tag`.
The workflow always builds the tagged commit. An older release retry does not
replace `latest`.

---

## Rollback

### Rolling back to a previous release

To deploy a previous version:

```bash
# In your production docker-compose.yml or .env, set:
APP_IMAGE=ghcr.io/nebularc18/bookorbit:X.Y.Z
```

Replace `X.Y.Z` with the version you want to roll back to, then redeploy:

```bash
pnpm prod:down
pnpm prod:up
```

### Deleting a bad release tag

If a release was created in error and needs to be removed:

```bash
# Delete tag locally and remotely
git tag -d nebularc-vX.Y.Z
git push origin :refs/tags/nebularc-vX.Y.Z
```

Then delete the corresponding GitHub Release from the Releases page.

---

## Release Workflow Architecture

PR conventions run only in `ci.yml`. Lint, formatting, type checks, and tests feed one final **CI Gate**. Nightly CI also includes the E2E suites. Test reports remain available as workflow artifacts without creating separate unit test checks.

The `release.yml` workflow has two jobs:

- **release-dry-run**: Validates semantic-release on PRs that change release configuration, commitlint configuration, root dependencies, the shared setup action, or the release workflow.
- **release**: Creates the actual release on manual dispatch. Outputs `published`, `version`, and `tag`.

The separate `container-image.yml` workflow builds and scans images only after
release publication, or an explicit retry for a published tag.

### Concurrency

- PR checks cancel older runs for the same PR.
- Manual release runs are serialized and never canceled mid-flight.
- PR checks and manual releases do not block each other.

---

## Configuration Files

| File                            | Purpose                                          |
| ------------------------------- | ------------------------------------------------ |
| `release.config.js`             | semantic-release config (plugins, release rules) |
| `commitlint.config.cjs`         | commitlint config (type/scope validation)        |
| `.github/workflows/release.yml` | Draft release workflow                           |
