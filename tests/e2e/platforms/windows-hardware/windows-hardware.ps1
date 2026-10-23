# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# The published Windows binary on a real Windows host (#1765). The Windows CI suites (tests/e2e/platforms/windows and
# tests/e2e/platforms/windows-binary) prove the contract on a GitHub-hosted runner: a source build and the release candidate.
# This script proves it on the machine a developer actually uses: the published tdk-windows-amd64.exe, installed the way a
# user installs it, with the paths, PATH lookup and filesystem that a runner never has.
#
# Run it on Windows, from the repository root:
#   pwsh -NoProfile -File tests/e2e/platforms/windows-hardware/windows-hardware.ps1 -Case all
#   powershell -NoProfile -File tests/e2e/platforms/windows-hardware/windows-hardware.ps1 -Case WH4
# tests/e2e/platforms/windows-hardware/run.sh calls it once per case in CI.
#
# Inputs (environment variables override the defaults):
#   FLISK_WINDOWS_RELEASE       release tag to test: "latest" (default) or "v1.3.204"
#   FLISK_WINDOWS_EXE           test this exe instead of the published one (a local build); the published checksums do not
#                               apply to it, so WH1 records its SHA-256 instead of comparing it
#   FLISK_WINDOWS_WORK_DIR      scratch directory (default: %TEMP%\flisk-windows-hardware)
#   FLISK_HARDWARE_REPORT       where the findings report is written (default: <work dir>\windows-hardware-findings.md)
#   FLISK_WINDOWS_INSTALLER     the official installer to run (default: https://flisk.sh/install.ps1)
#   FLISK_WINDOWS_DOWNLOAD_BASE where the release assets come from (default: the flisk-sh/releases download URL)
#   FLISK_WINDOWS_RELEASE_REPOSITORY the repository the release comes from (default: flisk-sh/releases)
#   FLISK_WINDOWS_GITHUB_TOKEN  a token for the GitHub API, so the release lookup does not hit the anonymous rate limit
param(
  [ValidateSet('WH1', 'WH2', 'WH3', 'WH4', 'WH5', 'WH6', 'all')]
  [string]$Case = 'all',
  [string]$Release = '',
  [string]$Exe = '',
  [string]$WorkDir = '',
  [string]$Report = ''
)

$ErrorActionPreference = 'Stop'

# --------------------------------------------------------------------------------------------------- configuration

function Get-Setting {
  param([string]$Parameter, [string]$EnvironmentName, [string]$Default)
  if ($Parameter) { return $Parameter }
  $fromEnvironment = [Environment]::GetEnvironmentVariable($EnvironmentName)
  if ($fromEnvironment) { return $fromEnvironment }
  return $Default
}

$script:Release = Get-Setting $Release 'FLISK_WINDOWS_RELEASE' 'latest'
$script:WorkDir = Get-Setting $WorkDir 'FLISK_WINDOWS_WORK_DIR' (Join-Path ([System.IO.Path]::GetTempPath()) 'flisk-windows-hardware')
$script:Report = Get-Setting $Report 'FLISK_HARDWARE_REPORT' (Join-Path $script:WorkDir 'windows-hardware-findings.md')
$script:LocalExe = Get-Setting $Exe 'FLISK_WINDOWS_EXE' ''
$script:InstallerUrl = Get-Setting '' 'FLISK_WINDOWS_INSTALLER' 'https://flisk.sh/install.ps1'
$script:DownloadBase = Get-Setting '' 'FLISK_WINDOWS_DOWNLOAD_BASE' 'https://github.com/flisk-sh/releases/releases/download'
$script:ReleaseRepository = Get-Setting '' 'FLISK_WINDOWS_RELEASE_REPOSITORY' 'flisk-sh/releases'
$script:ResultsFile = Join-Path $script:WorkDir 'results.jsonl'

# Windows PowerShell 5.1 negotiates TLS 1.0 by default, which GitHub refuses.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
if ([enum]::GetNames([Net.SecurityProtocolType]) -contains 'Tls13') {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls13
}

New-Item -ItemType Directory -Force -Path $script:WorkDir | Out-Null

# --------------------------------------------------------------------------------------------------- helpers

function Write-Step {
  param([string]$Message)
  Write-Host "== $Message"
}

function Get-ToolVersion {
  param([string]$Tool, [string[]]$Arguments = @('--version'))
  $command = Get-Command $Tool -ErrorAction SilentlyContinue
  if (-not $command) { return "${Tool}: not on PATH" }
  try {
    $output = & $command.Source @Arguments 2>&1 | Select-Object -First 1
    return ("{0}: {1}" -f $Tool, ($output | Out-String).Trim())
  } catch {
    return "${Tool}: found but not runnable ($($_.Exception.Message))"
  }
}

