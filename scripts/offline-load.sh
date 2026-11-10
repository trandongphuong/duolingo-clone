#!/usr/bin/env bash
# Does not contact a registry. The archive must come from a trusted build host.
set -euo pipefail
if [[ $# != 1 ]]; then
  echo "Usage: $0 /path/to/han-ngu-bien-images.tar" >&2
  exit 2
fi
archive_path=$1
archive_dir=$(dirname -- "$archive_path")
archive_name=$(basename -- "$archive_path")
if [[ ! -f "$archive_path" || ! -f "$archive_path.sha256" || ! -f "$archive_path.images" ]]; then
  echo 'The image archive, its .images manifest and .sha256 file are required.' >&2
  exit 1
fi
(cd -- "$archive_dir" && sha256sum --check -- "$archive_name.sha256")
# Validate manifest structure before Docker can change any local image tags.
declare -A seen_images=()
entry_count=0
while read -r expected_id image_ref extra; do
  if [[ ! "$expected_id" =~ ^sha256:[a-f0-9]{64}$ || ! "$image_ref" =~ ^[a-zA-Z0-9][a-zA-Z0-9_./:@-]*$ || -n "$extra" ]]; then
    echo 'Invalid image manifest entry.' >&2
    exit 1
  fi
  if [[ -n "${seen_images[$image_ref]:-}" ]]; then
    echo 'Duplicate image reference in manifest.' >&2
    exit 1
  fi
  seen_images[$image_ref]=$expected_id
  entry_count=$((entry_count + 1))
done < "$archive_path.images"
if [[ "$entry_count" != 4 ]]; then
  echo 'Expected app, tools, PostgreSQL and nginx image manifest entries.' >&2
  exit 1
fi
docker load -i "$archive_path"
for image_ref in "${!seen_images[@]}"; do
  expected_id=${seen_images[$image_ref]}
  actual_id=$(docker image inspect --format '{{.Id}}' "$image_ref")
  if [[ "$actual_id" != "$expected_id" ]]; then
    echo "Image content mismatch: $image_ref" >&2
    exit 1
  fi
done
echo 'Images loaded. Use docker compose up --no-build --pull never; do not run a build on the airgapped host.'
