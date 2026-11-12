# Pester-free PowerShell 5.1+ checks. Linux can validate logic/streams, not Windows ACLs.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $root 'scripts/windows/HanNguBien.ps1')
$temporary = Join-Path ([System.IO.Path]::GetTempPath()) ('hnb-windows-smoke-' + [Guid]::NewGuid().ToString('N'))
[void](New-Item -ItemType Directory -Path $temporary)
$passes = 0
function Pass-Hnb([string]$Name) { $script:passes++; Write-Host ('PASS ' + $Name) }
function Assert-Hnb([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Assert-HnbThrows([scriptblock]$Block, [string]$Message) {
    $threw = $false
    try { & $Block } catch { $threw = $true }
    Assert-Hnb $threw $Message
}
$savedDocker = ${function:Invoke-HnbDocker}
$savedAcl = ${function:Protect-HnbPrivatePath}
$savedBinaryOutput = ${function:Open-HnbBinaryOutput}
$savedDockerHost = [Environment]::GetEnvironmentVariable('DOCKER_HOST')
$savedLanHost = [Environment]::GetEnvironmentVariable('LAN_HOST')
$savedAppImage = [Environment]::GetEnvironmentVariable('HANNGU_IMAGE')
$savedUnrelated = [Environment]::GetEnvironmentVariable('HNB_SMOKE_UNRELATED')
try {
    foreach ($file in @('Common.ps1', 'HanNguBien.ps1')) {
        $path = Join-Path $root ('scripts/windows/' + $file)
        $tokens = $null; $parseErrors = $null
        [void][System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$parseErrors)
        Assert-Hnb (@($parseErrors).Count -eq 0) 'PowerShell parse failed.'
        Assert-Hnb (@([System.IO.File]::ReadAllBytes($path) | Where-Object { $_ -gt 127 }).Count -eq 0) 'Keep PowerShell source ASCII for 5.1.'
    }
    Pass-Hnb 'parse and ASCII source compatibility'

    $images = [ordered]@{}
    $index = 1
    foreach ($name in @('app', 'tools', 'postgres', 'nginx')) {
        $images[$name] = @{ reference = ('hnb-smoke-{0}:1.0.0-rc.1' -f $name); id = ('sha256:' + ([string]$index * 64)) }
        $index++
    }
    $release = @{ version = '1.0.0-rc.1'; sourceCommit = ('a' * 40); platform = 'linux/amd64'; images = $images }
    [System.IO.File]::WriteAllText((Join-Path $temporary 'RELEASE.json'), ($release | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding($false)))
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
        function Protect-HnbPrivatePath { param([string]$Path, [switch]$IsDirectory)
            Assert-Hnb ((Get-Item -LiteralPath $Path -Force).Length -eq 0) 'ACL must be set before secret content is written.'
        }
    }
    Initialize-HnbContext -Root $temporary
    New-HnbConfiguration
    $config = Read-HnbEnvironment (Join-Path $temporary '.env')
    Assert-Hnb ($config.SESSION_PASSWORD -match '^[a-f0-9]{64}$' -and $config.POSTGRES_PASSWORD -match '^[a-f0-9]{64}$') 'Crypto secrets have wrong shape.'
    Assert-Hnb ($config.SESSION_PASSWORD -cne $config.POSTGRES_PASSWORD) 'Independent secrets were reused.'
    Assert-Hnb ($config.APP_ORIGIN -eq 'http://localhost:3000' -and $config.LAN_HOST -eq '127.0.0.1' -and $config.SESSION_SECURE -eq 'false') 'HTTP must default to loopback.'
    Assert-Hnb ($config.HANNGU_IMAGE -eq $images.app.reference) 'Release-specific app tag was not configured.'
    $bytes = [System.IO.File]::ReadAllBytes((Join-Path $temporary '.env'))
    Assert-Hnb (-not ($bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191)) 'Environment file has a UTF-8 BOM.'
    $before = (Get-FileHash -LiteralPath (Join-Path $temporary '.env') -Algorithm SHA256).Hash
    Assert-HnbThrows { New-HnbConfiguration } 'Existing configuration was not refused.'
    Assert-Hnb ((Get-FileHash -LiteralPath (Join-Path $temporary '.env') -Algorithm SHA256).Hash -eq $before) 'Existing configuration changed.'
    Pass-Hnb 'private configuration, release tags, independent secrets and no overwrite (ACL mocked only off Windows)'

    $unsafe = Join-Path $temporary 'unsafe.env'
    Initialize-HnbContext -Root $temporary -EnvironmentFile $unsafe
    $Origin = 'http://192.168.1.20:3000'; $ListenAddress = '192.168.1.20'
    Assert-HnbThrows { New-HnbConfiguration } 'Non-loopback HTTP was accepted.'
    Assert-Hnb (-not (Test-Path -LiteralPath $unsafe)) 'Refused configuration left a file.'
    $Origin = ''; $ListenAddress = '127.0.0.1'; $Port = 0
    Pass-Hnb 'non-loopback HTTP refusal before writing'

    Initialize-HnbContext -Root $temporary
    foreach ($unsafeListener in @('0.0.0.0', '8.8.8.8', '::1', '172.32.0.1')) {
        $script:HnbConfig.LAN_HOST = $unsafeListener
        Assert-HnbThrows { Assert-HnbConfiguration } 'Edited configuration accepted an unsafe listener.'
    }
    foreach ($safeListener in @('127.0.0.1', '10.5.0.10', '172.16.0.10', '192.168.1.20')) { Assert-HnbListenAddress -Address $safeListener }
    Pass-Hnb 'edited configuration cannot bypass private IPv4 listener policy'

    Initialize-HnbContext -Root $temporary
    Assert-Hnb ((Protect-HnbText ('prefix ' + $script:HnbConfig.SESSION_PASSWORD)) -eq 'prefix [REDACTED]') 'Secrets were not redacted.'
    Pass-Hnb 'private configuration values redacted from diagnostics'

    $archive = Join-Path $temporary 'images with spaces.tar.gz'
    $archiveBytes = [byte[]]@(1, 2, 3, 0, 255, 13, 10, 239, 187, 191)
    [System.IO.File]::WriteAllBytes($archive, $archiveBytes)
    $manifest = @($images.Keys | ForEach-Object { $images[$_].id + ' ' + $images[$_].reference })
    [System.IO.File]::WriteAllText(($archive + '.images'), (($manifest -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))
    function Write-HnbTestChecksums {
        $lines = @(
            ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() + '  ' + [System.IO.Path]::GetFileName($archive)),
            ((Get-FileHash -LiteralPath ($archive + '.images') -Algorithm SHA256).Hash.ToLowerInvariant() + '  ' + [System.IO.Path]::GetFileName($archive) + '.images')
        )
        [System.IO.File]::WriteAllText(($archive + '.sha256'), (($lines -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))
    }
    Write-HnbTestChecksums
    $script:MockImages = @{}
    foreach ($key in $images.Keys) { $script:MockImages[$images[$key].reference] = $images[$key].id }
    $script:MockLoaded = $false; $script:MockLoads = 0; $script:MockCalls = 0
    function Invoke-HnbDocker {
        param([string[]]$Arguments, [string]$InputText, [string]$InputFile, [string]$OutputFile, [switch]$AllowFailure)
        $script:MockCalls++
        if ($Arguments[0] -eq 'load') { $script:MockLoads++; $script:MockLoaded = $true; return [PSCustomObject]@{ ExitCode = 0; StdOut = ''; StdErr = '' } }
        if ($Arguments[0] -eq 'image' -and $Arguments[1] -eq 'inspect') {
            if (-not $script:MockLoaded) { return [PSCustomObject]@{ ExitCode = 1; StdOut = ''; StdErr = '' } }
            return [PSCustomObject]@{ ExitCode = 0; StdOut = $script:MockImages[$Arguments[-1]]; StdErr = '' }
        }
        throw 'Unexpected Docker action in loader test.'
    }
    [System.IO.File]::WriteAllBytes($archive, [byte[]]@(9, 9))
    Assert-HnbThrows { Import-HnbImages -Archive $archive } 'Corrupt archive was accepted.'
    Assert-Hnb ($script:MockCalls -eq 0 -and $script:MockLoads -eq 0) 'Docker was invoked before integrity checks completed.'
    [System.IO.File]::WriteAllBytes($archive, $archiveBytes)
    Import-HnbImages -Archive $archive
    Assert-Hnb ($script:MockLoads -eq 1) 'Valid archive was not loaded exactly once.'
    Pass-Hnb 'archive+manifest SHA checks before Docker mutation and post-load image IDs'

    $script:MockLoaded = $false; $script:MockLoads = 0; $script:MockCalls = 0
    [System.IO.File]::WriteAllText(($archive + '.images'), (($manifest[0], $manifest[0], $manifest[2], $manifest[3] -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))
    Write-HnbTestChecksums
    Assert-HnbThrows { Import-HnbImages -Archive $archive } 'Duplicate image manifest was accepted.'
    Assert-Hnb ($script:MockCalls -eq 0 -and $script:MockLoads -eq 0) 'Docker mutation occurred for invalid manifest.'
    Pass-Hnb 'duplicate manifest rejected before Docker mutation'

    $script:MockLoaded = $false; $script:MockLoads = 0; $script:MockCalls = 0
    $differentRelease = @($manifest)
    $differentRelease[0] = 'sha256:' + ('a' * 64) + ' ' + $images.app.reference
    [System.IO.File]::WriteAllText(($archive + '.images'), (($differentRelease -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))
    Write-HnbTestChecksums
    Assert-HnbThrows { Import-HnbImages -Archive $archive } 'A different release archive was accepted.'
    Assert-Hnb ($script:MockCalls -eq 0 -and $script:MockLoads -eq 0) 'Wrong release was checked only after Docker mutation.'
    Pass-Hnb 'different release image ID refused before Docker inspection or load'

    Set-Item -Path Function:\Invoke-HnbDocker -Value $savedDocker
    $child = Join-Path $temporary 'native mock.ps1'
    [System.IO.File]::WriteAllText($child, @'
param([string]$Mode, [Parameter(ValueFromRemainingArguments=$true)][string[]]$Values)
if($Mode -eq 'echo') { [Console]::OpenStandardInput().CopyTo([Console]::OpenStandardOutput()); exit 0 }
if($Mode -eq 'args') { [Console]::Out.Write(($Values | ConvertTo-Json -Compress)); exit 0 }
if($Mode -eq 'compose') { [Console]::Out.Write((@{lan=([Environment]::GetEnvironmentVariable('LAN_HOST')); image=([Environment]::GetEnvironmentVariable('HANNGU_IMAGE')); unrelated=$env:HNB_SMOKE_UNRELATED} | ConvertTo-Json -Compress)); exit 0 }
if($Mode -eq 'flood') { $bytes=New-Object byte[] 65536; while($true) { [Console]::OpenStandardOutput().Write($bytes,0,$bytes.Length) } }
exit 7
'@, (New-Object System.Text.UTF8Encoding($false)))
    $script:HnbDockerPath = (Get-Process -Id $PID).Path
    $script:HnbDockerPrefix = @('-NoLogo', '-NoProfile', '-NonInteractive', '-File', $child)
    $binaryInput = Join-Path $temporary 'binary input'
    $binaryOutput = Join-Path $temporary 'binary output'
    [System.IO.File]::WriteAllBytes($binaryInput, [byte[]]@(0, 255, 254, 13, 10, 239, 187, 191, 128, 129))
    [void](Invoke-HnbDocker -Arguments @('echo') -InputFile $binaryInput -OutputFile $binaryOutput)
    Assert-Hnb ((Get-FileHash -LiteralPath $binaryInput -Algorithm SHA256).Hash -eq (Get-FileHash -LiteralPath $binaryOutput -Algorithm SHA256).Hash) 'Binary stream was altered.'
    Pass-Hnb 'native binary stdin/stdout transport preserves all bytes'

    $unicode = ([string][char]0x6D77) + ' ' + ([string][char]0x1EAD) + "`n"
    $textOutput = Join-Path $temporary 'UTF8 output'
    [void](Invoke-HnbDocker -Arguments @('echo') -InputText $unicode -OutputFile $textOutput)
    $expectedBytes = [System.Text.Encoding]::UTF8.GetBytes($unicode)
    Assert-Hnb ([Convert]::ToBase64String([System.IO.File]::ReadAllBytes($textOutput)) -ceq [Convert]::ToBase64String($expectedBytes)) 'UTF-8 stdin was altered or a BOM was added.'
    Pass-Hnb 'UTF-8 stdin supports Hanzi/Vietnamese without BOM or argument exposure'

    $arguments = @('C:\Folder path\file "quoted"\', 'two words', ('C:\' + ([string][char]0x6D77) + ' ' + ([string][char]0x1EAD) + '\'))
    $received = (Invoke-HnbDocker -Arguments (@('args') + $arguments)).StdOut | ConvertFrom-Json
    Assert-Hnb ($received.Count -eq 3 -and $received[0] -ceq $arguments[0] -and $received[1] -ceq $arguments[1] -and $received[2] -ceq $arguments[2]) 'Native argv quoting changed Unicode, spaces, quotes or trailing backslash.'
    Pass-Hnb 'native argv quoting round-trips Unicode, spaces, quotes and trailing backslash'

    [Environment]::SetEnvironmentVariable('LAN_HOST', '0.0.0.0')
    [Environment]::SetEnvironmentVariable('HANNGU_IMAGE', 'wrong-unvalidated-image:latest')
    [Environment]::SetEnvironmentVariable('HNB_SMOKE_UNRELATED', 'preserved')
    $childEnvironment = (Invoke-HnbCompose -Arguments @('config', '--quiet')).StdOut | ConvertFrom-Json
    Assert-Hnb ([string]::IsNullOrEmpty($childEnvironment.lan) -and [string]::IsNullOrEmpty($childEnvironment.image)) 'Inherited environment overrode the validated Compose configuration.'
    Assert-Hnb ($childEnvironment.unrelated -eq 'preserved') 'Unrelated child environment was cleared.'
    Assert-Hnb ([Environment]::GetEnvironmentVariable('LAN_HOST') -eq '0.0.0.0') 'Caller environment was modified.'
    Pass-Hnb 'validated Compose settings cannot be overridden by inherited bind/image variables'

    Add-Type -TypeDefinition @'
using System;
using System.IO;
public sealed class HnbFailingOutput : Stream {
  public override bool CanRead { get { return false; } }
  public override bool CanSeek { get { return false; } }
  public override bool CanWrite { get { return true; } }
  public override long Length { get { return 0; } }
  public override long Position { get { return 0; } set { throw new NotSupportedException(); } }
  public override void Flush() { }
  public override int Read(byte[] buffer, int offset, int count) { throw new NotSupportedException(); }
  public override long Seek(long offset, SeekOrigin origin) { throw new NotSupportedException(); }
  public override void SetLength(long value) { throw new NotSupportedException(); }
  public override void Write(byte[] buffer, int offset, int count) { throw new IOException("Injected output failure."); }
}
'@
    function Open-HnbBinaryOutput { param([string]$Path) return (New-Object HnbFailingOutput) }
    $timer = [Diagnostics.Stopwatch]::StartNew()
    Assert-HnbThrows { Invoke-HnbDocker -Arguments @('flood') -OutputFile (Join-Path $temporary 'failing-output') } 'Failed output transport was accepted.'
    $timer.Stop()
    Assert-Hnb ($timer.Elapsed.TotalSeconds -lt 10) 'Failed output transport left the producer blocked.'
    Set-Item -Path Function:\Open-HnbBinaryOutput -Value $savedBinaryOutput
    Pass-Hnb 'failed binary output stops a blocked producer instead of hanging'
    Write-Host ('Windows helper smoke checks: {0} PASS; actual Windows/NTFS/Docker execution is separate.' -f $passes)
}
finally {
    Set-Item -Path Function:\Invoke-HnbDocker -Value $savedDocker
    Set-Item -Path Function:\Protect-HnbPrivatePath -Value $savedAcl
    Set-Item -Path Function:\Open-HnbBinaryOutput -Value $savedBinaryOutput
    [Environment]::SetEnvironmentVariable('DOCKER_HOST', $savedDockerHost)
    [Environment]::SetEnvironmentVariable('LAN_HOST', $savedLanHost)
    [Environment]::SetEnvironmentVariable('HANNGU_IMAGE', $savedAppImage)
    [Environment]::SetEnvironmentVariable('HNB_SMOKE_UNRELATED', $savedUnrelated)
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Recurse -Force }
}