function Get-WindowsFacts {
  $windows = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -ErrorAction SilentlyContinue
  $facts = [ordered]@{}
  if ($windows) {
    $facts['Windows'] = "{0} {1} (build {2}.{3})" -f $windows.ProductName, $windows.DisplayVersion, $windows.CurrentBuild, $windows.UBR
    $facts['Edition'] = $windows.EditionID
  } else {
    $facts['Windows'] = [System.Environment]::OSVersion.VersionString
  }
  $facts['Architecture'] = "$env:PROCESSOR_ARCHITECTURE (PROCESSOR_ARCHITEW6432=$env:PROCESSOR_ARCHITEW6432)"
  $facts['PowerShell'] = "{0} {1} ({2})" -f $PSVersionTable.PSVersion, $PSVersionTable.PSEdition, (Split-Path -Leaf (Get-Process -Id $PID).Path)
  $facts['Docker'] = Get-ToolVersion 'docker'
  $facts['Tilt'] = Get-ToolVersion 'tilt' @('version')
  $facts['Bun'] = Get-ToolVersion 'bun'
  $facts['Node'] = Get-ToolVersion 'node'
  $isAdmin = 'unknown'
  if ($env:OS -eq 'Windows_NT') {
    $principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    $isAdmin = if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { 'yes' } else { 'no' }
  }
  $facts['Elevated'] = $isAdmin
  return $facts
}

function Invoke-Exe {
  # Run a program and capture its streams and exit code separately: a JSON command prints its report on stdout and its
  # message on stderr, and merging them would make the report unparseable.
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [string[]]$Arguments = @(),
    [string]$WorkingDirectory = '',
    [int]$TimeoutSeconds = 300
  )
  $stamp = (($Arguments -join ' ') -replace '[^A-Za-z0-9]+', '-').Trim('-')
  if ($stamp.Length -gt 60) { $stamp = $stamp.Substring(0, 60) }
  $prefix = Join-Path $script:WorkDir ("run-$stamp")
  $stdoutFile = "$prefix.out"
  $stderrFile = "$prefix.err"
  $start = @{
    FilePath = $Path
    ArgumentList = $Arguments
    NoNewWindow = $true
    PassThru = $true
    RedirectStandardOutput = $stdoutFile
    RedirectStandardError = $stderrFile
  }
  if ($WorkingDirectory) { $start['WorkingDirectory'] = $WorkingDirectory }
  $process = Start-Process @start
  if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
    try { $process.Kill() } catch { }
    throw "$Path $($Arguments -join ' ') did not finish within ${TimeoutSeconds}s"
  }
  $process.WaitForExit()
  $stdout = if (Test-Path $stdoutFile) { [string](Get-Content -LiteralPath $stdoutFile -Raw) } else { '' }
  $stderr = if (Test-Path $stderrFile) { [string](Get-Content -LiteralPath $stderrFile -Raw) } else { '' }
  return [pscustomobject]@{
    ExitCode = $process.ExitCode
    StdOut = $stdout
    StdErr = $stderr
    Text = ($stdout + "`n" + $stderr)
  }
}

function Assert-Text {
  # Assert-Text <text> <pattern> <message>: the text must match the pattern. With -NotMatch it must not.
  param([string]$Text, [string]$Pattern, [string]$Message, [switch]$NotMatch)
  $matched = $Text -match $Pattern
  if ($NotMatch) { $matched = -not $matched }
  if (-not $matched) { throw "$Message (pattern: $Pattern)" }
}

function Get-ExpectedHash {
  # The release writes checksums.txt with shasum, so the hash and the name are separated by two spaces.
  param([string]$ChecksumFile, [string]$AssetName)
  $found = @()
  foreach ($line in Get-Content -LiteralPath $ChecksumFile) {
    if ($line -match '^(?<hash>[0-9A-Fa-f]{64})[ \t]{2}(?<name>.+)$' -and $Matches.name -eq $AssetName) {
      $found += $Matches.hash.ToLowerInvariant()
    }
  }
  if ($found.Count -ne 1) { throw "checksums.txt must contain exactly one entry for $AssetName" }
  return $found[0]
}

function Get-LatestReleaseTag {
  # The "latest" page redirects to the release it points at, and the redirect does not use the API rate limit. The API
  # allows 60 anonymous requests an hour per address, which a shared runner address runs out of.
  param([string]$Repository)
  $parameters = @{ Uri = "https://github.com/$Repository/releases/latest" }
  if ($PSVersionTable.PSVersion.Major -lt 6) { $parameters['UseBasicParsing'] = $true }
  $response = Invoke-WebRequest @parameters
  $final = $null
  if ($response.BaseResponse.RequestMessage) { $final = $response.BaseResponse.RequestMessage.RequestUri.AbsoluteUri }
  elseif ($response.BaseResponse.ResponseUri) { $final = $response.BaseResponse.ResponseUri.AbsoluteUri }
  if (-not $final -or $final -notmatch '/releases/tag/(?<tag>[^/]+)$') { return $null }
  return $Matches.tag
}

function Get-ReleaseTag {
  if ($script:Release -and $script:Release -ne 'latest') { return $script:Release }
  try {
    $tag = Get-LatestReleaseTag $script:ReleaseRepository
    if ($tag) { return $tag }
  } catch {
    Write-Step "the release redirect did not work: $($_.Exception.Message)"
  }
  $headers = @{ 'User-Agent' = 'flisk-windows-hardware-e2e' }
  if ($env:FLISK_WINDOWS_GITHUB_TOKEN) { $headers['Authorization'] = "Bearer $env:FLISK_WINDOWS_GITHUB_TOKEN" }
  try {
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$script:ReleaseRepository/releases/latest" -Headers $headers
  } catch {
    throw "could not resolve the latest release: $($_.Exception.Message). Pin a tag in FLISK_WINDOWS_RELEASE, or set FLISK_WINDOWS_GITHUB_TOKEN."
  }
  if (-not $release.tag_name) { throw 'The GitHub API returned no tag for the latest release.' }
  return $release.tag_name
}

