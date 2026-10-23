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

1. Merge the changes to `main` and wait for CI and Container Image to succeed.
2. Run the Release workflow manually against `main`.
3. Review the draft GitHub release and write its Highlights section, following
   [the authoring guide](whats-new-authoring-guide.md). Include the upstream base
   in the release notes, for example, "Based on BookOrbit v3.5.0, plus fork changes."
4. Publish the draft release when its notes and container build are ready.

The workflow creates the Git tag and publishes container images before the draft
release is published. The first generated changelog can include inherited upstream
commits because there is no earlier fork release. Review it before publication.
Do not move or reuse published tags.

Update checks and What's New default to this fork. `GITHUB_RELEASES_REPO` can
override the release repository for testing. Fork versions are treated as newer
than legacy upstream versions so an existing installation can move from `v3.5.0`
to `nebularc-v1.0.0` without losing update notifications.
