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
backup_parent=$(dirname -- "$backup_dir")
backup_name=$(basename -- "$backup_dir")
mkdir -p -- "$backup_parent"
backup_temporary=$(mktemp -d -- "$backup_parent/.${backup_name}.partial.XXXXXXXXXX")
backup_lock_token="backup:$$-$RANDOM-$RANDOM"
lock_acquired=false
snapshot_verified=false
app_was_running=''
finish_backup() {
  local status=$?
  trap - EXIT INT TERM
  # Hold the shared maintenance lock through app restart: a concurrent restore
  # must not observe the temporarily stopped app and replace this snapshot.
  if docker compose run --rm --no-deps -T tools sh -ceu '
    test -f /data/media/.hnb-restore.lock/owner
    test "$(cat /data/media/.hnb-restore.lock/owner)" = "$1"
  ' sh "$backup_lock_token"; then
    if [[ "$app_was_running" == app ]]; then
      if ! docker compose start app >/dev/null; then
        echo 'Backup snapshot finished, but restarting the app failed; inspect its status.' >&2
        status=1
      fi
    fi
    if ! docker compose run --rm --no-deps -T tools sh -ceu '
      test "$(cat /data/media/.hnb-restore.lock/owner)" = "$1"
      rm -- /data/media/.hnb-restore.lock/owner
      rmdir -- /data/media/.hnb-restore.lock
    ' sh "$backup_lock_token"; then
      echo 'Could not release this backup maintenance lock; inspect it before another operation.' >&2
      status=1
    fi
  elif [[ "$lock_acquired" == true ]]; then
    echo 'Backup lock could not be verified; app was not restarted automatically. Inspect maintenance state.' >&2
    status=1
  fi
  if [[ "$status" == 0 && "$snapshot_verified" == true ]]; then
    # No-clobber directory rename publishes only a complete verified snapshot.
    if mv -T -n -- "$backup_temporary" "$backup_dir" && [[ ! -e "$backup_temporary" ]]; then
      echo "Backup complete: $backup_dir. Protect it as learner/account data."
    else
      echo "Backup destination changed; verified snapshot is preserved at $backup_temporary." >&2
      status=1
    fi
  elif [[ "$snapshot_verified" == true ]]; then
    echo "Verified backup files are preserved at $backup_temporary; no final backup directory was published." >&2
  else
    rm -rf -- "$backup_temporary"
  fi
  exit "$status"
}
trap finish_backup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
docker compose run --rm --no-deps -T tools sh -ceu '
  lock=/data/media/.hnb-restore.lock
  if ! mkdir "$lock"; then
    echo "Another backup/restore or preserved recovery lock exists; inspect it before retrying." >&2
    exit 1
  fi
  cleanup_lock() { rm -f -- "$lock/owner"; rmdir -- "$lock"; }
  trap cleanup_lock EXIT
  if test -n "$(find /data/media -mindepth 1 -maxdepth 1 -name ".hnb-restore.*" ! -name ".hnb-restore.lock" -print -quit)"; then
    echo "Preserved restore data exists; inspect it before backup." >&2
    exit 1
  fi
  printf "%s\n" "$1" > "$lock/owner"
  trap - EXIT
' sh "$backup_lock_token"
lock_acquired=true
app_was_running=$(docker compose ps --status running --services app)
if [[ "$app_was_running" == app ]]; then docker compose stop app; fi
docker compose exec -T db sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' > "$backup_temporary/database.dump"
docker compose run --rm --no-deps -T tools tar --exclude='./.hnb-restore.lock' -C /data/media -czf - . > "$backup_temporary/media.tar.gz"
if ! tar -tvzf "$backup_temporary/media.tar.gz" | LC_ALL=C awk 'substr($0,1,1) !~ /^[d-]$/ { bad=1 } END { exit bad }'; then
  echo 'Backup media contains unsupported links/special files; no final backup directory will be published.' >&2
  exit 1
fi
(cd -- "$backup_temporary" && sha256sum database.dump media.tar.gz > SHA256SUMS)
date -u +'%Y-%m-%dT%H:%M:%SZ' > "$backup_temporary/created-at.txt"
snapshot_verified=true