function Get-ReleaseAsset {
  param([string]$Tag, [string]$Name)
  $dir = Join-Path $script:WorkDir 'release'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $path = Join-Path $dir $Name
  if (-not (Test-Path -LiteralPath $path) -or (Get-Item -LiteralPath $path).Length -eq 0) {
    $url = "$script:DownloadBase/$Tag/$Name"
    Write-Step "downloading $url"
    $parameters = @{ Uri = $url; OutFile = $path }
    if ($PSVersionTable.PSVersion.Major -lt 6) { $parameters['UseBasicParsing'] = $true }
    Invoke-WebRequest @parameters
  }
  return $path
}

function Get-PeSignature {
  param([string]$Path)
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $header = New-Object byte[] 2
    [void]$stream.Read($header, 0, 2)
    return $header
  } finally {
    $stream.Dispose()
  }
}

function Get-ReleaseLayout {
  # The published layout: tdk.exe with the tdk-cli engine directory beside it, the way install.ps1 leaves it.
  $tag = Get-ReleaseTag
  $exeAsset = Get-ReleaseAsset $tag 'tdk-windows-amd64.exe'
  $engineAsset = Get-ReleaseAsset $tag 'tdk-cli-engine.tar.gz'
  $checksums = Get-ReleaseAsset $tag 'checksums.txt'
  $dir = Join-Path $script:WorkDir 'release'
  $exe = Join-Path $dir 'tdk.exe'
  Copy-Item -LiteralPath $exeAsset -Destination $exe -Force
  $engine = Join-Path $dir 'tdk-cli'
  if (-not (Test-Path -LiteralPath (Join-Path $engine 'shared-platform-engineering'))) {
    & (Get-TarPath) -xzf $engineAsset -C $dir
    if ($LASTEXITCODE -ne 0) { throw "tar could not extract $engineAsset" }
  }
  if (-not (Test-Path -LiteralPath $engine)) { throw 'the engine archive did not contain tdk-cli' }
  return @{ Tag = $tag; Exe = $exe; Engine = $engine; Checksums = $checksums }
}

function Get-TarPath {
  # The Windows system tar (bsdtar) reads "C:\..." as a path. The GNU tar that Git for Windows ships reads it as a remote
  # host and fails with "Cannot connect to C: resolve failed", so the system tar is the one to use. The repository's own
  # release check does the same (tests/e2e/platforms/windows-binary/run.sh puts C:\Windows\System32 first).
  $systemTar = Join-Path $env:SystemRoot 'System32\tar.exe'
  if (Test-Path -LiteralPath $systemTar) { return $systemTar }
  $tar = Get-Command tar.exe -ErrorAction SilentlyContinue
  if (-not $tar) { throw 'tar.exe is required to unpack the engine archive. Windows 10 1803 and newer ship it.' }
  return $tar.Source
}

function Get-NativePath {
  # The PATH a normal PowerShell window has: without the Git for Windows toolchain directories, whose GNU tar cannot
  # read a "C:\..." path.
  param([string]$Path)
  $kept = @()
  foreach ($entry in ($Path -split ';')) {
    if (-not $entry) { continue }
    if ($entry -match '(?i)[\\/]usr[\\/]bin|[\\/]mingw|msys|cygwin') { continue }
    $kept += $entry
  }
  return ($kept -join ';')
}

function Get-ExpectedVersion {
  param([string]$Tag)
  return ($Tag -replace '^v', '') -replace '-.*$', ''
}

function Get-RuntimeProcesses {
  return @(Get-Process -Name @('tilt', 'dockerd', 'containerd', 'com.docker.backend') -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty Id)
}

function Get-ContainerIds {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { return @() }
  $ids = @(& docker ps -aq 2>$null | Where-Object { $_ })
  if ($LASTEXITCODE -ne 0) { return @() }
  return $ids
}

function Get-RecordedResults {
  if (-not (Test-Path -LiteralPath $script:ResultsFile)) { return @() }
  return @(Get-Content -LiteralPath $script:ResultsFile | Where-Object { $_ } | ForEach-Object { $_ | ConvertFrom-Json })
}

