# PowerShell 5.1+; ASCII source avoids Windows PowerShell ANSI decoding issues.
[CmdletBinding()]
param(
    [ValidateSet('Configure', 'Doctor', 'LoadImages', 'Start', 'Stop', 'Status', 'CreateAdmin', 'Backup', 'Restore')]
    [string]$Action = 'Doctor',
    [string]$EnvironmentFile,
    [string]$ProjectName,
    [string]$Origin,
    [ValidateRange(0, 65535)][int]$Port = 0,
    [string]$ListenAddress = '127.0.0.1',
    [switch]$Tls,
    [string]$CertificateFile,
    [string]$PrivateKeyFile,
    [string]$ImageArchive,
    [string]$Username = 'admin',
    [string]$DisplayName = 'Local administrator',
    [switch]$SampleData,
    [ValidateRange(10, 600)][int]$WaitSeconds = 180,
    [string]$BackupDirectory,
    [switch]$StopApp,
    [switch]$ConfirmReplace
)

. (Join-Path $PSScriptRoot 'Common.ps1')
if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'BackupRestore.ps1')) {
    . (Join-Path $PSScriptRoot 'BackupRestore.ps1')
}

function New-HnbHexSecret {
    $bytes = New-Object byte[] 32
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes); return [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant() }
    finally { [Array]::Clear($bytes, 0, $bytes.Length); $generator.Dispose() }
}

function ConvertTo-HnbEnvLiteral {
    param([string]$Value)
    if ($Value.IndexOfAny([char[]]@([char]0, [char]10, [char]13)) -ge 0) { throw 'Environment values cannot contain line breaks or NUL.' }
    return "'" + $Value.Replace("'", "\'") + "'"
}

