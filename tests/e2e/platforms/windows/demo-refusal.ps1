# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# The one-command flow for a Docker starter on native Windows (W4 in run.sh). `flisk restaurant` clones
# a starter, installs the CLI globally, installs the service dependencies and boots the stack. Native
# Windows cannot boot a Docker stack, so it has to refuse before it does any of that: no clone in the
# home directory, no global install, no stack. `flisk demo` is different: it runs the small demo
# without Docker (W5, demo-native.ps1). Run from the cli directory.
$ErrorActionPreference = 'Stop'

Remove-Item Env:FLISK_ALLOW_NATIVE_WINDOWS -ErrorAction SilentlyContinue

$userProfile = if ($env:USERPROFILE) { $env:USERPROFILE } else { [Environment]::GetFolderPath('UserProfile') }
$demoDir = Join-Path (Get-Location) 'restaurant'
$existedBefore = Test-Path -LiteralPath $demoDir

$output = & node bin/flisk.js restaurant 2>&1
$exitCode = $LASTEXITCODE
$text = $output | Out-String
Write-Host "demo exit code: $exitCode"
Write-Host $text

if ($exitCode -eq 0) {
  throw 'the restaurant command succeeded on native Windows; it must refuse'
}
if ($text -notmatch '(?i)WSL2' -or $text -notmatch '(?i)Ubuntu') {
  throw 'the restaurant command did not direct the user to WSL2 Ubuntu.'
}
if ($text -match '(?i)installed globally') {
  throw 'the restaurant command installed the CLI globally before it refused.'
}
if (-not $existedBefore -and (Test-Path -LiteralPath $demoDir)) {
  throw "the restaurant command created $demoDir before it refused."
}

# The refusal command intentionally returned non-zero; the assertions above verified it.
$global:LASTEXITCODE = 0
