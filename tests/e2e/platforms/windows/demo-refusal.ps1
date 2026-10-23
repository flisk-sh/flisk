# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# The one-command demo flow on native Windows (W4 in run.sh). The demo clones a starter into
# ~/.flisk/flisk-demo, installs the CLI globally, installs the service dependencies and boots the
# stack. Native Windows cannot boot a stack, so the demo has to refuse before it does any of that:
# no clone in the home directory, no global install, no stack. Run from the cli directory.
$ErrorActionPreference = 'Stop'

Remove-Item Env:TDK_ALLOW_NATIVE_WINDOWS -ErrorAction SilentlyContinue

$userProfile = if ($env:USERPROFILE) { $env:USERPROFILE } else { [Environment]::GetFolderPath('UserProfile') }
$demoDir = Join-Path $userProfile '.flisk\flisk-demo'
$existedBefore = Test-Path -LiteralPath $demoDir

$output = & node bin/tdk.js demo 2>&1
$exitCode = $LASTEXITCODE
$text = $output | Out-String
Write-Host "demo exit code: $exitCode"
Write-Host $text

if ($exitCode -eq 0) {
  throw 'the demo command succeeded on native Windows; it must refuse'
}
if ($text -notmatch '(?i)WSL2' -or $text -notmatch '(?i)Ubuntu') {
  throw 'the demo command did not direct the user to WSL2 Ubuntu.'
}
if ($text -match '(?i)installed globally') {
  throw 'the demo command installed the CLI globally before it refused.'
}
if (-not $existedBefore -and (Test-Path -LiteralPath $demoDir)) {
  throw "the demo command created $demoDir before it refused."
}

# The refusal command intentionally returned non-zero; the assertions above verified it.
$global:LASTEXITCODE = 0
