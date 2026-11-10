#!/usr/bin/env bash
# Build host only. Reuse cached immutable sources; never pull at runtime.
set -euo pipefail
postgres_image=${POSTGRES_IMAGE:-postgres:17-alpine}
nginx_image=${NGINX_IMAGE:-nginx:1.28-alpine}
postgres_source=postgres:17-alpine@sha256:3540c0362c809df084ffac0ae69fe794515f9de92692f02178bcdce0ef0302ac
nginx_source=nginx:1.28-alpine@sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236
for source in "$postgres_source" "$nginx_source"; do
  if ! docker image inspect "$source" >/dev/null 2>&1; then docker pull "$source"; fi
done
docker tag "$postgres_source" "$postgres_image"
docker tag "$nginx_source" "$nginx_image"
