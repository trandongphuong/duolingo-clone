#!/usr/bin/env bash
# Online build host only. Package an already-tested build without reinstalling
# dependencies inside Docker; useful for restricted vfs build hosts.
set -euo pipefail
if [[ ! -f .next/BUILD_ID || ! -f .next/standalone/server.js ]]; then
  echo 'A successful production build is required: pnpm install --frozen-lockfile && pnpm build.' >&2
  exit 1
fi
app_image=${HANNGU_IMAGE:-han-ngu-bien:1.0}
tools_image=${HANNGU_TOOLS_IMAGE:-han-ngu-bien-tools:1.0}
scripts/docker-pull-bases.sh
node docs/docker/prepare-runtime.cjs work/docker-runtime
docker build --file docs/docker/Dockerfile.runtime --target app -t "$app_image" work/docker-runtime
scripts/docker-runtime-alias.sh "$app_image" "$tools_image" tools
echo 'Packaged tested standalone build and bundled maintenance CLI; no development data was copied.'
