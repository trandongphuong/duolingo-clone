# Pester-free validation. Docker calls and Windows ACLs are mocked; Node really
# parses generated binary tar/gzip payloads. No container or existing DB is used.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../scripts/windows/Common.ps1')
Set-StrictMode -Version 2.0
. (Join-Path $PSScriptRoot '../scripts/windows/BackupRestore.ps1')

$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('hnb-windows-backup-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $testRoot
$script:Calls = New-Object System.Collections.Generic.List[string]
$script:MockMode = ''
$script:AppRunning = $false
$script:ArchiveFixture = Join-Path $testRoot 'fixture.tar.gz'
$script:ValidatorFile = Join-Path $testRoot 'validator.cjs'
[IO.File]::WriteAllText($script:ValidatorFile, $script:HnbMediaTarValidator, (New-Object System.Text.UTF8Encoding($false)))

function Assert-Test([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw ('FAIL: ' + $Message) }
}
function Assert-Throws([scriptblock]$Operation, [string]$Message) {
    $failed = $false
    try { & $Operation } catch { $failed = $true }
    Assert-Test $failed $Message
}
function Set-TarField([byte[]]$Header, [int]$Offset, [int]$Width, [string]$Value) {
    $bytes = [Text.Encoding]::ASCII.GetBytes($Value)
    if ($bytes.Length -gt $Width) { throw 'Fixture field too long.' }
    [Array]::Copy($bytes, 0, $Header, $Offset, $bytes.Length)
}
function Write-TestArchive([string]$Path, [string]$Name = './audio.bin', [byte]$Kind = 48, [switch]$BadChecksum, [switch]$Truncated) {
    $header = New-Object byte[] 512
    Set-TarField $header 0 100 $Name
    Set-TarField $header 100 8 "0000600`0"
    Set-TarField $header 108 8 "0000000`0"
    Set-TarField $header 116 8 "0000000`0"
    Set-TarField $header 124 12 "00000000004`0"
    Set-TarField $header 136 12 "00000000000`0"
    for ($i = 148; $i -lt 156; $i++) { $header[$i] = 32 }
    $header[156] = $Kind
    Set-TarField $header 257 6 "ustar`0"
    Set-TarField $header 263 2 '00'
    $sum = 0
    foreach ($value in $header) { $sum += [int]$value }
    Set-TarField $header 148 8 ([Convert]::ToString($sum, 8).PadLeft(6, '0') + "`0 ")
    if ($BadChecksum) { $header[0] = 99 }
    $stream = [IO.File]::Create($Path)
    $gzip = New-Object IO.Compression.GZipStream($stream, [IO.Compression.CompressionMode]::Compress)
    try {
        $gzip.Write($header, 0, $header.Length)
        $payload = New-Object byte[] 512
        $payload[0] = 0; $payload[1] = 255; $payload[2] = 128; $payload[3] = 42
        if (-not $Truncated) {
            $gzip.Write($payload, 0, $payload.Length)
            $end = New-Object byte[] 1024
            $gzip.Write($end, 0, $end.Length)
        }
    } finally { $gzip.Dispose(); $stream.Dispose() }
}
function Invoke-TestValidator([string]$Path) {
    $settings = New-Object Diagnostics.ProcessStartInfo
    $settings.FileName = (Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $settings.Arguments = '"' + $script:ValidatorFile + '"'
    $settings.UseShellExecute = $false
    $settings.RedirectStandardInput = $true
    $settings.RedirectStandardOutput = $true
    $settings.RedirectStandardError = $true
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $settings
    $null = Start-HnbNativeProcess -Process $process
    $sourceStream = [IO.File]::OpenRead($Path)
    try { $sourceStream.CopyTo($process.StandardInput.BaseStream) } finally { $sourceStream.Dispose(); $process.StandardInput.Close() }
    $null = $process.StandardOutput.ReadToEnd()
    $null = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    $exitCode = $process.ExitCode
    $process.Dispose()
    return $exitCode
}
function Protect-HnbPrivatePath { param([string]$Path, [switch]$IsDirectory) }
function Wait-HnbDatabase { param([int]$Seconds) $script:Calls.Add('ready') }
function Invoke-HnbCompose {
    param([string[]]$Arguments, [string]$InputFile, [string]$OutputFile, [string]$InputText, [switch]$AllowFailure)
    $joined = $Arguments -join ' '
    $output = ''
    if ($Arguments[0] -eq 'ps') {
        $script:Calls.Add('ps')
        if ($script:AppRunning) { $output = "app`n" }
    } elseif ($Arguments[0] -eq 'up') {
        Assert-Test ($Arguments[-1] -eq 'db' -and $Arguments -contains '--no-build' -and $Arguments -contains 'never') 'restore only starts DB offline'
        $script:Calls.Add('db-up')
    } elseif ($Arguments[0] -eq 'stop') {
        $script:Calls.Add('stop'); $script:AppRunning = $false
    } elseif ($Arguments[0] -eq 'start') {
        $script:Calls.Add('restart')
        if ($script:MockMode -eq 'restart-fail') { throw 'Injected restart error.' }
        $script:AppRunning = $true
    } elseif ($joined.Contains('exec pg_dump')) {
        $script:Calls.Add('dump')
        if ($script:MockMode -eq 'dump-fail') { throw 'Injected dump error.' }
        Assert-Test ([bool]$OutputFile) 'dump uses binary output transport'
        [IO.File]::WriteAllBytes($OutputFile, [byte[]](80,71,68,77,80,0,255,128,1))
    } elseif ($Arguments -contains '--exclude=./.hnb-restore.lock') {
        $script:Calls.Add('media-backup')
        Assert-Test ([bool]$OutputFile) 'media archive uses binary output transport'
        [IO.File]::Copy($script:ArchiveFixture, $OutputFile)
    } elseif ($Arguments -contains $script:HnbMediaTarValidator) {
        $script:Calls.Add('validate-tar')
        Assert-Test ([bool]$InputFile) 'tar validation uses binary input transport'
        if ((Invoke-TestValidator $InputFile) -ne 0) { throw 'Invalid tar fixture.' }
    } elseif ($Arguments -contains '--list') {
        $script:Calls.Add('validate-dump')
        Assert-Test ([bool]$InputFile) 'dump validation uses binary input transport'
    } elseif ($Arguments -contains $script:HnbRestorePrepare) {
        $script:Calls.Add('stage')
        if ($script:MockMode -eq 'lock-fail') { throw 'Injected existing lock.' }
        $output = "/data/media/.hnb-restore.ABCdef1234`n"
    } elseif ($joined.Contains('tar --no-same-owner')) {
        $script:Calls.Add('extract')
        Assert-Test ([bool]$InputFile) 'extraction uses binary input transport'
        if ($script:MockMode -eq 'extract-fail') { throw 'Injected extraction error.' }
    } elseif ($joined.Contains('exec pg_restore')) {
        $script:Calls.Add('restore-db')
        Assert-Test ([bool]$InputFile) 'DB restore uses binary input transport'
        Assert-Test ($Arguments -join ' ' -match '--single-transaction') 'DB restore is a single transaction'
        if ($script:MockMode -eq 'pg-fail') { throw 'Injected pg_restore error.' }
    } elseif ($InputText -eq $script:HnbRestoreSwap) {
        $script:Calls.Add('swap')
        if ($script:MockMode -eq 'swap-fail') { throw 'Injected swap error.' }
    } elseif ($joined.Contains('rm -rf -- "$stage"')) {
        $script:Calls.Add('cleanup-stage')
    } elseif ($joined.Contains('> "$lock/owner"')) {
        $script:Calls.Add('backup-lock')
        if ($script:MockMode -eq 'lock-fail') { throw 'Injected existing lock.' }
    } elseif ($joined.Contains('test -f "$lock/owner"')) {
        $script:Calls.Add('unlock-backup')
    } else { throw ('Unexpected mocked operation: ' + $Arguments[0]) }
    return [pscustomobject]@{ ExitCode = 0; StdOut = $output; StdErr = '' }
}
function Reset-Calls([string]$Mode = '', [bool]$Running = $false) {
    $script:Calls.Clear(); $script:MockMode = $Mode; $script:AppRunning = $Running
}

try {
    Write-TestArchive $script:ArchiveFixture
    Assert-Test ((Invoke-TestValidator $script:ArchiveFixture) -eq 0) 'valid binary media tar/gzip is accepted'
    foreach ($case in @(
        @{ Name = '/absolute.bin'; Kind = 48 }, @{ Name = '../escape.bin'; Kind = 48 },
        @{ Name = './.hnb-restore.lock/owner'; Kind = 48 }, @{ Name = './linked.bin'; Kind = 50 },
        @{ Name = './hardlink.bin'; Kind = 49 }, @{ Name = './bad.bin'; Kind = 48; BadChecksum = $true },
        @{ Name = './short.bin'; Kind = 48; Truncated = $true }
    )) {
        $bad = Join-Path $testRoot ([guid]::NewGuid().ToString('N') + '.tar.gz')
        Write-TestArchive -Path $bad @case
        Assert-Test ((Invoke-TestValidator $bad) -ne 0) 'unsafe/corrupt/truncated archive refused'
    }
    $tarCommand = Get-Command tar -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($tarCommand) {
        $tarInput = Join-Path $testRoot 'tar-input'
        $null = New-Item -ItemType Directory -Path $tarInput
        [IO.File]::WriteAllBytes((Join-Path $tarInput 'real-media.bin'), [byte[]](0, 255, 128, 42))
        $realTar = Join-Path $testRoot 'real-tar.tar.gz'
        & $tarCommand.Source --format=ustar -C $tarInput -czf $realTar .
        Assert-Test ($LASTEXITCODE -eq 0) 'system tar fixture created'
        Assert-Test ((Invoke-TestValidator $realTar) -eq 0) 'archive produced by system tar is accepted'
    }
    Write-Host 'PASS archive validator: regular binary payload accepted; traversal, absolute, reserved, links, checksum and truncation rejected.'

    Reset-Calls -Running $true
    $backup = Join-Path $testRoot 'backup-good'
    Invoke-HnbBackup -BackupDirectory $backup -StopApp
    Assert-HnbBackupFiles -BackupDirectory $backup
    Assert-Test (([BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $backup 'database.dump')))) -eq '50-47-44-4D-50-00-FF-80-01') 'dump bytes remain unchanged'
    Assert-Test (($script:Calls -join ',') -eq 'backup-lock,ps,stop,dump,media-backup,validate-tar,restart,unlock-backup') 'backup validates media and holds lock across snapshot and restart'
    Assert-Test $script:AppRunning 'backup restores prior running state'
    Assert-Throws { Invoke-HnbBackup -BackupDirectory $backup -StopApp } 'existing backup never overwritten'
    Assert-Throws { Invoke-HnbBackup -BackupDirectory (Join-Path $testRoot 'missing-optin') } 'backup explicit stop optin'
    Write-Host 'PASS backup: binary transport, checksums, operation lock, pause/restart and no overwrite.'

    Reset-Calls -Mode 'dump-fail' -Running $true
    $failedBackup = Join-Path $testRoot 'backup-failed'
    Assert-Throws { Invoke-HnbBackup -BackupDirectory $failedBackup -StopApp } 'dump failure propagates'
    Assert-Test (-not (Test-Path -LiteralPath $failedBackup)) 'failed backup final directory absent'
    Assert-Test ($script:Calls.Contains('restart') -and $script:Calls.Contains('unlock-backup')) 'failure restarts app and releases owned lock'
    Reset-Calls -Mode 'restart-fail' -Running $true
    $failedRestart = Join-Path $testRoot 'backup-restart-failed'
    Assert-Throws { Invoke-HnbBackup -BackupDirectory $failedRestart -StopApp } 'restart failure propagates'
    Assert-Test (-not (Test-Path -LiteralPath $failedRestart)) 'no final backup published after failed restart'
    Write-Host 'PASS backup faults: final names not published; restart/unlock attempted without deleting snapshots.'

    Write-TestArchive -Path $script:ArchiveFixture -Name './linked.bin' -Kind 50
    Reset-Calls -Running $true
    $unsafeBackup = Join-Path $testRoot 'backup-unsafe-media'
    Assert-Throws { Invoke-HnbBackup -BackupDirectory $unsafeBackup -StopApp } 'unsafe media backup must not be published'
    Assert-Test (-not (Test-Path -LiteralPath $unsafeBackup)) 'unsafe media final backup exists'
    Assert-Test ($script:Calls.Contains('restart') -and $script:Calls.Contains('unlock-backup')) 'unsafe media failure still restarts app and releases owned lock'
    Write-TestArchive $script:ArchiveFixture
    Write-Host 'PASS backup validates media before publishing a restorable snapshot.'

    Reset-Calls
    Invoke-HnbRestore -BackupDirectory $backup -ConfirmReplace
    $sequence = $script:Calls -join ','
    Assert-Test ($sequence -eq 'ps,validate-tar,db-up,ready,validate-dump,stage,ps,extract,restore-db,swap,cleanup-stage') 'restore validates archive, starts only DB, extracts before DB transaction and swaps after'
    Assert-Test (-not $script:Calls.Contains('restart')) 'restore never starts app'
    Assert-Throws { Invoke-HnbRestore -BackupDirectory $backup } 'restore requires explicit replacement optin'
    Reset-Calls -Running $true
    Assert-Throws { Invoke-HnbRestore -BackupDirectory $backup -ConfirmReplace } 'running app blocks restore'
    Assert-Test (-not $script:Calls.Contains('restore-db')) 'running app guard precedes mutation'
    Write-Host 'PASS restore ordering: manifest/tar/dump validation, full staging, DB transaction, swap, cleanup; app stays stopped.'

    foreach ($fault in @('lock-fail', 'extract-fail', 'pg-fail', 'swap-fail')) {
        Reset-Calls -Mode $fault
        Assert-Throws { Invoke-HnbRestore -BackupDirectory $backup -ConfirmReplace } ('restore fault propagates: ' + $fault)
        if ($fault -eq 'lock-fail' -or $fault -eq 'extract-fail') {
            Assert-Test (-not $script:Calls.Contains('restore-db')) 'pre-DB failure never invokes restore'
        }
        if ($fault -eq 'extract-fail') { Assert-Test $script:Calls.Contains('cleanup-stage') 'extract failure cleans only own stage' }
        if ($fault -eq 'pg-fail' -or $fault -eq 'swap-fail') {
            Assert-Test (-not $script:Calls.Contains('cleanup-stage')) 'post-attempt failure retains recovery stage and lock'
        }
        Assert-Test (-not $script:Calls.Contains('restart')) 'restore failure does not restart app'
    }
    Write-Host 'PASS restore faults: no pre-stage DB mutation; post-attempt recovery retained; no automatic restart.'

    $manifest = Join-Path $backup 'SHA256SUMS'
    $originalManifest = [IO.File]::ReadAllText($manifest)
    [IO.File]::WriteAllText($manifest, ('0' * 64) + '  ../other-file' + "`n")
    Reset-Calls
    Assert-Throws { Invoke-HnbRestore -BackupDirectory $backup -ConfirmReplace } 'manifest paths restricted to exact two files'
    Assert-Test ($script:Calls.Count -eq 0) 'invalid manifest rejected before Docker'
    [IO.File]::WriteAllText($manifest, $originalManifest)
    [IO.File]::AppendAllText((Join-Path $backup 'database.dump'), 'tampered')
    Reset-Calls
    Assert-Throws { Invoke-HnbRestore -BackupDirectory $backup -ConfirmReplace } 'checksum mismatch rejected'
    Assert-Test ($script:Calls.Count -eq 0) 'checksum mismatch rejected before Docker'
    Write-Host 'PASS checksum guards: unexpected paths and modified bytes rejected before Docker.'
    Write-Host 'Windows backup/restore mocks and actual Node archive validation: PASS. Actual Windows ACL/engine and full DB restore remain NOT TESTED here.'
} finally { Remove-Item -LiteralPath $testRoot -Recurse -Force }
