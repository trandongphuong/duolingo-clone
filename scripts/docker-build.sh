#!/usr/bin/env bash
# Online build host only. All runtime images will be exported for airgap install.
set -euo pipefail
app_image=${HANNGU_IMAGE:-han-ngu-bien:1.0}
tools_image=${HANNGU_TOOLS_IMAGE:-han-ngu-bien-tools:1.0}
source_revision=$(git rev-parse --verify HEAD)
release_version=${RELEASE_VERSION:-$(node -p 'require("./package.json").version')}
if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  echo 'Commit or isolate source changes before building release images.' >&2
  exit 1
fi
build_args=()
if [[ -n "${CODEX_PROXY_CERT:-}" ]]; then
  build_args+=(--secret "id=proxy_ca,src=$CODEX_PROXY_CERT")
fi
scripts/docker-pull-bases.sh
docker build "${build_args[@]}" --target tools \
  --label "org.opencontainers.image.revision=$source_revision" \
  --label "org.opencontainers.image.version=$release_version" \
  --label 'vn.hanngubien.build-method=source-docker' \
  -t "$tools_image" .
scripts/docker-runtime-alias.sh "$tools_image" "$app_image" app
echo 'Built pinned-base app/tools and loaded pinned PostgreSQL/nginx. Export with scripts/offline-export.sh.'
