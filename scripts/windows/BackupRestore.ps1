# Native PowerShell 5.1+ operations. Binary archive/dump data must use the
# Common.ps1 InputFile/OutputFile transport, never PowerShell text redirection.

$script:HnbMediaTarValidator = @'
const zlib = require('node:zlib');
let buffered = Buffer.alloc(0), remaining = 0, zeroBlocks = 0;
function field(block, start, length) {
  const bytes = block.subarray(start, start + length);
  const end = bytes.indexOf(0);
  return bytes.subarray(0, end < 0 ? bytes.length : end).toString('utf8');
}
function octal(value) {
  const text = value.replace(/\0.*$/, '').trim();
  if (!/^[0-7]+$/.test(text)) throw new Error('Invalid tar number.');
  const number = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('Invalid tar size.');
  return number;
}
async function main() {
  for await (const chunk of process.stdin.pipe(zlib.createGunzip())) {
    buffered = Buffer.concat([buffered, chunk]);
    while (buffered.length) {
      if (remaining) {
        const consumed = Math.min(remaining, buffered.length);
        remaining -= consumed; buffered = buffered.subarray(consumed);
        continue;
      }
      if (buffered.length < 512) break;
      const block = buffered.subarray(0, 512); buffered = buffered.subarray(512);
      if (block.every(byte => byte === 0)) { zeroBlocks++; continue; }
      if (zeroBlocks) throw new Error('Trailing nonzero tar data.');
      const checksum = octal(block.subarray(148, 156).toString('ascii'));
      let sum = 0;
      for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : block[i];
      if (sum !== checksum) throw new Error('Invalid tar checksum.');
      const type = block[156];
      if (type !== 0 && type !== 48 && type !== 53) throw new Error('Only regular files and directories are accepted.');
      const prefix = field(block, 345, 155);
      const rawName = field(block, 0, 100);
      if (rawName.startsWith('/') || prefix.startsWith('/')) throw new Error('Absolute tar path.');
      const name = (prefix ? prefix + '/' : '') + rawName;
      if (!name || name.startsWith('/') || name.includes('\\') || name.includes(':') || /[\x00-\x1f\x7f]/.test(name)) throw new Error('Unsafe tar path.');
      const parts = name.split('/').filter(part => part && part !== '.');
      if (parts.some(part => part === '..' || part.startsWith('.hnb-restore.'))) throw new Error('Reserved or traversing tar path.');
      const size = octal(block.subarray(124, 136).toString('ascii'));
      if (type === 53 && size !== 0) throw new Error('Directory contains payload.');
      if (type !== 53 && parts.length === 0) throw new Error('Invalid regular file path.');
      remaining = Math.ceil(size / 512) * 512;
      if (!Number.isSafeInteger(remaining)) throw new Error('Invalid tar size.');
    }
  }
  if (buffered.length || remaining || zeroBlocks < 2) throw new Error('Truncated tar archive.');
}
main().catch(() => { console.error('Media archive validation failed.'); process.exitCode = 1; });
'@

$script:HnbRestorePrepare = @'
lock=/data/media/.hnb-restore.lock
if ! mkdir "$lock"; then
  echo "An operation or preserved recovery lock exists; inspect it before retrying." >&2
  exit 1
fi
stage=
cleanup_prepare() {
  test -z "$stage" || rm -rf -- "$stage"
  rm -f -- "$lock/stage"
  rmdir -- "$lock"
}
trap cleanup_prepare EXIT
if test -n "$(find /data/media -mindepth 1 -maxdepth 1 -name '.hnb-restore.*' ! -name '.hnb-restore.lock' -print -quit)"; then
  echo "Preserved recovery files exist; inspect them before retrying." >&2
  exit 1
fi
stage=$(mktemp -d /data/media/.hnb-restore.XXXXXXXXXX)
printf '%s\n' "$stage" > "$lock/stage"
mkdir "$stage/incoming" "$stage/previous"
printf '%s\n' "$stage"
trap - EXIT
'@

