# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Gate G6 of docs/design/native-windows-runtime-decision.md: `flisk demo` (a Docker + Tilt stack) on a real Windows machine,
# with Docker Desktop in Linux-container mode, started from the committed cli/dist with the unsupported opt-in
# FLISK_ALLOW_NATIVE_WINDOWS=1. Run from the repository root:
#   powershell -NoProfile -File tests/e2e/platforms/windows-live/live-stack.ps1
# Steps: L1 doctor passes its Windows tool checks, L2 the demo reaches ready, L3 `flisk down` leaves no tilt.exe and no
# project containers (gate G2). It has NEVER been run; the first run is expected to find failures, and the Tilt log in the
# findings directory names the first failing resource.
param([string]$WorkDir = (Join-Path $(if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }) 'flisk-windows-live'), [int]$DemoTimeoutSeconds = 1800)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
$Cli = Join-Path $Root 'cli\dist\cli.js'
$Out = Join-Path $WorkDir 'findings'
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$env:FLISK_ALLOW_NATIVE_WINDOWS = '1'
$failures = @()

function Step([string]$Name, [scriptblock]$Body) {
  Write-Output ('== ' + $Name)
  try { & $Body } catch { $script:failures += ($Name + ': ' + $_.Exception.Message); Write-Output ('FAIL ' + $Name + ': ' + $_.Exception.Message) }
}

Step 'L1 doctor' {
  & node $Cli doctor --json *> (Join-Path $Out 'doctor.json')
  $report = Get-Content -Raw (Join-Path $Out 'doctor.json') | ConvertFrom-Json
  $tools = @($report.data.checks | Where-Object { $_.name -eq 'Windows Runtime Tools' -or $_.name -eq 'Docker container mode' })
  if ($tools.Count -lt 2) { throw 'doctor did not report the Windows tool checks' }
  foreach ($t in $tools) { if (-not $t.didPass) { throw ($t.name + ' failed: ' + $t.message) } }
}

$Project = Join-Path $WorkDir 'demo project'
Step 'L2 demo reaches ready' {
  Remove-Item -Recurse -Force -LiteralPath $Project -ErrorAction SilentlyContinue
  $proc = Start-Process -FilePath 'node' -ArgumentList @($Cli, 'demo', '--project', ('"' + $Project + '"')) -NoNewWindow -PassThru `
    -RedirectStandardOutput (Join-Path $Out 'demo.out') -RedirectStandardError (Join-Path $Out 'demo.err')
  if (-not $proc.WaitForExit($DemoTimeoutSeconds * 1000)) { $proc.Kill(); throw 'flisk demo did not finish in time' }
  if ($proc.ExitCode -ne 0) { throw ('flisk demo exited ' + $proc.ExitCode) }
}

Step 'L3 down leaves nothing behind (G2)' {
  if (Test-Path -LiteralPath (Join-Path $Project '.flisk\project.json')) {
    Push-Location -LiteralPath $Project
    try { & node $Cli down --yes *> (Join-Path $Out 'down.out') } finally { Pop-Location }
  }
  Start-Sleep -Seconds 5
  $tilt = @(Get-Process -Name 'tilt' -ErrorAction SilentlyContinue)
  if ($tilt.Count -gt 0) { throw ('tilt.exe still running after flisk down: ' + (($tilt | ForEach-Object { $_.Id }) -join ',')) }
  $left = @(docker ps -q --filter ('name=' + (Split-Path -Leaf $Project)))
  if ($left.Count -gt 0) { throw ('containers still running after flisk down: ' + ($left -join ',')) }
}

if ($failures.Count -gt 0) { Write-Output ''; Write-Output 'FAILED:'; $failures | ForEach-Object { Write-Output ('  ' + $_) }; exit 1 }
Write-Output 'windows live stack: all steps passed'
exit 0
