# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# A read-only source mount and one build RUN avoid retaining a complete copy of
# node_modules in every layer on vfs hosts. Only the final allowlisted artifact
# remains in this stage; source, package cache and build secrets are discarded.
RUN --mount=type=bind,source=.,target=/source,readonly \
    --mount=type=secret,id=proxy_ca \
    set -eu; \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    export COREPACK_HOME=/tmp/hnb-corepack XDG_DATA_HOME=/tmp/hnb-data XDG_CACHE_HOME=/tmp/hnb-cache NODE_USE_ENV_PROXY=1; \
    cp -a /source/. /app/; \
    corepack enable; \
    corepack prepare pnpm@11.11.0 --activate; \
    pnpm install --frozen-lockfile --package-import-method=hardlink; \
    pnpm build; \
    node docs/docker/prepare-runtime.cjs work/docker-runtime; \
    mv work/docker-runtime /runtime; \
    rm -rf /app /tmp/hnb-corepack /tmp/hnb-data /tmp/hnb-cache; \
    mkdir /app

# App and tools share compact layers. Maintenance scripts are bundled, so runtime
# contains neither the full development dependency tree nor a package install step.
FROM ${NODE_IMAGE} AS runtime
COPY --link --from=builder --chown=1000:1000 /runtime/ /
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 MEDIA_DIR=/data/media
USER node
EXPOSE 3000
FROM runtime AS tools
CMD ["npm", "run", "db:migrate"]
FROM runtime AS app
CMD ["node", "server.js"]
