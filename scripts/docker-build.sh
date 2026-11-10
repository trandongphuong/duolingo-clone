#!/usr/bin/env bash
# Online build host only. All runtime images will be exported for airgap install.
set -euo pipefail
app_image=${HANNGU_IMAGE:-han-ngu-bien:1.0}
tools_image=${HANNGU_TOOLS_IMAGE:-han-ngu-bien-tools:1.0}
build_args=()
if [[ -n "${CODEX_PROXY_CERT:-}" ]]; then
  build_args+=(--secret "id=proxy_ca,src=$CODEX_PROXY_CERT")
fi
scripts/docker-pull-bases.sh
docker build "${build_args[@]}" --target tools -t "$tools_image" .
scripts/docker-runtime-alias.sh "$tools_image" "$app_image" app
echo 'Built pinned-base app/tools and loaded pinned PostgreSQL/nginx. Export with scripts/offline-export.sh.'
