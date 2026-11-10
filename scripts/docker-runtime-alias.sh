#!/usr/bin/env bash
# Metadata-only derivative; preserves all proven runtime filesystem layers.
set -euo pipefail
if [[ $# != 3 || ( "$3" != app && "$3" != tools ) ]]; then
  echo "Usage: $0 source-image target-image app|tools" >&2
  exit 2
fi
source_image=$1
target_image=$2
if [[ "$3" == app ]]; then
  startup='CMD ["node", "server.js"]'
else
  startup='CMD ["npm", "run", "db:migrate"]'
fi
printf 'ARG RUNTIME_IMAGE=han-ngu-bien:1.0\nFROM ${RUNTIME_IMAGE}\n%s\n' "$startup" |
  docker build --build-arg "RUNTIME_IMAGE=$source_image" -t "$target_image" -
