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
# Checksum verification alone accepts a manifest that silently omits the dump
# or media. Validate the exact filename allowlist before sha256sum reads paths.
checksum_database_seen=false
checksum_media_seen=false
checksum_count=0
while IFS= read -r checksum_line || [[ -n "$checksum_line" ]]; do
  if [[ ! "${checksum_line:0:64}" =~ ^[a-fA-F0-9]{64}$ ||
        ( "${checksum_line:64:2}" != '  ' && "${checksum_line:64:2}" != ' *' ) ]]; then
    echo 'Invalid backup checksum manifest format.' >&2
    exit 1
  fi
  checksum_name=${checksum_line:66}
  if [[ "$checksum_name" == database.dump && "$checksum_database_seen" == false ]]; then
    checksum_database_seen=true
  elif [[ "$checksum_name" == media.tar.gz && "$checksum_media_seen" == false ]]; then
    checksum_media_seen=true
  else
    echo 'Backup checksums must name only database.dump and media.tar.gz, once each.' >&2
    exit 1
  fi
  checksum_count=$((checksum_count + 1))
done < "$backup_dir/SHA256SUMS"
if [[ "$checksum_count" != 2 || "$checksum_database_seen" != true || "$checksum_media_seen" != true ]]; then
  echo 'Both database and media checksums are required exactly once.' >&2
  exit 1
fi
(cd -- "$backup_dir" && sha256sum --check SHA256SUMS)
if [[ -n "$(docker compose ps --status running --services app)" ]]; then
  echo 'Stop the app first with docker compose stop app, then rerun restore.' >&2
  exit 1
fi
# Validate the whole tar before mutating either DB or media. Only regular
# files/directories from our own backup script are accepted; links can escape.
archive_listing=$(mktemp)
restore_stage=''
database_attempted=false
restore_complete=false
cleanup_restore() {
  local status=$?
  trap - EXIT INT TERM
  rm -f -- "$archive_listing"
  if [[ -n "$restore_stage" ]]; then
    if [[ "$restore_complete" == true || "$database_attempted" == false ]]; then
      if ! docker compose run --rm --no-deps -T tools sh -ceu '
        stage=$1
        test "$(cat /data/media/.hnb-restore.lock/stage)" = "$stage"
        rm -rf -- "$stage"
        rm -- /data/media/.hnb-restore.lock/stage
        rmdir -- /data/media/.hnb-restore.lock
      ' sh "$restore_stage"; then
        echo "Restore staging cleanup failed; preserve and inspect $restore_stage and its lock before retrying." >&2
        status=1
      fi
    else
      echo 'Restore did not finish after a database restore was attempted. The database may already contain the backup.' >&2
      echo "The app remains stopped. Media recovery files and the restore lock are preserved at $restore_stage." >&2
      echo 'Verify database/media consistency and recover using the preserved files or a complete prior backup before starting the app.' >&2
    fi
  fi
  exit "$status"
}
trap cleanup_restore EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
tar -tzf "$backup_dir/media.tar.gz" > "$archive_listing"
if LC_ALL=C awk '/(^\/|(^|\/)\.\.(\/|$))/ { bad=1 } END { exit !bad }' "$archive_listing"; then
  echo 'Unsafe media archive path detected.' >&2
  exit 1
