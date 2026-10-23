# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# The native Windows CLI contract (W3 in run.sh; moved verbatim from the "Verify native Windows CLI contract" step of
# the retired windows-smoke workflow, #1300). Run from the cli directory. GitHub's pwsh step sets ErrorActionPreference to Stop;
# the file sets it itself so a local run behaves the same.
$ErrorActionPreference = 'Stop'

Remove-Item Env:TDK_ALLOW_NATIVE_WINDOWS -ErrorAction SilentlyContinue

$version = & node bin/tdk.js --version
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($version | Out-String))) {
  throw 'tdk --version did not succeed.'
}
Write-Output $version

function Invoke-NativeWindowsRefusal {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][string[]]$CliArgs
  )

  $output = & node bin/tdk.js @CliArgs 2>&1
  $exitCode = $LASTEXITCODE
  $text = $output | Out-String
  Write-Host "$Label exit code: $exitCode"
  Write-Host $text

  if ($exitCode -eq 0) {
    throw "$Label unexpectedly succeeded on native Windows."
  }
  if ($text -notmatch '(?i)WSL2' -or $text -notmatch '(?i)Ubuntu') {
    throw "$Label did not direct the user to WSL2 Ubuntu."
  }
  return $text
}

$doctorText = Invoke-NativeWindowsRefusal -Label 'tdk doctor' -CliArgs @('doctor')
# Hosted Windows runners have no Docker daemon, so the Docker OS check is
# skipped there; the daemon failure line is the container diagnostic we get.
if ($doctorText -notmatch '(?i)Docker container mode|Windows containers|Linux containers|Docker OS|Docker is not running') {
  throw 'tdk doctor did not report Docker container mode diagnostics on native Windows.'
}
if ($doctorText -notmatch '(?i)tdk\.localhost|Windows ports and DNS|core\.autocrlf|File sharing') {
  throw 'tdk doctor did not report Windows ports/DNS or autocrlf diagnostics on native Windows.'
}
$null = Invoke-NativeWindowsRefusal -Label 'tdk up --dry-run' -CliArgs @('up', '--dry-run')

$beforeRuntimeProcesses = @(
  Get-Process -Name @('tilt', 'dockerd', 'containerd', 'com.docker.backend') -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty Id
)
$dockerBefore = @()
$canInspectContainers = $false
if (Get-Command docker -ErrorAction SilentlyContinue) {
  $dockerBefore = @(& docker ps -aq 2>$null | Where-Object { $_ })
  $canInspectContainers = $LASTEXITCODE -eq 0
}

$shopOutput = Invoke-NativeWindowsRefusal -Label 'tdk up shop' -CliArgs @('up', 'shop')
if ($shopOutput -match '(?im)^(Starting|Running tilt up)') {
  throw 'tdk up shop emitted a landscape startup message despite refusing native Windows.'
}

$afterRuntimeProcesses = @(
  Get-Process -Name @('tilt', 'dockerd', 'containerd', 'com.docker.backend') -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty Id
)
$newRuntimeProcesses = @($afterRuntimeProcesses | Where-Object { $_ -notin $beforeRuntimeProcesses })
if ($newRuntimeProcesses.Count -gt 0) {
  throw "tdk up shop started runtime processes: $($newRuntimeProcesses -join ', ')"
}

if ($canInspectContainers) {
  $dockerAfter = @(& docker ps -aq 2>$null | Where-Object { $_ })
  if ($LASTEXITCODE -ne 0) {
    throw 'Docker became unavailable while checking the native refusal result.'
  }
  $newContainers = @($dockerAfter | Where-Object { $_ -notin $dockerBefore })
  if ($newContainers.Count -gt 0) {
    throw "tdk up shop started containers: $($newContainers -join ', ')"
  }
}

# Refusal commands intentionally returned non-zero; the assertions above verified them.
$global:LASTEXITCODE = 0
