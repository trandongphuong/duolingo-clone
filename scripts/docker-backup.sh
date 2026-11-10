#!/usr/bin/env bash
# Consistent backup: explicitly opt into stopping app writes during the snapshot.
set -euo pipefail
umask 077
if [[ $# != 2 || "$2" != --stop-app ]]; then
  echo "Usage: $0 /protected/path/new-backup-directory --stop-app" >&2
  echo 'This stops the app during DB + media backup, then starts it again.' >&2
  exit 2
fi
backup_dir=$1
if [[ -e "$backup_dir" ]]; then
  echo 'Choose a new backup directory; existing data will not be overwritten.' >&2
  exit 1
fi
mkdir -p -- "$backup_dir"
app_was_running=$(docker compose ps --status running --services app)
restart_app() {
  if [[ "$app_was_running" == app ]]; then docker compose start app >/dev/null; fi
}
trap restart_app EXIT
if [[ "$app_was_running" == app ]]; then docker compose stop app; fi
docker compose exec -T db sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' > "$backup_dir/database.dump"
docker compose run --rm --no-deps -T tools tar -C /data/media -czf - . > "$backup_dir/media.tar.gz"
(cd -- "$backup_dir" && sha256sum database.dump media.tar.gz > SHA256SUMS)
date -u +'%Y-%m-%dT%H:%M:%SZ' > "$backup_dir/created-at.txt"
echo "Backup complete: $backup_dir. Protect it as learner/account data."
