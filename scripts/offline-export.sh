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
app_image=${HANNGU_IMAGE:-han-ngu-bien:1.0}
tools_image=${HANNGU_TOOLS_IMAGE:-han-ngu-bien-tools:1.0}
postgres_image=${POSTGRES_IMAGE:-postgres:17-alpine}
nginx_image=${NGINX_IMAGE:-nginx:1.28-alpine}
for image_name in "$app_image" "$tools_image" "$postgres_image" "$nginx_image"; do
  image_id=$(docker image inspect "$image_name" --format '{{.Id}}')
  printf '%s %s\n' "$image_id" "$image_name" >> "$archive_path.images"
done
case "$archive_path" in
  *.gz|*.tgz) docker save "$app_image" "$tools_image" "$postgres_image" "$nginx_image" | gzip -1 > "$archive_path" ;;
  *) docker save -o "$archive_path" "$app_image" "$tools_image" "$postgres_image" "$nginx_image" ;;
esac
(cd -- "$archive_dir" && sha256sum -- "$archive_name" "$archive_name.images" > "$archive_name.sha256")
echo "Saved images and SHA-256 to $archive_path and $archive_path.sha256"
echo 'Transfer all three archive files with compose.yaml, the private env file, and operational scripts.'
