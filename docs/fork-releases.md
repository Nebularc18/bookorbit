# Fork releases

This fork publishes from `Nebularc18/bookorbit` using an independent version series.
Upstream `v*` tags remain unchanged and can be fetched normally.

- Git tags: `nebularc-v1.0.0`, `nebularc-v1.0.1`, `nebularc-v1.1.0`.
- Container images: `ghcr.io/nebularc18/bookorbit:1.0.0` and `:latest`.
- The running app reports the full Git tag, such as `nebularc-v1.0.0`.

Semantic-release starts at `1.0.0` when no fork tag exists in the release branch's
history. Subsequent versions follow Conventional Commits: fixes increment the
patch, features increment the minor, and breaking changes increment the major.
Only tags matching `nebularc-v${version}` count toward the fork's release history.

To release:

1. Merge the changes to `main` and wait for CI to succeed.
2. Run the Release workflow manually against `main`.
3. Review the draft GitHub release and write its Highlights section, following
   [the authoring guide](whats-new-authoring-guide.md). Include the upstream base
   in the release notes, for example, "Based on BookOrbit v3.5.0, plus fork changes."
4. Publish the draft release when its notes are ready. This starts Container Image.
5. Wait for both architecture builds and their Trivy scans to pass. The workflow
   then publishes the versioned multi-architecture image and updates `latest` if
   this is GitHub's latest release. Manifest publication is serialized across
   releases to prevent concurrent updates from replacing `latest` out of order.

The Release workflow creates a Git tag and draft release without building an image.
You can also create and publish a stable `nebularc-vX.Y.Z` release directly in GitHub
for a commit on `main` with successful CI. Only publishing a release starts an
automatic container build. Pushes to `main`, pull requests, and draft releases do
not build containers. To retry an existing published release, run Container Image
manually with its `release_tag`. This builds the tagged commit, not the current
branch. A release must include the workflow and dependency fixes to use them;
create a new version rather than moving an existing published tag.

The first generated changelog can include inherited upstream
commits because there is no earlier fork release. Review it before publication.
Do not move or reuse published tags.

Update checks and What's New default to this fork. `GITHUB_RELEASES_REPO` can
override the release repository for testing. Fork versions are treated as newer
than legacy upstream versions so an existing installation can move from `v3.5.0`
to `nebularc-v1.0.0` without losing update notifications.