function New-HnbConfiguration {
    if (Test-Path -LiteralPath $script:HnbEnvPath) { throw 'Configuration already exists. It was not modified; use a new EnvironmentFile for a separate instance.' }
    if ($Tls -and [string]::IsNullOrWhiteSpace($Origin)) { throw 'For -Tls, provide the approved HTTPS -Origin, for example https://hanngubien.internal:8443.' }
    $configuredOrigin = $Origin
    if ([string]::IsNullOrWhiteSpace($configuredOrigin)) {
        if ($Port -eq 0) { $Port = 3000 }
        $configuredOrigin = 'http://localhost:' + $Port
    }
    $parsed = $null
    if (-not [Uri]::TryCreate($configuredOrigin, [UriKind]::Absolute, [ref]$parsed) -or
        $parsed.UserInfo -or $parsed.Query -or $parsed.Fragment -or $parsed.AbsolutePath -ne '/' -or
        $parsed.GetLeftPart([UriPartial]::Authority) -cne $configuredOrigin) { throw 'Origin must be an exact HTTP(S) origin without a trailing slash, path, query or credentials.' }
    if ($Port -eq 0) { $Port = $parsed.Port }
    if ($Port -ne $parsed.Port) { throw '-Port must match the origin port.' }
    Assert-HnbListenAddress -Address $ListenAddress
    $secure = 'false'
    $certificateSettings = @()
    if ($Tls) {
        if ($parsed.Scheme -ne 'https') { throw 'TLS requires an HTTPS origin.' }
        foreach ($candidate in @($CertificateFile, $PrivateKeyFile)) {
            if ([string]::IsNullOrWhiteSpace($candidate) -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw 'TLS requires existing certificate and private-key PEM files supplied by the operator.' }
        }
        $secure = 'true'
        $certificateSettings = @(
            ('TLS_CERT_FILE=' + (ConvertTo-HnbEnvLiteral ([System.IO.Path]::GetFullPath($CertificateFile).Replace('\', '/')))),
            ('TLS_KEY_FILE=' + (ConvertTo-HnbEnvLiteral ([System.IO.Path]::GetFullPath($PrivateKeyFile).Replace('\', '/'))))
        )
    }
    elseif ($parsed.Scheme -ne 'http' -or $parsed.Host -notin @('localhost', '127.0.0.1') -or $ListenAddress -ne '127.0.0.1') {
        throw 'HTTP is restricted to isolated localhost use. Configure -Tls for LAN access.'
    }
    $parent = Split-Path -Parent $script:HnbEnvPath
    if (-not (Test-Path -LiteralPath $parent -PathType Container)) { throw 'The configuration parent directory must already exist.' }
    $lines = @(
        '# Private local configuration. Do not commit or share this file.',
        ('COMPOSE_PROJECT_NAME=' + $script:HnbProject),
        'POSTGRES_USER=hnb', 'POSTGRES_DB=hanngubien',
        ('POSTGRES_PASSWORD=' + (New-HnbHexSecret)),
        ('SESSION_PASSWORD=' + (New-HnbHexSecret)),
        'SESSION_TTL_SECONDS=43200',
        ('SESSION_SECURE=' + $secure),
        ('APP_ORIGIN=' + $configuredOrigin),
        ('LAN_HOST=' + $ListenAddress),
        ('LAN_PORT=' + $Port),
        'NEXT_TELEMETRY_DISABLED=1', 'TZ=Asia/Bangkok'
    ) + $certificateSettings
    foreach ($image in @(Get-HnbImageDefinitions)) { $lines += $image.Key + '=' + $image.Reference }
    $created = $false
    try {
        $empty = [System.IO.File]::Open($script:HnbEnvPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
        $empty.Dispose()
        $created = $true
        Protect-HnbPrivatePath -Path $script:HnbEnvPath
        [System.IO.File]::WriteAllText($script:HnbEnvPath, (($lines -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))
    }
    catch {
        if ($created -and (Test-Path -LiteralPath $script:HnbEnvPath)) { Remove-Item -LiteralPath $script:HnbEnvPath -Force }
        throw 'Unable to create private configuration with protected Windows ACLs. Use an operator-owned NTFS directory; no existing configuration was overwritten.'
    }
    finally { $lines = $null }
    Write-Host 'Private configuration created; secrets were not printed. The initial admin password is chosen separately with -Action CreateAdmin.'
}

function Import-HnbImages {
    param([string]$Archive)
    if ([string]::IsNullOrWhiteSpace($Archive)) { $Archive = Join-Path $script:HnbRoot 'images/hnb-images.tar.gz' }
    $archiveItem = Get-Item -LiteralPath $Archive -Force -ErrorAction Stop
    if ($archiveItem.PSIsContainer -or ($archiveItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) { throw 'Image archive must be a regular local file, not a directory or reparse point.' }
    $archivePath = $archiveItem.FullName
    $manifestPath = $archivePath + '.images'
    $checksumPath = $archivePath + '.sha256'
    foreach ($file in @($manifestPath, $checksumPath)) {
        if (-not (Test-Path -LiteralPath $file -PathType Leaf) -or ((Get-Item -LiteralPath $file -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint)) { throw 'The archive, its .images manifest and its .sha256 file are required as regular files.' }
    }
    $expectedFiles = @{}
    $expectedFiles[$archiveItem.Name] = $archivePath
    $expectedFiles[$archiveItem.Name + '.images'] = $manifestPath
    $verified = @{}
    foreach ($line in [System.IO.File]::ReadAllLines($checksumPath, [System.Text.Encoding]::UTF8)) {
        if ($line -notmatch '^([a-fA-F0-9]{64}) [ *](.+)$') { throw 'Invalid SHA-256 sidecar format.' }
        $hash = $matches[1]
        $name = $matches[2]
        if (-not $expectedFiles.ContainsKey($name) -or $verified.ContainsKey($name)) { throw 'Checksum sidecar must cover exactly the archive and image manifest without paths or duplicates.' }
        if ((Get-FileHash -LiteralPath $expectedFiles[$name] -Algorithm SHA256).Hash -ine $hash) { throw 'SHA-256 mismatch. Docker was not invoked to load the archive.' }
        $verified[$name] = $true
    }
    if ($verified.Count -ne 2) { throw 'Both archive and manifest checksums are required.' }
    $images = @{}
    foreach ($line in [System.IO.File]::ReadAllLines($manifestPath, [System.Text.Encoding]::UTF8)) {
        if ($line -notmatch '^(sha256:[a-f0-9]{64}) ([A-Za-z0-9][A-Za-z0-9_./:@-]*)$') { throw 'Invalid image manifest format.' }
        $id = $matches[1]; $reference = $matches[2]
        if ($images.ContainsKey($reference)) { throw 'Duplicate image reference in the manifest.' }
        $images[$reference] = $id
    }
    if ($images.Count -ne 4) { throw 'The manifest must describe app, tools, PostgreSQL and nginx images.' }
    if ($script:HnbRelease) {
        foreach ($expected in @(Get-HnbImageDefinitions)) {
            if (-not $images.ContainsKey($expected.Reference) -or $images[$expected.Reference] -cne $expected.ExpectedId) { throw 'Archive manifest does not match RELEASE.json.' }
        }
    }
    foreach ($reference in $images.Keys) {
        $existing = Invoke-HnbDocker -Arguments @('image', 'inspect', '--format', '{{.Id}}', $reference) -AllowFailure
        if ($existing.ExitCode -eq 0 -and $existing.StdOut.Trim() -cne $images[$reference]) { throw "Refusing to overwrite existing image tag with different content: $reference. Keep the previous release and use versioned image tags." }
    }
    $loaded = Invoke-HnbDocker -Arguments @('load', '-i', $archivePath)
    if ($loaded.StdOut.Trim()) { Write-Host $loaded.StdOut.Trim() }
    foreach ($reference in $images.Keys) {
        $actual = (Invoke-HnbDocker -Arguments @('image', 'inspect', '--format', '{{.Id}}', $reference)).StdOut.Trim()
        if ($actual -cne $images[$reference]) { throw "Loaded image content mismatch: $reference." }
    }
    Write-Host 'Image archive and manifest verified; loaded image IDs match. No registry pull was requested.'
}

function Start-HnbApplication {
    $token = 'start:' + [Guid]::NewGuid().ToString('N')
    $ownedLock = $false
    $acquire = "const f=require('node:fs'),p='/data/media';if(f.readdirSync(p).some(n=>n.startsWith('.hnb-restore.')))process.exit(2);f.mkdirSync(p+'/.hnb-restore.lock',{mode:448});f.writeFileSync(p+'/.hnb-restore.lock/owner',process.argv[1],{mode:384});"
    $release = "const f=require('node:fs'),p='/data/media/.hnb-restore.lock';if(f.existsSync(p+'/owner')&&f.readFileSync(p+'/owner','utf8')===process.argv[1])f.rmSync(p,{recursive:true});else process.exit(2);"
    try {
        [void](Invoke-HnbCompose -Arguments @('--profile', 'tools', 'run', '--rm', '-T', '--no-deps', '--pull', 'never', 'tools', 'node', '-e', $acquire, $token))
        $ownedLock = $true
        [void](Invoke-HnbCompose -Arguments @('stop', 'app', 'ingress'))
        [void](Invoke-HnbCompose -Arguments @('up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', [string]$WaitSeconds, 'db'))
        Wait-HnbDatabase -Seconds $WaitSeconds
        $migration = Invoke-HnbCompose -Arguments @('--profile', 'tools', 'run', '--rm', '-T', '--no-deps', '--pull', 'never', 'tools', 'npm', 'run', 'db:migrate')
        if ($migration.StdOut.Trim()) { Write-Host $migration.StdOut.Trim() }
        if ($SampleData) {
            $seed = Invoke-HnbCompose -Arguments @('--profile', 'tools', 'run', '--rm', '-T', '--no-deps', '--pull', 'never', 'tools', 'npm', 'run', 'db:seed')
            if ($seed.StdOut.Trim()) { Write-Host $seed.StdOut.Trim() }
        }
        [void](Invoke-HnbCompose -Arguments @('up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', [string]$WaitSeconds, 'app', 'ingress'))
        Write-Host ('Started. Open {0}; create the first admin with -Action CreateAdmin if needed.' -f $script:HnbConfig.APP_ORIGIN)
    }
    finally {
        if ($ownedLock) {
            $cleanup = Invoke-HnbCompose -Arguments @('--profile', 'tools', 'run', '--rm', '-T', '--no-deps', '--pull', 'never', 'tools', 'node', '-e', $release, $token) -AllowFailure
            if ($cleanup.ExitCode -ne 0) { Write-Warning 'Startup lock could not be released. Inspect maintenance state before retrying; do not remove recovery data blindly.' }
        }
    }
}

function New-HnbAdmin {
    if ($Username -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$') { throw 'Username requires 3-64 letters/digits/dot/underscore/hyphen.' }
    if ([string]::IsNullOrWhiteSpace($DisplayName) -or $DisplayName.Length -gt 100) { throw 'DisplayName requires 1-100 characters.' }
    Wait-HnbDatabase -Seconds $WaitSeconds
    $first = Read-Host 'New admin password (12+ characters, maximum 72 UTF-8 bytes)' -AsSecureString
    $second = Read-Host 'Confirm new admin password' -AsSecureString
    $firstPointer = [IntPtr]::Zero; $secondPointer = [IntPtr]::Zero
    $plain = $null; $confirmation = $null
    $savedSecrets = @($script:HnbSecretValues)
    try {
        $firstPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($first)
        $secondPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($second)
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($firstPointer)
        $confirmation = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secondPointer)
        if ($plain -cne $confirmation) { throw 'Passwords do not match.' }
        if ($plain.Length -lt 12 -or [System.Text.Encoding]::UTF8.GetByteCount($plain) -gt 72 -or $plain -match '[\r\n\x00]') { throw 'Use at least 12 characters and at most 72 UTF-8 bytes, without line breaks or NUL.' }
        $script:HnbSecretValues += $plain
        $result = Invoke-HnbCompose -Arguments @('--profile', 'tools', 'run', '--rm', '-T', '--no-deps', '--pull', 'never', 'tools', 'npm', 'run', 'auth:create', '--', $Username, 'admin', $DisplayName) -InputText ($plain + "`n")
        if ($result.StdOut.Trim()) { Write-Host $result.StdOut.Trim() }
    }
    finally {
        if ($firstPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($firstPointer) }
        if ($secondPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secondPointer) }
        if ($first) { $first.Dispose() }; if ($second) { $second.Dispose() }
        $plain = $null; $confirmation = $null
        $script:HnbSecretValues = $savedSecrets
    }
}

function Show-HnbStatus {
    $result = Invoke-HnbCompose -Arguments @('ps', '--all')
    if ($result.StdOut.Trim()) { Write-Host $result.StdOut.Trim() }
}

if ($MyInvocation.InvocationName -ne '.') {
    $ErrorActionPreference = 'Stop'
    try {
        if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Run this entry point in Windows PowerShell5.1+ or PowerShell7+ on Windows. Linux uses the documented shell helpers.' }
        $root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
        Initialize-HnbContext -Root $root -EnvironmentFile $EnvironmentFile -ProjectName $ProjectName -Tls:$Tls -RequireEnvironment:($Action -notin @('Configure', 'LoadImages'))
        if ($Action -eq 'Configure') { New-HnbConfiguration }
        else {
            Assert-HnbDocker
            if ($Action -eq 'LoadImages') { Import-HnbImages -Archive $ImageArchive }
            else {
                if ($Action -in @('Stop', 'Status')) { [void](Invoke-HnbCompose -Arguments @('config', '--quiet')) }
                else { Assert-HnbConfiguration; Assert-HnbImages }
                switch ($Action) {
                    'Doctor' { Show-HnbStatus; Write-Host 'Prerequisites, private configuration and required images: PASS. Runtime health is shown above; run Start if not running.' }
                    'Start' { Start-HnbApplication }
                    'Stop' { [void](Invoke-HnbCompose -Arguments @('stop', 'app', 'ingress', 'db')); Write-Host 'Services stopped; volumes and data were retained.' }
                    'Status' { Show-HnbStatus }
                    'CreateAdmin' { New-HnbAdmin }
                    'Backup' { Invoke-HnbBackup -BackupDirectory $BackupDirectory -StopApp:$StopApp }
                    'Restore' { Invoke-HnbRestore -BackupDirectory $BackupDirectory -ConfirmReplace:$ConfirmReplace }
                }
            }
        }
        exit 0
    }
    catch {
        Write-Error -Message (Protect-HnbText $_.Exception.Message) -ErrorAction Continue
        exit 1
    }
}
