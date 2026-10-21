# Bundled kepubify

These six binaries use Go 1.27.3 to include the fix for CVE-2026-111943.
Source: `pgaskin/kepubify` commit `9546034bc023891af5ce30709de6ae2dcf264628`.
Keep the default reported version `v4-dev` because it participates in cached
rendition identities. Compare decompressed conversion output when rebuilding.

From a checkout of that source revision, using Go 1.27.3:

```bash
go get golang.org/x/text@v0.43.0 golang.org/x/sync@v0.24.0
export CGO_ENABLED=0
for target in linux:amd64:64bit linux:386:32bit linux:arm:arm linux:arm64:arm64 darwin:amd64:64bit darwin:arm64:arm64; do
  IFS=: read -r platform arch suffix <<< "$target"
  GOOS="$platform" GOARCH="$arch" GOARM=7 go build -trimpath -ldflags="-s -w" \
    -o "kepubify-$platform-$suffix" ./cmd/kepubify
done
```

On T3Code, run the rebuild through `scripts/dev/with-resource-limits.mjs`.
Preserve executable permissions. Check every binary with `go version -m`,
then scan all six binaries and the runtime image with Trivy. The runtime image
includes every bundled platform, so updating only the host binary is insufficient.
