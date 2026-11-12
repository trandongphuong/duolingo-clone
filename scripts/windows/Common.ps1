# PowerShell 5.1-compatible transport; keep this file ASCII for Windows PowerShell.
Set-StrictMode -Version Latest

function Protect-HnbText {
    param([AllowEmptyString()][string]$Text)
    if ($null -eq $Text) { return '' }
    foreach ($secret in @($script:HnbSecretValues | Sort-Object Length -Descending)) {
        if (-not [string]::IsNullOrEmpty($secret)) { $Text = $Text.Replace($secret, '[REDACTED]') }
    }
    return $Text
}

function ConvertTo-HnbNativeArgument {
    param([AllowEmptyString()][string]$Value)
    if ($Value.Length -gt 0 -and $Value -notmatch '[\s"]') { return $Value }
    $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
    $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
    return '"' + $escaped + '"'
}

function Protect-HnbPrivatePath {
    param([Parameter(Mandatory = $true)][string]$Path, [switch]$IsDirectory)
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Windows ACL protection requires Windows; this check cannot be certified on another OS.' }
    if ($IsDirectory) { $security = New-Object System.Security.AccessControl.DirectorySecurity }
    else { $security = New-Object System.Security.AccessControl.FileSecurity }
    $security.SetAccessRuleProtection($true, $false)
    $owner = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $security.SetOwner($owner)
    $identities = @($owner, (New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')),
        (New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')))
    foreach ($identity in $identities) {
        $inheritance = [System.Security.AccessControl.InheritanceFlags]::None
        if ($IsDirectory) { $inheritance = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit }
        $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity,
            [System.Security.AccessControl.FileSystemRights]::FullControl, $inheritance,
            [System.Security.AccessControl.PropagationFlags]::None, [System.Security.AccessControl.AccessControlType]::Allow)
        $security.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $Path -AclObject $security -ErrorAction Stop
    if (-not (Get-Acl -LiteralPath $Path).AreAccessRulesProtected) { throw 'Private file ACL protection was not applied.' }
}

function Open-HnbBinaryOutput {
    param([Parameter(Mandatory = $true)][string]$Path)
    return [System.IO.File]::Open($Path, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
}

function Assert-HnbListenAddress {
    param([Parameter(Mandatory = $true)][string]$Address)
    $listener = $null
    if (-not [System.Net.IPAddress]::TryParse($Address, [ref]$listener) -or
        $listener.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
        throw 'ListenAddress must be an approved IPv4 loopback or private LAN address.'
    }
    $octets = $listener.GetAddressBytes()
    $privateAddress = $octets[0] -eq 127 -or $octets[0] -eq 10 -or
        ($octets[0] -eq 172 -and $octets[1] -ge 16 -and $octets[1] -le 31) -or
        ($octets[0] -eq 192 -and $octets[1] -eq 168)
    if (-not $privateAddress) { throw 'Public/all-interface listen addresses are refused. Specify an approved private LAN IPv4 address.' }
}

function Invoke-HnbDocker {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [AllowEmptyString()][string]$InputText,
        [string]$InputFile,
        [string]$OutputFile,
        [switch]$AllowFailure
    )
    if ($InputFile -and $PSBoundParameters.ContainsKey('InputText')) { throw 'Choose InputFile or InputText, not both.' }
    $allArguments = @($script:HnbDockerPrefix) + $Arguments
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $script:HnbDockerPath
    $start.Arguments = (@($allArguments | ForEach-Object {
        $nativeValue = ([string]$_).Replace("`r`n", "`n")
        ConvertTo-HnbNativeArgument $nativeValue
    }) -join ' ')
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    if ($Arguments[0] -eq 'compose') {
        # Compose normally prefers inherited process variables over --env-file.
        # Keep the validated private file authoritative; do not change the
        # caller's environment or Docker/proxy credentials.
        foreach ($key in @('POSTGRES_USER', 'POSTGRES_DB', 'POSTGRES_PASSWORD',
            'SESSION_PASSWORD', 'SESSION_SECURE', 'SESSION_TTL_SECONDS',
            'APP_ORIGIN', 'LAN_HOST', 'LAN_PORT', 'TZ', 'TLS_CERT_FILE', 'TLS_KEY_FILE',
            'HANNGU_IMAGE', 'HANNGU_TOOLS_IMAGE', 'POSTGRES_IMAGE', 'NGINX_IMAGE',
            'COMPOSE_FILE', 'COMPOSE_ENV_FILES', 'COMPOSE_PROJECT_NAME', 'COMPOSE_PROFILES',
            'COMPOSE_COMPATIBILITY', 'COMPOSE_DISABLE_ENV_FILE')) {
            $start.EnvironmentVariables.Remove($key)
        }
    }
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $start
    $outputStream = $null
    $inputStream = $null
    $inputBytes = $null
    $inputTask = $null
    $outputTask = $null
    $errorTask = $null
    $started = $false
    try {
        if ($OutputFile) {
            $outputStream = Open-HnbBinaryOutput -Path $OutputFile
        }
        if (-not $process.Start()) { throw 'Unable to start Docker.' }
        $started = $true
        if ($outputStream) { $outputTask = $process.StandardOutput.BaseStream.CopyToAsync($outputStream) }
        else { $outputTask = $process.StandardOutput.ReadToEndAsync() }
        $errorTask = $process.StandardError.ReadToEndAsync()
        if ($InputFile) {
            $inputStream = [System.IO.File]::OpenRead($InputFile)
            $inputTask = $inputStream.CopyToAsync($process.StandardInput.BaseStream)
        }
        elseif ($PSBoundParameters.ContainsKey('InputText')) {
            $encoding = New-Object System.Text.UTF8Encoding($false)
            $inputBytes = $encoding.GetBytes($InputText)
            $inputTask = $process.StandardInput.BaseStream.WriteAsync($inputBytes, 0, $inputBytes.Length)
        }
        $inputClosed = $false
        if (-not $inputTask) {
            $process.StandardInput.Close()
            $inputClosed = $true
        }
        do {
            # A failed file write must terminate Docker instead of leaving it
            # blocked forever on a stdout pipe that is no longer being drained.
            if ($outputTask.IsFaulted -or $outputTask.IsCanceled -or $errorTask.IsFaulted -or $errorTask.IsCanceled) {
                throw 'Docker output transport failed; the operation was stopped. Check destination storage and permissions.'
            }
            if ($inputTask -and $inputTask.IsCompleted -and -not $inputClosed) {
                $inputTask.GetAwaiter().GetResult()
                $process.StandardInput.Close()
                $inputClosed = $true
            }
            $exited = $process.WaitForExit(100)
        } while (-not $exited)
        if ($inputTask -and -not $inputClosed) { $inputTask.GetAwaiter().GetResult(); $process.StandardInput.Close() }
        $capturedOutput = $outputTask.GetAwaiter().GetResult()
        if ($outputStream) { $capturedOutput = ''; $outputStream.Flush() }
        $capturedError = $errorTask.GetAwaiter().GetResult()
        $result = [PSCustomObject]@{
            ExitCode = $process.ExitCode
            StdOut = (Protect-HnbText ([string]$capturedOutput))
            StdErr = (Protect-HnbText ([string]$capturedError))
        }
        if ($result.ExitCode -ne 0 -and -not $AllowFailure) {
            $detail = $result.StdErr.Trim()
            if ($detail.Length -gt 2000) { $detail = $detail.Substring(0, 2000) }
            throw ('Docker failed with exit code {0}. {1}' -f $result.ExitCode, $detail)
        }
        return $result
    }
    catch {
        if ($started -and -not $process.HasExited) { $process.Kill(); $process.WaitForExit() }
        throw (Protect-HnbText $_.Exception.Message)
    }
    finally {
        if ($started -and -not $process.HasExited) { $process.Kill(); $process.WaitForExit() }
        if ($started) {
            $process.StandardInput.Close()
            $process.StandardOutput.Close()
            $process.StandardError.Close()
        }
        if ($inputStream) { $inputStream.Dispose() }
        if ($outputStream) { $outputStream.Dispose() }
        foreach ($task in @($inputTask, $outputTask, $errorTask)) {
            if ($task -and $task.IsCompleted) { try { $null = $task.GetAwaiter().GetResult() } catch { } }
        }
        if ($inputBytes) { [Array]::Clear($inputBytes, 0, $inputBytes.Length) }
        $process.Dispose()
    }
}

function Get-HnbComposeArguments {
    $arguments = @('compose', '--project-directory', $script:HnbRoot, '--env-file', $script:HnbEnvPath,
        '--project-name', $script:HnbProject, '-f', (Join-Path $script:HnbRoot 'compose.yaml'))
    if ($script:HnbTls) { $arguments += @('-f', (Join-Path $script:HnbRoot 'compose.tls.yaml')) }
    return $arguments
}

function Invoke-HnbCompose {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [AllowEmptyString()][string]$InputText,
        [string]$InputFile,
        [string]$OutputFile,
        [switch]$AllowFailure
    )
    $parameters = @{ Arguments = @((Get-HnbComposeArguments)) + $Arguments; AllowFailure = $AllowFailure }
    foreach ($key in @('InputText', 'InputFile', 'OutputFile')) {
        if ($PSBoundParameters.ContainsKey($key)) { $parameters[$key] = $PSBoundParameters[$key] }
    }
    return Invoke-HnbDocker @parameters
}

function Read-HnbEnvironment {
    param([Parameter(Mandatory = $true)][string]$Path)
    $config = @{}
    $lineNumber = 0
    foreach ($line in [System.IO.File]::ReadAllLines($Path, [System.Text.Encoding]::UTF8)) {
        $lineNumber++
        if ($line -match '^\s*(#.*)?$') { continue }
        if ($line -notmatch '^([A-Z][A-Z0-9_]*)=(.*)$') { throw "Unsupported environment syntax at line $lineNumber; use the generated configuration format." }
        $key = $matches[1]
        $value = $matches[2]
        if ($config.ContainsKey($key)) { throw "Duplicate environment key at line $lineNumber." }
        if ($value.StartsWith("'") -and $value.EndsWith("'")) {
            $value = $value.Substring(1, $value.Length - 2).Replace("\'", "'")
        }
        elseif ($value.StartsWith('"') -and $value.EndsWith('"')) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $config[$key] = $value
    }
    return $config
}

function Initialize-HnbContext {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [string]$EnvironmentFile,
        [string]$ProjectName,
        [switch]$Tls,
        [switch]$RequireEnvironment
    )
    $script:HnbRoot = [System.IO.Path]::GetFullPath($Root)
    if ([string]::IsNullOrWhiteSpace($EnvironmentFile)) { $EnvironmentFile = Join-Path $script:HnbRoot '.env' }
    $script:HnbEnvPath = [System.IO.Path]::GetFullPath($EnvironmentFile)
    $script:HnbTls = [bool]$Tls
    $script:HnbRelease = $null
    $releasePath = Join-Path $script:HnbRoot 'RELEASE.json'
    if (Test-Path -LiteralPath $releasePath -PathType Leaf) {
        $script:HnbRelease = [System.IO.File]::ReadAllText($releasePath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
        if ($script:HnbRelease.platform -ne 'linux/amd64') { throw 'The release platform is unsupported; require linux/amd64.' }
        foreach ($name in @('app', 'tools', 'postgres', 'nginx')) {
            $image = $script:HnbRelease.images.$name
            if ($image.reference -notmatch '^[A-Za-z0-9][A-Za-z0-9_./:@-]*$' -or $image.id -notmatch '^sha256:[a-f0-9]{64}$') { throw 'RELEASE.json has invalid image metadata.' }
        }
    }
    $script:HnbConfig = @{}
    $script:HnbSecretValues = @()
    if (Test-Path -LiteralPath $script:HnbEnvPath -PathType Leaf) {
        $script:HnbConfig = Read-HnbEnvironment $script:HnbEnvPath
        foreach ($key in @('POSTGRES_PASSWORD', 'SESSION_PASSWORD', 'DATABASE_URL', 'DEMO_ADMIN_PASSWORD')) {
            if ($script:HnbConfig.ContainsKey($key)) { $script:HnbSecretValues += $script:HnbConfig[$key] }
        }
    }
    elseif ($RequireEnvironment) { throw 'Configuration is missing. Run -Action Configure first.' }
    if ([string]::IsNullOrWhiteSpace($ProjectName)) {
        if ($script:HnbConfig.ContainsKey('COMPOSE_PROJECT_NAME')) { $ProjectName = $script:HnbConfig.COMPOSE_PROJECT_NAME }
        else { $ProjectName = 'han-ngu-bien-local' }
    }
    if ($ProjectName -notmatch '^[a-z0-9][a-z0-9_-]{0,62}$') { throw 'ProjectName must use 1-63 lowercase letters, digits, underscores or hyphens.' }
    $script:HnbProject = $ProjectName
    $script:HnbDockerPrefix = @()
    $script:HnbDockerPath = 'docker'
}

function Assert-HnbDocker {
    foreach ($name in @('DOCKER_HOST', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH')) {
        if (-not [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($name))) {
            throw "Clear $name before continuing; this entry point only manages a local Docker engine."
        }
    }
    $command = Get-Command docker -CommandType Application -ErrorAction SilentlyContinue
    if (-not $command) { throw 'Docker CLI is missing. Prepare a supported Linux-container engine before continuing.' }
    $script:HnbDockerPath = $command.Source
    $context = (Invoke-HnbDocker -Arguments @('context', 'show')).StdOut.Trim()
    if ($context -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]*$') { throw 'Unable to identify the Docker context.' }
    $endpoint = (Invoke-HnbDocker -Arguments @('context', 'inspect', $context, '--format', '{{.Endpoints.docker.Host}}')).StdOut.Trim()
    if ($endpoint -notmatch '^npipe:/+\./pipe/[A-Za-z0-9_.-]+$') {
        throw 'The selected context is not a local Windows named-pipe engine. Use an approved local Linux-container engine; remote contexts are refused.'
    }
    $script:HnbDockerPrefix = @('--context', $context)
    $platform = (Invoke-HnbDocker -Arguments @('info', '--format', '{{.OSType}}/{{.Architecture}}')).StdOut.Trim()
    if ($platform -notin @('linux/x86_64', 'linux/amd64')) { throw 'This release requires a running Linux/amd64 Docker engine; Windows containers and ARM images are not supported by this package.' }
    $composeText = (Invoke-HnbDocker -Arguments @('compose', 'version', '--short')).StdOut.Trim()
    $composeVersion = $null
    if ($composeText -notmatch '^v?(\d+\.\d+\.\d+)') { throw 'Docker Compose v2 could not be detected.' }
    try { $composeVersion = [version]$matches[1] } catch { throw 'Docker Compose version is invalid.' }
    if ($composeVersion -lt [version]'2.24.4') { throw 'Docker Compose 2.24.4 or newer is required (TLS overlay uses !override).' }
    Write-Host ('Docker context: {0}; platform: {1}; Compose: {2}' -f $context, $platform, $composeVersion)
}

function Get-HnbImageDefinitions {
    $defaults = @(
        @{ Key = 'HANNGU_IMAGE'; Name = 'app'; Reference = 'han-ngu-bien:1.0' },
        @{ Key = 'HANNGU_TOOLS_IMAGE'; Name = 'tools'; Reference = 'han-ngu-bien-tools:1.0' },
        @{ Key = 'POSTGRES_IMAGE'; Name = 'postgres'; Reference = 'postgres:17-alpine' },
        @{ Key = 'NGINX_IMAGE'; Name = 'nginx'; Reference = 'nginx:1.28-alpine' }
    )
    foreach ($item in $defaults) {
        $key = $item.Key
        $reference = $item.Reference
        $expectedId = $null
        if ($script:HnbRelease) {
            $reference = $script:HnbRelease.images.($item.Name).reference
            $expectedId = $script:HnbRelease.images.($item.Name).id
        }
        if ($script:HnbConfig.ContainsKey($key)) { $reference = $script:HnbConfig[$key] }
        if ($reference -notmatch '^[A-Za-z0-9][A-Za-z0-9_./:@-]*$') { throw "Invalid image reference in $key." }
        if ($script:HnbRelease -and $reference -cne $script:HnbRelease.images.($item.Name).reference) { throw "Image configuration $key does not match RELEASE.json; preserve the previous release and configure this package separately." }
        Write-Output ([PSCustomObject]@{ Key = $key; Reference = $reference; ExpectedId = $expectedId })
    }
}

function Get-HnbImages {
    foreach ($image in @(Get-HnbImageDefinitions)) { Write-Output $image.Reference }
}

function Assert-HnbImages {
    foreach ($image in @(Get-HnbImageDefinitions)) {
        $reference = $image.Reference
        $result = Invoke-HnbDocker -Arguments @('image', 'inspect', '--format', '{{.Id}} {{.Os}}/{{.Architecture}}', $reference) -AllowFailure
        if ($result.ExitCode -ne 0) { throw "Required image is not loaded: $reference. Run -Action LoadImages with a trusted release archive." }
        if ($result.StdOut.Trim() -notmatch '^(sha256:[a-f0-9]{64}) linux/amd64$') { throw "Image architecture mismatch: $reference. Use a release matching the engine." }
        if ($image.ExpectedId -and $matches[1] -cne $image.ExpectedId) { throw "Loaded image content does not match RELEASE.json: $reference." }
    }
}

function Assert-HnbConfiguration {
    foreach ($key in @('POSTGRES_PASSWORD', 'SESSION_PASSWORD', 'APP_ORIGIN', 'LAN_HOST', 'LAN_PORT')) {
        if (-not $script:HnbConfig.ContainsKey($key) -or [string]::IsNullOrEmpty($script:HnbConfig[$key])) { throw "Missing $key in configuration." }
    }
    if ($script:HnbConfig.SESSION_PASSWORD.Length -lt 32) { throw 'SESSION_PASSWORD must contain at least 32 characters.' }
    if ($script:HnbConfig.POSTGRES_PASSWORD -notmatch '^[a-fA-F0-9]{32,}$') { throw 'POSTGRES_PASSWORD must be hexadecimal (at least 32 characters) for the Compose database URL.' }
    Assert-HnbListenAddress -Address $script:HnbConfig.LAN_HOST
    $origin = $null
    if (-not [Uri]::TryCreate($script:HnbConfig.APP_ORIGIN, [UriKind]::Absolute, [ref]$origin) -or
        $origin.UserInfo -or $origin.Query -or $origin.Fragment -or $origin.AbsolutePath -ne '/' -or
        $origin.GetLeftPart([UriPartial]::Authority) -cne $script:HnbConfig.APP_ORIGIN) { throw 'APP_ORIGIN must be an exact HTTP(S) origin without a path, query or credentials.' }
    if ($script:HnbTls) {
        if ($origin.Scheme -ne 'https' -or $script:HnbConfig.SESSION_SECURE -ne 'true') { throw 'TLS requires an HTTPS APP_ORIGIN and SESSION_SECURE=true.' }
        foreach ($key in @('TLS_CERT_FILE', 'TLS_KEY_FILE')) {
            if (-not $script:HnbConfig.ContainsKey($key) -or -not [System.IO.Path]::IsPathRooted($script:HnbConfig[$key]) -or
                -not (Test-Path -LiteralPath $script:HnbConfig[$key] -PathType Leaf)) { throw "TLS requires an existing absolute path in $key." }
        }
    }
    else {
        if ($origin.Scheme -ne 'http' -or $origin.Host -notin @('localhost', '127.0.0.1') -or
            $script:HnbConfig.LAN_HOST -ne '127.0.0.1' -or $script:HnbConfig.SESSION_SECURE -ne 'false') {
            throw 'Without -Tls, only an isolated HTTP loopback configuration is supported. Use the TLS overlay for LAN HTTPS.'
        }
    }
    if ($script:HnbConfig.LAN_PORT -notmatch '^[1-9][0-9]{0,4}$' -or [int]$script:HnbConfig.LAN_PORT -gt 65535 -or
        $origin.Port -ne [int]$script:HnbConfig.LAN_PORT) { throw 'LAN_PORT must match the APP_ORIGIN port.' }
    [void](Invoke-HnbCompose -Arguments @('config', '--quiet'))
}

function Wait-HnbDatabase {
    param([int]$Seconds = 180)
    $until = [DateTime]::UtcNow.AddSeconds($Seconds)
    do {
        $probe = Invoke-HnbCompose -Arguments @('exec', '-T', 'db', 'sh', '-c', 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"') -AllowFailure
        if ($probe.ExitCode -eq 0) { return }
        Start-Sleep -Seconds 2
    } while ([DateTime]::UtcNow -lt $until)
    throw 'PostgreSQL did not become ready; inspect service status before retrying. No data was removed.'
}

$script:HnbSecretValues = @()
$script:HnbDockerPrefix = @()
$script:HnbDockerPath = 'docker'
