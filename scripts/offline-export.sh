#!/usr/bin/env bash
# Run on the approved online build host after building both app and tools images.
set -euo pipefail
umask 077
if [[ $# != 1 ]]; then
  echo "Usage: $0 /path/to/han-ngu-bien-images.tar" >&2
  exit 2
fi
archive_path=$1
archive_dir=$(dirname -- "$archive_path")
archive_name=$(basename -- "$archive_path")
if [[ -e "$archive_path" || -e "$archive_path.sha256" || -e "$archive_path.images" ]]; then
  echo 'Refusing to overwrite an existing archive or checksum.' >&2
  exit 1
fi
mkdir -p -- "$archive_dir"
temporary_dir=$(mktemp -d -- "$archive_dir/.hnb-export.XXXXXXXXXX")
cleanup_export() {
  local status=$?
  trap - EXIT INT TERM
  # Remove only our own published hard links on ordinary failure/interruption.
  # The checksum is published last, so incomplete sets cannot be loaded.
  if [[ "$status" != 0 ]]; then
    for suffix in '' .images .sha256; do
      if [[ -f "$temporary_dir/$archive_name$suffix" && "$temporary_dir/$archive_name$suffix" -ef "$archive_path$suffix" ]]; then
        rm -f -- "$archive_path$suffix"
      fi
    done
  fi
  rm -rf -- "$temporary_dir"
  exit "$status"
}
trap cleanup_export EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
app_image=${HANNGU_IMAGE:-han-ngu-bien:1.0}
tools_image=${HANNGU_TOOLS_IMAGE:-han-ngu-bien-tools:1.0}
postgres_image=${POSTGRES_IMAGE:-postgres:17-alpine}
nginx_image=${NGINX_IMAGE:-nginx:1.28-alpine}
image_refs=()
for image_name in "$app_image" "$tools_image" "$postgres_image" "$nginx_image"; do
  if [[ ! "$image_name" =~ ^[a-zA-Z0-9][a-zA-Z0-9_./:@-]*$ ]]; then
    echo 'Invalid image reference; no export files were published.' >&2
    exit 1
  fi
  for previous_ref in "${image_refs[@]}"; do
    if [[ "$previous_ref" == "$image_name" ]]; then
      echo 'App, tools, PostgreSQL and nginx require distinct image references.' >&2
      exit 1
    fi
  done
  image_refs+=("$image_name")
  image_id=$(docker image inspect "$image_name" --format '{{.Id}}')
  if [[ ! "$image_id" =~ ^sha256:[a-f0-9]{64}$ ]]; then
    echo 'Docker returned an invalid image ID; no export files were published.' >&2
    exit 1
  fi
  printf '%s %s\n' "$image_id" "$image_name" >> "$temporary_dir/$archive_name.images"
done
case "$archive_path" in
  *.gz|*.tgz) docker save "$app_image" "$tools_image" "$postgres_image" "$nginx_image" | gzip -1 > "$temporary_dir/$archive_name" ;;
  *) docker save -o "$temporary_dir/$archive_name" "$app_image" "$tools_image" "$postgres_image" "$nginx_image" ;;
esac
(cd -- "$temporary_dir" && sha256sum -- "$archive_name" "$archive_name.images" > "$archive_name.sha256")
# Hard links provide same-filesystem, no-clobber publication. Existing files
# created by another export are never overwritten, even after our first check.
for suffix in '' .images .sha256; do
  ln -T -- "$temporary_dir/$archive_name$suffix" "$archive_path$suffix"
done
echo "Saved images and SHA-256 to $archive_path and $archive_path.sha256"
echo 'Transfer the three archive files with compose.yaml and scripts. Create private env settings separately on the LAN host.'