$script:HnbRestoreSwap = @'
const fs = require('node:fs');
const path = require('node:path');
const root = '/data/media';
const stage = process.argv[2];
if (path.dirname(stage) !== root || !/^\.hnb-restore\.[A-Za-z0-9]{10}$/.test(path.basename(stage))) throw new Error('Unexpected staging path.');
if (fs.realpathSync(stage) !== stage || fs.readFileSync(path.join(root, '.hnb-restore.lock/stage'), 'utf8').trim() !== stage) throw new Error('Restore lock mismatch.');
const incoming = path.join(stage, 'incoming');
const previous = path.join(stage, 'previous');
const oldNames = fs.readdirSync(root).filter(name => name !== path.basename(stage) && name !== '.hnb-restore.lock');
const newNames = fs.readdirSync(incoming);
if (oldNames.some(name => name.startsWith('.hnb-restore.')) || newNames.some(name => name.startsWith('.hnb-restore.'))) throw new Error('Reserved recovery paths.');
let phase = 'moving_old';
function journal() {
  const temporary = path.join(stage, 'state.tmp');
  fs.writeFileSync(temporary, JSON.stringify({phase, oldNames, newNames}) + '\n', {mode: 0o600});
  fs.renameSync(temporary, path.join(stage, 'state.json'));
}
try {
  journal();
  for (const name of oldNames) fs.renameSync(path.join(root, name), path.join(previous, name));
  phase = 'moving_new'; journal();
  for (const name of newNames) fs.renameSync(path.join(incoming, name), path.join(root, name));
  phase = 'complete'; journal();
} catch {
  try {
    if (phase !== 'moving_old') for (const name of newNames) {
      const live = path.join(root, name), staged = path.join(incoming, name);
      if (fs.existsSync(live) && !fs.existsSync(staged)) fs.renameSync(live, staged);
    }
    for (const name of oldNames) {
      const saved = path.join(previous, name), live = path.join(root, name);
      if (fs.existsSync(saved)) {
        if (fs.existsSync(live)) throw new Error('Live recovery conflict.');
        fs.renameSync(saved, live);
      }
    }
    phase = 'rolled_back'; journal();
    console.error('Media swap failed; prior live media restored. Database may already be committed.');
  } catch { console.error('Media recovery failed; preserve staging and previous files for manual recovery.'); }
  process.exitCode = 1;
}
'@

