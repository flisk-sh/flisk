# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# The one-command demo on native Windows (W5 in run.sh). Without WSL2 or Docker, `flisk demo` writes the
# small two-service demo and starts it as local processes: it must exit 0, its website must serve the
# menu from the API behind it, a second run must reuse it, and `flisk down` must stop it. Run from the
# cli directory.
$ErrorActionPreference = 'Stop'

Remove-Item Env:FLISK_ALLOW_NATIVE_WINDOWS -ErrorAction SilentlyContinue
$demoDir = Join-Path ([IO.Path]::GetTempPath()) 'flisk-demo-native-e2e'
if (Test-Path -LiteralPath $demoDir) { Remove-Item -LiteralPath $demoDir -Recurse -Force }

$output = & node bin/flisk.js demo --project $demoDir 2>&1
$exitCode = $LASTEXITCODE
$text = $output | Out-String
Write-Host "demo exit code: $exitCode"
Write-Host $text
if ($exitCode -ne 0) {
  $log = Join-Path $demoDir '.flisk\demo-native.log'
  if (Test-Path -LiteralPath $log) { Get-Content -LiteralPath $log -Tail 40 | Write-Host }
  throw 'the demo did not start on native Windows'
}
if ($text -notmatch '(?i)without Docker') {
  throw 'the demo did not say it runs without Docker'
}
$web = [regex]::Match($text, 'http://localhost:\d+').Value
if (-not $web) { throw 'the demo printed no localhost URL' }

$page = Invoke-WebRequest -UseBasicParsing -TimeoutSec 15 -Uri "$web/"
if ($page.Content -notmatch "Tonight's menu") { throw "$web did not serve the demo page" }
$menu = Invoke-WebRequest -UseBasicParsing -TimeoutSec 15 -Uri "$web/api/menu"
if ($menu.Content -notmatch 'Margherita') { throw "$web/api/menu did not reach the menu API" }

$again = (& node bin/flisk.js demo --project $demoDir 2>&1) | Out-String
if ($again -notmatch '(?i)already running') { Write-Host $again; throw 'the second run did not reuse the running demo' }

Push-Location $demoDir
try { & node (Join-Path $PSScriptRoot '..\..\..\..\cli\bin\flisk.js') down 2>&1 | Write-Host } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw 'flisk down failed in the demo folder' }
$stillUp = $true
try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri "$web/health" | Out-Null } catch { $stillUp = $false }
if ($stillUp) { throw "$web still answers after flisk down" }
$global:LASTEXITCODE = 0
