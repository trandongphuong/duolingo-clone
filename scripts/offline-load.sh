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
# sha256sum accepts manifests that omit our archive or hash unrelated paths.
# Require exactly the two expected local files before it can read any filename.
checksum_archive_seen=false
checksum_images_seen=false
checksum_count=0
while IFS= read -r checksum_line || [[ -n "$checksum_line" ]]; do
  if [[ ! "${checksum_line:0:64}" =~ ^[a-fA-F0-9]{64}$ ||
        ( "${checksum_line:64:2}" != '  ' && "${checksum_line:64:2}" != ' *' ) ]]; then
    echo 'Invalid image checksum manifest format.' >&2
    exit 1
  fi
  checksum_name=${checksum_line:66}
  if [[ "$checksum_name" == "$archive_name" && "$checksum_archive_seen" == false ]]; then
    checksum_archive_seen=true
  elif [[ "$checksum_name" == "$archive_name.images" && "$checksum_images_seen" == false ]]; then
    checksum_images_seen=true
  else
    echo 'Image checksums must name only the archive and its .images manifest, once each.' >&2
    exit 1
  fi
  checksum_count=$((checksum_count + 1))
done < "$archive_path.sha256"
if [[ "$checksum_count" != 2 || "$checksum_archive_seen" != true || "$checksum_images_seen" != true ]]; then
  echo 'Both image archive and .images checksums are required exactly once.' >&2
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