function Assert-HnbBackupFiles {
    param([Parameter(Mandatory = $true)][string]$BackupDirectory)
    if (-not (Test-Path -LiteralPath $BackupDirectory -PathType Container)) {
        throw 'Backup directory does not exist.'
    }
    $directoryItem = Get-Item -LiteralPath $BackupDirectory -Force -ErrorAction Stop
    if (($directoryItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Backup directory must not be a link or reparse point.'
    }
    foreach ($name in @('database.dump', 'media.tar.gz', 'SHA256SUMS')) {
        $file = Join-Path $BackupDirectory $name
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'A required backup file is missing.' }
        if (((Get-Item -LiteralPath $file -Force -ErrorAction Stop).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw 'Backup files must not be links or reparse points.'
        }
    }
    if (Test-Path -LiteralPath (Join-Path $BackupDirectory 'INCOMPLETE.txt')) {
        throw 'This backup was not completed; choose a complete verified backup.'
    }
    $entries = @{}
    foreach ($line in @(Get-Content -LiteralPath (Join-Path $BackupDirectory 'SHA256SUMS') -Encoding UTF8 -ErrorAction Stop)) {
        $match = [regex]::Match($line, '^([a-fA-F0-9]{64}) [ *](database\.dump|media\.tar\.gz)$')
        if (-not $match.Success) { throw 'Invalid backup checksum manifest.' }
        $name = $match.Groups[2].Value
        if ($entries.ContainsKey($name)) { throw 'Duplicate backup checksum entry.' }
        $entries[$name] = $match.Groups[1].Value.ToLowerInvariant()
    }
    if ($entries.Count -ne 2) { throw 'Expected exactly two backup checksum entries.' }
    foreach ($name in @('database.dump', 'media.tar.gz')) {
        if (-not $entries.ContainsKey($name)) { throw 'Missing backup checksum entry.' }
        $observed = (Get-FileHash -LiteralPath (Join-Path $BackupDirectory $name) -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
        if ($observed -cne $entries[$name]) { throw 'Backup checksum mismatch; no restore was attempted.' }
    }
}

function Invoke-HnbBackup {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$BackupDirectory,
        [switch]$StopApp
    )
    if (-not $StopApp) { throw 'Backup requires -StopApp to pause writes during the DB/media snapshot.' }
    $target = [IO.Path]::GetFullPath($BackupDirectory)
    if (Test-Path -LiteralPath $target) { throw 'Choose a new backup directory; existing files will not be overwritten.' }
    $parent = [IO.Path]::GetDirectoryName($target)
    $leaf = [IO.Path]::GetFileName($target)
    if (-not $parent -or -not $leaf) { throw 'Choose a named backup directory, not a filesystem root.' }
    $null = [IO.Directory]::CreateDirectory($parent)
    $backupStage = Join-Path $parent ('.' + $leaf + '.partial.' + [guid]::NewGuid().ToString('N'))
    $null = New-Item -ItemType Directory -Path $backupStage -ErrorAction Stop
    Protect-HnbPrivatePath -Path $backupStage -IsDirectory
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText((Join-Path $backupStage 'INCOMPLETE.txt'), 'Backup did not complete. Do not restore this directory.' + [Environment]::NewLine, $utf8)
    $owner = 'backup:' + [guid]::NewGuid().ToString('N')
    $lockAttempted = $false
    $wasRunning = $false
    $complete = $false
    $operationFailed = $false
    $cleanupFailed = $false
    try {
        $lockAttempted = $true
        $prepare = @'
lock=/data/media/.hnb-restore.lock
if ! mkdir "$lock"; then echo "Another operation or preserved recovery lock exists." >&2; exit 1; fi
trap 'rm -f -- "$lock/owner"; rmdir -- "$lock"' EXIT
if test -n "$(find /data/media -mindepth 1 -maxdepth 1 -name '.hnb-restore.*' ! -name '.hnb-restore.lock' -print -quit)"; then
  echo "Preserved recovery files exist; inspect before backup." >&2; exit 1
fi
printf '%s\n' "$1" > "$lock/owner"
trap - EXIT
'@
        $null = Invoke-HnbCompose -Arguments @('run', '--rm', '--no-deps', '-T', 'tools', 'sh', '-ceu', $prepare, 'sh', $owner)
        $running = Invoke-HnbCompose -Arguments @('ps', '--status', 'running', '--services', 'app')
        $wasRunning = (([string]$running.StdOut).Trim() -eq 'app')
        if ($wasRunning) { $null = Invoke-HnbCompose -Arguments @('stop', 'app') }
        $null = Invoke-HnbCompose -Arguments @('exec', '-T', 'db', 'sh', '-c', 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl') -OutputFile (Join-Path $backupStage 'database.dump')
        $null = Invoke-HnbCompose -Arguments @('run', '--rm', '--no-deps', '-T', 'tools', 'tar', '--exclude=./.hnb-restore.lock', '-C', '/data/media', '-czf', '-', '.') -OutputFile (Join-Path $backupStage 'media.tar.gz')
        $null = Invoke-HnbCompose -Arguments @('run', '--rm', '--no-deps', '-T', 'tools', 'node', '-e', $script:HnbMediaTarValidator) -InputFile (Join-Path $backupStage 'media.tar.gz')
        $lines = foreach ($name in @('database.dump', 'media.tar.gz')) {
            $hash = (Get-FileHash -LiteralPath (Join-Path $backupStage $name) -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
            $hash + '  ' + $name
        }
        [IO.File]::WriteAllText((Join-Path $backupStage 'SHA256SUMS'), (($lines -join "`n") + "`n"), $utf8)
        [IO.File]::WriteAllText((Join-Path $backupStage 'created-at.txt'), ([DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ') + "`n"), $utf8)
        Remove-Item -LiteralPath (Join-Path $backupStage 'INCOMPLETE.txt') -ErrorAction Stop
        $complete = $true
    } catch {
        $operationFailed = $true
    } finally {
        # Keep the exclusive lock until a previously-running app has restarted.
        if ($wasRunning) {
            try { $null = Invoke-HnbCompose -Arguments @('start', 'app') } catch { $cleanupFailed = $true }
        }
        if ($lockAttempted) {
            $release = @'
lock=/data/media/.hnb-restore.lock
test -d "$lock" || exit 0
test -f "$lock/owner" && test "$(cat "$lock/owner")" = "$1"
rm -- "$lock/owner"
rmdir -- "$lock"
'@
            try { $null = Invoke-HnbCompose -Arguments @('run', '--rm', '--no-deps', '-T', 'tools', 'sh', '-ceu', $release, 'sh', $owner) } catch { $cleanupFailed = $true }
        }
    }
    if ($operationFailed) {
        Write-Warning ('Incomplete backup retained for diagnosis at ' + $backupStage)
        throw 'Backup failed. Final directory was not published; an incomplete snapshot cannot be restored by this command.'
    }
    if ($cleanupFailed) {
        Write-Warning ('Snapshot retained at ' + $backupStage + '; inspect app restart and operation lock before retrying.')
        throw 'Backup snapshot may be complete, but app restart or lock cleanup failed. Final directory was not published.'
    }
    if ($complete) {
        try { [IO.Directory]::Move($backupStage, $target) } catch {
            Write-Warning ('Verified snapshot retained at ' + $backupStage)
            throw 'Could not publish backup directory; no existing destination was overwritten.'
        }
        Write-Host ('Backup complete: ' + $target + '. Protect it as account and learner data.')
    }
}

function Invoke-HnbRestore {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$BackupDirectory,
        [switch]$ConfirmReplace
    )
    if (-not $ConfirmReplace) { throw 'Restore replaces the selected DB/media and requires -ConfirmReplace. Test on a separate project first.' }
    $source = [IO.Path]::GetFullPath($BackupDirectory)
    Assert-HnbBackupFiles -BackupDirectory $source
    $running = Invoke-HnbCompose -Arguments @('ps', '--status', 'running', '--services', 'app')
    if (([string]$running.StdOut).Trim()) { throw 'Stop the selected app before restore. Restore never starts it automatically.' }
    $null = Invoke-HnbCompose -Arguments @('run', '--rm', '--no-deps', '-T', 'tools', 'node', '-e', $script:HnbMediaTarValidator) -InputFile (Join-Path $source 'media.tar.gz')
    # A fresh restore project (or Stop) has no running database container yet.
    # Start only the selected local database; app remains stopped throughout.
    $null = Invoke-HnbCompose -Arguments @('up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '180', 'db')
    Wait-HnbDatabase -Seconds 180
    # A valid custom archive listing is required before any database mutation.
    $null = Invoke-HnbCompose -Arguments @('exec', '-T', 'db', 'pg_restore', '--list') -InputFile (Join-Path $source 'database.dump')
    $stage = ''
    $databaseAttempted = $false
    $complete = $false
    $operationFailed = $false
    $cleanupFailed = $false
    try {
        $prepared = Invoke-HnbCompose -Arguments @('run', '--rm', '--no-deps', '-T', 'tools', 'sh', '-ceu', $script:HnbRestorePrepare)
        $stage = ([string]$prepared.StdOut).Trim()
        if ($stage -cnotmatch '^/data/media/\.hnb-restore\.[A-Za-z0-9]{10}$') {
            # Unknown ownership: never guess which lock or path can be removed.
            $stage = ''
            throw 'Unexpected restore staging path.'
        }
        $running = Invoke-HnbCompose -Arguments @('ps', '--status', 'running', '--services', 'app')
        if (([string]$running.StdOut).Trim()) { throw 'App started while restore was preparing; no database restore attempted.' }
        $null = Invoke-HnbCompose -Arguments @('run', '--rm', '--no-deps', '-T', 'tools', 'sh', '-ceu', 'tar --no-same-owner --no-same-permissions -C "$1/incoming" -xzf -', 'sh', $stage) -InputFile (Join-Path $source 'media.tar.gz')
        Assert-HnbBackupFiles -BackupDirectory $source
        $databaseAttempted = $true
        $null = Invoke-HnbCompose -Arguments @('exec', '-T', 'db', 'sh', '-c', 'exec pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl --exit-on-error --single-transaction') -InputFile (Join-Path $source 'database.dump')
        $null = Invoke-HnbCompose -Arguments @('run', '--rm', '--no-deps', '-T', 'tools', 'node', '-', $stage) -InputText $script:HnbRestoreSwap
        $complete = $true
    } catch {
        $operationFailed = $true
    } finally {
        if ($stage) {
            if ($complete -or -not $databaseAttempted) {
                $cleanup = @'
stage=$1
test "$(cat /data/media/.hnb-restore.lock/stage)" = "$stage"
rm -rf -- "$stage"
rm -- /data/media/.hnb-restore.lock/stage
rmdir -- /data/media/.hnb-restore.lock
'@
                try { $null = Invoke-HnbCompose -Arguments @('run', '--rm', '--no-deps', '-T', 'tools', 'sh', '-ceu', $cleanup, 'sh', $stage) } catch { $cleanupFailed = $true }
            } else {
                Write-Warning ('Restore was interrupted after a database restore was attempted. The DB may already contain the backup. Keep app stopped; preserve ' + $stage + ' and .hnb-restore.lock for recovery.')
            }
        }
    }
    if ($operationFailed -and $databaseAttempted) { throw 'Restore failed after DB restore was attempted. App remains stopped; inspect DB and preserved media/recovery journal before any restart.' }
    if ($operationFailed) { throw 'Restore preparation failed before DB restore. Live DB/media were not replaced; inspect any preserved recovery lock before retrying.' }
    if ($cleanupFailed) { throw 'Restore completed but staging cleanup failed. Keep app stopped and inspect the preserved recovery lock before starting.' }
    Write-Host 'Restore completed; app remains stopped. Inspect DB counts and media first, then start the selected app deliberately and verify login/progress before reopening access.'
}