function Write-FindingsReport {
  $results = Get-RecordedResults
  $facts = Get-WindowsFacts
  $lines = @(
    '# Windows hardware findings',
    '',
    'Generated by `tests/e2e/platforms/windows-hardware` (issue #1765). Each case is one row; a FAIL row carries the reason.',
    '',
    '| Field | Value |',
    '| --- | --- |'
  )
  foreach ($key in $facts.Keys) { $lines += "| $key | $($facts[$key]) |" }
  $lines += "| Release tested | $($script:Release) |"
  $lines += "| Suite run (UTC) | $((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')) |"
  $lines += ''
  $lines += '| Case | Check | Result | Notes |'
  $lines += '| --- | --- | --- | --- |'
  foreach ($result in $results) {
    $parts = @()
    if ($result.Detail) { $parts += [string]$result.Detail }
    $parts += @($result.Observations)
    $note = (($parts -join '; ') -replace '\|', '/')
    $lines += "| $($result.Case) | $($result.Title) | $($result.Status) | $note |"
  }
  $lines += ''
  $lines += 'The raw per-case output sits next to this report (`run-*.out`, `run-*.err`).'
  $reportDirectory = Split-Path -Parent $script:Report
  if ($reportDirectory) { New-Item -ItemType Directory -Force -Path $reportDirectory | Out-Null }
  Set-Content -LiteralPath $script:Report -Value ($lines -join "`n") -Encoding UTF8
  # The raw output belongs with the report, so the artifact holds the evidence and not only the summary.
  if ($reportDirectory) {
    Get-ChildItem -LiteralPath $script:WorkDir -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -like 'run-*' -or $_.Name -like 'installer.*' } |
      Copy-Item -Destination $reportDirectory -Force
  }
  Write-Step "findings written to $script:Report"
}

function Save-Result {
  param([string]$CaseId, [string]$Title, [string]$Status, [string]$Detail, [string[]]$Observations = @())
  $record = [ordered]@{ Case = $CaseId; Title = $Title; Status = $Status; Detail = $Detail; Observations = $Observations }
  # A case that runs again replaces its old row, so the report holds one row per case.
  $records = @(Get-RecordedResults | Where-Object { $_.Case -ne $CaseId })
  $records += ($record | ConvertTo-Json -Compress | ConvertFrom-Json)
  Set-Content -LiteralPath $script:ResultsFile -Value ($records | ForEach-Object { $_ | ConvertTo-Json -Compress }) -Encoding UTF8
  Write-FindingsReport
}

# --------------------------------------------------------------------------------------------------- the cases

function Invoke-Wh1 {
  # WH1: the published artifacts are the ones the release signed. A download that is truncated, swapped or served from a
  # different mirror must not pass.
  Write-Step 'WH1 published release integrity'
  if ($script:LocalExe) {
    if (-not (Test-Path -LiteralPath $script:LocalExe)) { throw "$script:LocalExe does not exist" }
    $hash = (Get-FileHash -LiteralPath $script:LocalExe -Algorithm SHA256).Hash.ToLowerInvariant()
    $header = Get-PeSignature $script:LocalExe
    if ($header[0] -ne 0x4D -or $header[1] -ne 0x5A) { throw "$script:LocalExe is not a PE executable (missing MZ signature)" }
    return @{
      Detail = "local exe $script:LocalExe sha256 $hash"
      Observations = @('the local exe is not a published release, so checksums.txt does not cover it')
    }
  }
  $tag = Get-ReleaseTag
  $checksums = Get-ReleaseAsset $tag 'checksums.txt'
  $exeAsset = Get-ReleaseAsset $tag 'tdk-windows-amd64.exe'
  $engineAsset = Get-ReleaseAsset $tag 'tdk-cli-engine.tar.gz'
  $exeHash = (Get-FileHash -LiteralPath $exeAsset -Algorithm SHA256).Hash.ToLowerInvariant()
  $engineHash = (Get-FileHash -LiteralPath $engineAsset -Algorithm SHA256).Hash.ToLowerInvariant()
  $expectedExe = Get-ExpectedHash $checksums 'tdk-windows-amd64.exe'
  $expectedEngine = Get-ExpectedHash $checksums 'tdk-cli-engine.tar.gz'
  if ($exeHash -ne $expectedExe) { throw "SHA-256 mismatch for tdk-windows-amd64.exe: expected $expectedExe, got $exeHash" }
  if ($engineHash -ne $expectedEngine) { throw "SHA-256 mismatch for tdk-cli-engine.tar.gz: expected $expectedEngine, got $engineHash" }
  $header = Get-PeSignature $exeAsset
  if ($header[0] -ne 0x4D -or $header[1] -ne 0x5A) { throw 'tdk-windows-amd64.exe is not a PE executable (missing MZ signature)' }
  return @{
    Detail = "release $tag, exe sha256 $exeHash"
    Observations = @("engine archive sha256 $engineHash")
  }
}