fi
if LC_ALL=C awk '/(^|\/)\.hnb-restore\./ { bad=1 } END { exit !bad }' "$archive_listing"; then
  echo 'Media archive contains reserved restore-staging paths.' >&2
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
# Extract all media before attempting the database restore. An invalid payload,
# read-only volume or insufficient disk space must not replace live DB/media.
# Keep staging and old media on the same volume so moves never cross filesystems.
restore_stage=$(docker compose run --rm --no-deps -T tools sh -ceu '
  lock=/data/media/.hnb-restore.lock
  if ! mkdir "$lock"; then
    echo "Another restore or a preserved recovery lock exists; inspect it before retrying." >&2
    exit 1
  fi
  stage=
  cleanup_prepare() {
    test -z "$stage" || rm -rf -- "$stage"
    rm -f -- "$lock/stage"
    rmdir -- "$lock"
  }
  trap cleanup_prepare EXIT
  if test -n "$(find /data/media -mindepth 1 -maxdepth 1 -name ".hnb-restore.*" ! -name ".hnb-restore.lock" -print -quit)"; then
    echo "Preserved restore data exists; inspect it before starting another restore." >&2
    exit 1
  fi
  stage=$(mktemp -d /data/media/.hnb-restore.XXXXXXXXXX)
  printf "%s\n" "$stage" > "$lock/stage"
  mkdir "$stage/incoming" "$stage/previous"
  printf "%s\n" "$stage"
  trap - EXIT
')
if [[ ! "$restore_stage" =~ ^/data/media/\.hnb-restore\.[A-Za-z0-9]{10}$ ]]; then
  echo 'Unexpected restore staging path; refuse to modify database or live media.' >&2
  exit 1
fi
docker compose run --rm --no-deps -T tools sh -ceu '
  tar --no-same-owner --no-same-permissions -C "$1/incoming" -xzf -
' sh "$restore_stage" < "$backup_dir/media.tar.gz"

# Validate the custom-format dump header before attempting database mutation.
docker compose exec -T db sh -c 'exec pg_restore --list' < "$backup_dir/database.dump" > /dev/null
database_attempted=true
docker compose exec -T db sh -c 'exec pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl --exit-on-error --single-transaction' < "$backup_dir/database.dump"
docker compose run --rm --no-deps -T tools node - "$restore_stage" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const root = '/data/media';
const stage = process.argv[2];
if (path.dirname(stage) !== root || !/^\.hnb-restore\.[A-Za-z0-9]{10}$/.test(path.basename(stage))) {
  throw new Error('Unexpected restore staging path.');
}
if (fs.realpathSync(stage) !== stage || fs.readFileSync(path.join(root, '.hnb-restore.lock/stage'), 'utf8').trim() !== stage) {
  throw new Error('Restore staging/lock ownership mismatch.');
}
const incoming = path.join(stage, 'incoming');
const previous = path.join(stage, 'previous');
const oldNames = fs.readdirSync(root).filter(name => name !== path.basename(stage) && name !== '.hnb-restore.lock');
const newNames = fs.readdirSync(incoming);
function present(file) {
  try { fs.lstatSync(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
if (oldNames.some(name => name.startsWith('.hnb-restore.')) || newNames.some(name => name.startsWith('.hnb-restore.'))) {
  throw new Error('Reserved restore paths require inspection.');
}
let phase = 'moving_old';
function journal() {
  const temporary = path.join(stage, 'state.tmp');
  fs.writeFileSync(temporary, JSON.stringify({ phase, oldNames, newNames }) + '\n', { mode: 0o600 });
  fs.renameSync(temporary, path.join(stage, 'state.json'));
}
try {
  journal();
  for (const name of oldNames) fs.renameSync(path.join(root, name), path.join(previous, name));
  phase = 'moving_new';
  journal();
  for (const name of newNames) fs.renameSync(path.join(incoming, name), path.join(root, name));
  phase = 'complete';
  journal();
} catch {
  try {
    // No new files have moved while phase=moving_old. During moving_new,
    // restore their original staging locations before returning old live files.
    if (phase !== 'moving_old') {
      for (const name of newNames) {
        const live = path.join(root, name);
        const staged = path.join(incoming, name);
        if (present(live) && !present(staged)) fs.renameSync(live, staged);
      }
    }
    for (const name of oldNames) {
      const saved = path.join(previous, name);
      const live = path.join(root, name);
      if (present(saved)) {
        if (present(live)) throw new Error('Live recovery conflict.');
        fs.renameSync(saved, live);
      }
    }
    phase = 'rolled_back';
    journal();
    console.error('Media swap failed; prior live media was restored. Database restore may already be committed.');
  } catch {
    console.error('Media swap/recovery failed; preserve staging and previous files for manual recovery.');
  }
  process.exitCode = 1;
}
NODE
restore_complete=true
echo 'Restore completed. Verify counts, login, learner progress, and media before starting app.'
echo 'Start only after verification: docker compose up -d --no-build --pull never app'
