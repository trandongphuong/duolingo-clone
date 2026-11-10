#!/usr/bin/env bash
# Intentionally replaces the selected database/media. Use a disposable test target
# first. Production restore requires approval and its own fresh backup.
set -euo pipefail
umask 077
if [[ $# != 2 || "$2" != --confirm-replace ]]; then
  echo "Usage: $0 /protected/path/backup-directory --confirm-replace" >&2
  echo 'WARNING: replaces the current compose project database and media.' >&2
  exit 2
fi
backup_dir=$1
for backup_file in database.dump media.tar.gz SHA256SUMS; do
  if [[ ! -f "$backup_dir/$backup_file" ]]; then
    echo "Missing backup file: $backup_file" >&2
    exit 1
  fi
done
(cd -- "$backup_dir" && sha256sum --check SHA256SUMS)
if [[ -n "$(docker compose ps --status running --services app)" ]]; then
  echo 'Stop the app first with docker compose stop app, then rerun restore.' >&2
  exit 1
fi
# Validate the whole tar before mutating either DB or media. Only regular
# files/directories from our own backup script are accepted; links can escape.
archive_listing=$(mktemp)
trap 'rm -f -- "$archive_listing"' EXIT
tar -tzf "$backup_dir/media.tar.gz" > "$archive_listing"
if LC_ALL=C awk '/(^\/|(^|\/)\.\.(\/|$))/ { bad=1 } END { exit !bad }' "$archive_listing"; then
  echo 'Unsafe media archive path detected.' >&2
  exit 1
fi
tar -tvzf "$backup_dir/media.tar.gz" > "$archive_listing"
if LC_ALL=C awk 'substr($0,1,1) !~ /^[d-]$/ { bad=1 } END { exit !bad }' "$archive_listing"; then
  echo 'Media archive must contain only files/directories, not links or special files.' >&2
  exit 1
fi
# compose up -d returns before a fresh PostgreSQL cluster finishes initdb.
db_ready=false
for attempt in {1..30}; do
  if docker compose exec -T db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
    db_ready=true
    break
  fi
  sleep 1
done
if [[ "$db_ready" != true ]]; then
  echo 'Database was not ready after 30 seconds; no restore mutations were attempted.' >&2
  exit 1
fi
docker compose exec -T db sh -c 'exec pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl --exit-on-error --single-transaction' < "$backup_dir/database.dump"
docker compose run --rm --no-deps -T tools sh -c 'find /data/media -mindepth 1 -maxdepth 1 -exec rm -rf -- {} \;'
docker compose run --rm --no-deps -T tools tar --no-same-owner --no-same-permissions -C /data/media -xzf - < "$backup_dir/media.tar.gz"
echo 'Restore completed. Verify counts, login, learner progress, and media before starting app.'
echo 'Start only after verification: docker compose up -d --no-build --pull never app'