function Invoke-Installer {
  # Run the official installer in its own shell, with the given PATH, and report what it did.
  param([string]$InstallDir, [string]$Path)
  $installer = Join-Path $script:WorkDir 'install.ps1'
  if (-not (Test-Path -LiteralPath $installer)) {
    $parameters = @{ Uri = $script:InstallerUrl; OutFile = $installer }
    if ($PSVersionTable.PSVersion.Major -lt 6) { $parameters['UseBasicParsing'] = $true }
    Invoke-WebRequest @parameters
  }
  $shell = Get-Command pwsh -ErrorAction SilentlyContinue
  $shellExe = if ($shell) { $shell.Source } else { (Get-Process -Id $PID).Path }
  $stdoutFile = Join-Path $script:WorkDir 'installer.out'
  $stderrFile = Join-Path $script:WorkDir 'installer.err'
  $userPathBefore = [Environment]::GetEnvironmentVariable('Path', 'User')
  $pathBefore = $env:PATH
  try {
    $env:TDK_INSTALL_DIR = $InstallDir
    $env:PATH = $Path
    $process = Start-Process -FilePath $shellExe -ArgumentList @('-NoProfile', '-File', "`"$installer`"") -NoNewWindow -PassThru `
      -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile
    if (-not $process.WaitForExit(600 * 1000)) {
      try { $process.Kill() } catch { }
      throw 'the installer did not finish within 600s'
    }
    $process.WaitForExit()
    $stdout = if (Test-Path $stdoutFile) { [string](Get-Content -LiteralPath $stdoutFile -Raw) } else { '' }
    $stderr = if (Test-Path $stderrFile) { [string](Get-Content -LiteralPath $stderrFile -Raw) } else { '' }
    return [pscustomobject]@{
      ExitCode = $process.ExitCode
      StdOut = $stdout
      StdErr = $stderr
      Shell = (Split-Path -Leaf $shellExe)
      UserPathAfter = [Environment]::GetEnvironmentVariable('Path', 'User')
    }
  } finally {
    Remove-Item Env:TDK_INSTALL_DIR -ErrorAction SilentlyContinue
    $env:PATH = $pathBefore
    # The installer appends the install directory to the user PATH. Put the machine back the way it was.
    [Environment]::SetEnvironmentVariable('Path', $userPathBefore, 'User')
  }
}

function Invoke-Wh2 {
  # WH2: the official installer on this machine. It downloads the release, verifies the checksum, unpacks the engine next
  # to the exe, adds the install directory to the user PATH and runs the exe. The user PATH is restored afterwards.
  Write-Step 'WH2 the official installer on this machine'
  $installDir = Join-Path $script:WorkDir 'flisk install'
  if (Test-Path -LiteralPath $installDir) { Remove-Item -Recurse -Force -LiteralPath $installDir }
  New-Item -ItemType Directory -Force -Path $installDir | Out-Null

  # A PowerShell window on a normal Windows install has no Git for Windows toolchain directory on its PATH. Where one is
  # there (Git Bash, or a shell started from it), the installer picks Git's GNU tar, which cannot read a "C:\..." path.
  $nativePath = Get-NativePath $env:PATH
  $result = Invoke-Installer $installDir $nativePath
  if ($result.ExitCode -ne 0) { throw "install.ps1 exited $($result.ExitCode): $($result.StdErr)" }

  $exe = Join-Path $installDir 'tdk.exe'
  if (-not (Test-Path -LiteralPath $exe)) { throw "the installer did not place tdk.exe in $installDir" }
  $engine = Join-Path $installDir 'tdk-cli'
  if (-not (Test-Path -LiteralPath (Join-Path $engine 'shared-platform-engineering'))) {
    throw 'the installer did not unpack the tdk-cli engine next to tdk.exe'
  }
  $pathEntries = @(([string]$result.UserPathAfter) -split ';' | Where-Object { $_ })
  $onPath = @($pathEntries | Where-Object { $_.TrimEnd('\') -ieq $installDir.TrimEnd('\') }).Count -gt 0
  if (-not $onPath) { throw 'the installer did not add the install directory to the user PATH' }

  $version = Invoke-Exe $exe @('--version')
  if ($version.ExitCode -ne 0) { throw "tdk.exe --version exited $($version.ExitCode): $($version.Text)" }
  $assets = Invoke-Exe $exe @('runtime', '--check-assets', '--json')
  if ($assets.ExitCode -ne 0) { throw "tdk.exe runtime --check-assets exited $($assets.ExitCode): $($assets.Text)" }
  $report = $assets.StdOut | ConvertFrom-Json
  if (-not $report.ok) { throw "the installed runtime assets are incomplete: $($assets.StdOut)" }

  $observations = @("the installer $script:InstallerUrl ran with $($result.Shell) and installed the latest release")

  # The same installer, with the PATH this process actually has. On a machine with the Git for Windows toolchain on the
  # PATH the installer picks Git's GNU tar and the extraction fails. Record it instead of hiding it.
  if ($nativePath -ne $env:PATH) {
    $gitBashDir = Join-Path $script:WorkDir 'flisk install with git bash'
    if (Test-Path -LiteralPath $gitBashDir) { Remove-Item -Recurse -Force -LiteralPath $gitBashDir }
    New-Item -ItemType Directory -Force -Path $gitBashDir | Out-Null
    $gitBashResult = Invoke-Installer $gitBashDir $env:PATH
    if ($gitBashResult.ExitCode -eq 0) {
      $observations += 'with the Git for Windows toolchain on the PATH the installer still succeeds'
    } else {
      $firstLine = ($gitBashResult.StdErr -split "`n" | Where-Object { $_.Trim() } | Select-Object -First 1)
      $observations += "with the Git for Windows toolchain on the PATH the installer fails: $($firstLine.Trim()) (flisk-sh/website#67)"
    }
  }

  return @{
    Detail = "installed to $installDir, version $($version.StdOut.Trim())"
    Observations = $observations
  }
}

function Invoke-Wh3 {
  # WH3: the published exe reports the release version and finds its own bundled engine.
  Write-Step 'WH3 version and bundled runtime assets'
  if ($script:LocalExe) {
    $exe = $script:LocalExe
    $expected = ''
  } else {
    $layout = Get-ReleaseLayout
    $exe = $layout.Exe
    $expected = Get-ExpectedVersion $layout.Tag
  }
  $version = Invoke-Exe $exe @('--version')
  if ($version.ExitCode -ne 0) { throw "tdk.exe --version exited $($version.ExitCode): $($version.Text)" }
  $printed = $version.StdOut.Trim()
  if (-not $printed) { throw 'tdk.exe --version printed nothing' }
  if ($expected -and $printed -ne $expected) { throw "tdk.exe --version printed $printed, but the release is $expected" }

  $assets = Invoke-Exe $exe @('runtime', '--check-assets', '--json')
  if ($assets.ExitCode -ne 0) { throw "tdk.exe runtime --check-assets exited $($assets.ExitCode): $($assets.Text)" }
  $report = $assets.StdOut | ConvertFrom-Json
  if (-not $report.ok) { throw "the bundled runtime assets are incomplete: $($assets.StdOut)" }
  $assetRoot = [string]$report.assetRoot
  if (-not $assetRoot) { throw 'tdk.exe runtime --check-assets --json printed no assetRoot' }
  # The engine sits in the tdk-cli directory next to the exe, the way install.ps1 leaves it.
  $expectedRoot = (Resolve-Path -LiteralPath (Join-Path (Split-Path -Parent $exe) 'tdk-cli')).Path
  $actualRoot = (Resolve-Path -LiteralPath $assetRoot).Path
  if (-not [string]::Equals($actualRoot, $expectedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "the engine root is $actualRoot, but it must sit next to the exe in $expectedRoot"
  }
  $text = Invoke-Exe $exe @('runtime', '--check-assets')
  if ($text.ExitCode -ne 0) { throw "tdk.exe runtime --check-assets exited $($text.ExitCode): $($text.Text)" }
  return @{
    Detail = "version $printed, engine root $actualRoot"
    Observations = @()
  }
}

function Invoke-Wh4 {
  # WH4: native Windows refuses to start a stack, says why, and starts nothing while saying it.
  Write-Step 'WH4 the native Windows refusal contract'
  if ($script:LocalExe) {
    $exe = $script:LocalExe
  } else {
    $layout = Get-ReleaseLayout
    $exe = $layout.Exe
  }
  $workDir = Join-Path $script:WorkDir 'refusal'
  New-Item -ItemType Directory -Force -Path $workDir | Out-Null

  $doctor = Invoke-Exe $exe @('doctor') $workDir
  if ($doctor.ExitCode -eq 0) { throw 'tdk doctor succeeded on native Windows; it must refuse' }
  Assert-Text $doctor.Text 'WSL2' 'tdk doctor did not point at WSL2'
  Assert-Text $doctor.Text 'Ubuntu' 'tdk doctor did not point at WSL2 Ubuntu'
  # This case runs the published release (run.sh), which does not contain unreleased
  # doctor diagnostics. Those are asserted on the source build in native-refusal.ps1.

  $doctorJson = Invoke-Exe $exe @('doctor', '--json') $workDir
  if ($doctorJson.ExitCode -eq 0) { throw 'tdk doctor --json succeeded on native Windows; it must refuse' }
  try {
    $report = $doctorJson.StdOut | ConvertFrom-Json
  } catch {
    throw "tdk doctor --json did not print one JSON report on stdout: $($doctorJson.StdOut)"
  }
  $nativeCheck = @($report.data.checks | Where-Object { $_.name -eq 'Native Windows support' })
  if ($nativeCheck.Count -ne 1) { throw 'tdk doctor --json did not report the native Windows finding' }
  if ($nativeCheck[0].didPass -ne $false) { throw 'tdk doctor --json reported the native Windows finding as passing' }

  $processesBefore = Get-RuntimeProcesses
  $containersBefore = Get-ContainerIds

  # Each entry is one command that must refuse. The leading comma keeps PowerShell from flattening the inner arrays.
  $refusals = @(
    , @('up')
    , @('up', '--dry-run')
    , @('up', 'shop')
  )
  foreach ($arguments in $refusals) {
    $label = "tdk $($arguments -join ' ')"
    $result = Invoke-Exe $exe $arguments $workDir
    if ($result.ExitCode -eq 0) { throw "$label succeeded on native Windows; it must refuse" }
    Assert-Text $result.Text 'WSL2' "$label did not point at WSL2"
    Assert-Text $result.Text 'Ubuntu' "$label did not point at WSL2 Ubuntu"
    Assert-Text $result.Text '(?i)inspect-only' "$label did not say that native Windows is inspect-only"
    Assert-Text $result.Text '(?im)^(Starting|Running tilt up)' "$label printed a landscape startup message" -NotMatch
  }

  $processesAfter = Get-RuntimeProcesses
  $newProcesses = @($processesAfter | Where-Object { $_ -notin $processesBefore })
  if ($newProcesses.Count -gt 0) { throw "the refused commands started runtime processes: $($newProcesses -join ', ')" }
  $containersAfter = Get-ContainerIds
  $newContainers = @($containersAfter | Where-Object { $_ -notin $containersBefore })
  if ($newContainers.Count -gt 0) { throw "the refused commands started containers: $($newContainers -join ', ')" }

  return @{
    Detail = 'doctor, up, up --dry-run and up shop all refused with WSL2 guidance and started nothing'
    Observations = @()
  }
}

function Invoke-Wh5 {
  # WH5: what a hosted runner cannot show. The exe has to start from a path with a space in it, resolve through PATH, and
  # keep its refusal in a project directory whose own path has a space.
  Write-Step 'WH5 the host: paths, PATH lookup and a project directory with a space'
  if ($script:LocalExe) {
    $exe = $script:LocalExe
  } else {
    $layout = Get-ReleaseLayout
    $exe = $layout.Exe
  }
  $observations = @()

  $installDir = Join-Path $script:WorkDir 'flisk install with spaces'
  New-Item -ItemType Directory -Force -Path $installDir | Out-Null
  $spacedExe = Join-Path $installDir 'tdk.exe'
  Copy-Item -LiteralPath $exe -Destination $spacedExe -Force
  $sourceEngine = Join-Path (Split-Path -Parent $exe) 'tdk-cli'
  if (Test-Path -LiteralPath $sourceEngine) {
    $engine = Join-Path $installDir 'tdk-cli'
    if (Test-Path -LiteralPath $engine) { Remove-Item -Recurse -Force -LiteralPath $engine }
    Copy-Item -LiteralPath $sourceEngine -Destination $engine -Recurse -Force
  }

  $version = Invoke-Exe $spacedExe @('--version')
  if ($version.ExitCode -ne 0) { throw "tdk.exe did not start from a path with a space: $($version.Text)" }
  $observations += "the exe starts from '$installDir'"

  $pathBefore = $env:PATH
  try {
    $env:PATH = "$installDir;$env:PATH"
    $resolved = Get-Command 'tdk.exe' -ErrorAction SilentlyContinue
    if (-not $resolved) { throw 'tdk.exe did not resolve through PATH' }
    $throughPath = Invoke-Exe 'tdk.exe' @('--version')
    if ($throughPath.ExitCode -ne 0) { throw "tdk.exe from PATH exited $($throughPath.ExitCode): $($throughPath.Text)" }
    $observations += "PATH lookup resolves tdk.exe to $($resolved.Source)"
  } finally {
    $env:PATH = $pathBefore
  }

  $projectDir = Join-Path $script:WorkDir 'my project with spaces'
  New-Item -ItemType Directory -Force -Path $projectDir | Out-Null
  $dryRun = Invoke-Exe $spacedExe @('up', '--dry-run') $projectDir
  if ($dryRun.ExitCode -eq 0) { throw 'tdk up --dry-run succeeded in a project directory with a space' }
  Assert-Text $dryRun.Text 'WSL2' 'tdk up --dry-run did not point at WSL2 in a project directory with a space'

  if (Get-Command bun -ErrorAction SilentlyContinue) {
    $scaffold = Invoke-Exe $spacedExe @('project', '--yes') $projectDir
    if ($scaffold.ExitCode -ne 0) { throw "tdk project --yes exited $($scaffold.ExitCode): $($scaffold.Text)" }
    if (-not (Test-Path -LiteralPath (Join-Path $projectDir '.tdk\project.json'))) {
      throw 'tdk project --yes did not write .tdk/project.json'
    }
    $observations += 'the exe scaffolds a project in a directory whose path has a space'
  } else {
    $observations += 'skipped the project scaffold: Bun is not on PATH, and the scaffold needs it'
  }

  # A path longer than MAX_PATH is the classic Windows failure. Record what happens instead of failing the case: the
  # documented contract is the three inspection commands, not an arbitrary install location.
  $longDir = $null
  try {
    $longDir = Join-Path $script:WorkDir (('long-' * 60) + 'path')
    New-Item -ItemType Directory -Force -Path $longDir -ErrorAction Stop | Out-Null
  } catch {
    $observations += "a path longer than 260 characters could not be created on this host: $($_.Exception.Message)"
  }
  if ($longDir -and (Test-Path -LiteralPath $longDir)) {
    $longExe = Join-Path $longDir 'tdk.exe'
    Copy-Item -LiteralPath $exe -Destination $longExe -Force
    $longRun = Invoke-Exe $longExe @('--version')
    if ($longRun.ExitCode -eq 0) {
      $observations += "a path of $($longDir.Length) characters still starts the exe"
    } else {
      $observations += "a path of $($longDir.Length) characters does not start the exe: $($longRun.Text.Trim())"
    }
  }

  return @{
    Detail = 'the exe starts from a path with a space, resolves through PATH and refuses in a spaced project'
    Observations = $observations
  }
}

function Invoke-Wh6 {
  # WH6: the one-command demo flow on native Windows. The demo clones a starter, installs the CLI
  # globally, installs the service dependencies and boots the stack. Native Windows cannot boot a
  # stack, so the demo must not start one. A release that refuses early must not clone or install
  # anything either; a release that predates that refusal says so in the report.
  Write-Step 'WH6 the one-command demo flow on native Windows'
  if ($script:LocalExe) {
    $exe = $script:LocalExe
  } else {
    $layout = Get-ReleaseLayout
    $exe = $layout.Exe
  }
  $workDir = Join-Path $script:WorkDir 'demo'
  New-Item -ItemType Directory -Force -Path $workDir | Out-Null

  # The demo writes into the home directory and installs the CLI globally. Give it a home and a
  # prefix of its own, so an acceptance run does not change the machine it runs on.
  $homeBefore = $env:USERPROFILE
  $homeEnvBefore = $env:HOME
  $prefixBefore = $env:npm_config_prefix
  $allowBefore = $env:TDK_ALLOW_NATIVE_WINDOWS
  $tempHome = Join-Path $script:WorkDir 'demo home'
  $tempPrefix = Join-Path $script:WorkDir 'demo npm prefix'
  New-Item -ItemType Directory -Force -Path $tempHome | Out-Null
  New-Item -ItemType Directory -Force -Path $tempPrefix | Out-Null

  $processesBefore = Get-RuntimeProcesses
  $containersBefore = Get-ContainerIds
  try {
    $env:USERPROFILE = $tempHome
    $env:HOME = $tempHome
    $env:npm_config_prefix = $tempPrefix
    Remove-Item Env:TDK_ALLOW_NATIVE_WINDOWS -ErrorAction SilentlyContinue
    $result = Invoke-Exe $exe @('demo') $workDir 600
  } finally {
    if ($null -eq $homeBefore) { Remove-Item Env:USERPROFILE -ErrorAction SilentlyContinue } else { $env:USERPROFILE = $homeBefore }
    if ($null -eq $homeEnvBefore) { Remove-Item Env:HOME -ErrorAction SilentlyContinue } else { $env:HOME = $homeEnvBefore }
    if ($null -eq $prefixBefore) { Remove-Item Env:npm_config_prefix -ErrorAction SilentlyContinue } else { $env:npm_config_prefix = $prefixBefore }
    if ($allowBefore) { $env:TDK_ALLOW_NATIVE_WINDOWS = $allowBefore }
  }

  if ($result.ExitCode -eq 0) { throw 'the demo command succeeded on native Windows; it must not boot a stack' }

  $observations = @()
  $cloned = Test-Path -LiteralPath (Join-Path $tempHome '.flisk\flisk-demo')
  $installedGlobally = $result.Text -match '(?i)installed globally'
  $refused = ($result.Text -match '(?i)WSL2') -and ($result.Text -match '(?i)Ubuntu')

  if ($refused) {
    if ($cloned) { throw 'the demo command cloned a starter before it refused' }
    if ($installedGlobally) { throw 'the demo command installed the CLI globally before it refused' }
    $observations += 'the demo refused with the WSL2 guidance before it cloned or installed anything'
  } else {
    $lastLine = ($result.Text -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 1)
    $observations += "the demo did not refuse with the WSL2 guidance; it stopped with '$($lastLine.Trim())'"
    if ($cloned) { $observations += 'the demo cloned the starter before it stopped' }
    if ($installedGlobally) { $observations += 'the demo installed the CLI globally before it stopped' }
  }

  $processesAfter = Get-RuntimeProcesses
  $newProcesses = @($processesAfter | Where-Object { $_ -notin $processesBefore })
  if ($newProcesses.Count -gt 0) { throw "the demo started runtime processes: $($newProcesses -join ', ')" }
  $containersAfter = Get-ContainerIds
  $newContainers = @($containersAfter | Where-Object { $_ -notin $containersBefore })
  if ($newContainers.Count -gt 0) { throw "the demo started containers: $($newContainers -join ', ')" }

  return @{
    Detail = 'the demo command did not boot a stack'
    Observations = $observations
  }
}

# --------------------------------------------------------------------------------------------------- the runner

$cases = [ordered]@{
  'WH1' = @{ Title = 'the published exe and engine archive match checksums.txt'; Run = { Invoke-Wh1 } }
  'WH2' = @{ Title = 'the official installer unpacks the engine, updates PATH and runs the exe'; Run = { Invoke-Wh2 } }
  'WH3' = @{ Title = 'the exe reports the release version and finds its own engine'; Run = { Invoke-Wh3 } }
  'WH4' = @{ Title = 'native Windows refuses doctor and up with WSL2 guidance and starts nothing'; Run = { Invoke-Wh4 } }
  'WH5' = @{ Title = 'the exe starts from a path with a space, resolves through PATH and refuses in a spaced project'; Run = { Invoke-Wh5 } }
  'WH6' = @{ Title = 'the one-command demo flow does not boot a stack on native Windows'; Run = { Invoke-Wh6 } }
}

$selected = if ($Case -eq 'all') { @($cases.Keys) } else { @($Case) }
$failed = @()
foreach ($id in $selected) {
  if (-not $cases.Contains($id)) { throw "unknown case: $id" }
  try {
    $result = & $cases[$id].Run
    Save-Result -CaseId $id -Title $cases[$id].Title -Status 'PASS' -Detail $result.Detail -Observations $result.Observations
    Write-Host "$id PASS"
  } catch {
    Save-Result -CaseId $id -Title $cases[$id].Title -Status 'FAIL' -Detail $_.Exception.Message -Observations @()
    Write-Host "$id FAIL: $($_.Exception.Message)"
    $failed += $id
  }
}
Write-FindingsReport
if ($failed.Count -gt 0) { exit 1 }
exit 0
