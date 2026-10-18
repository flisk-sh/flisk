# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# The Windows release candidate (WB1 in run.sh; moved verbatim from the windows-smoke job of .github/workflows/release-binaries.yml,
# #1300). Run from the repository root with release-dist/ holding the candidate and VERSION set.
$ErrorActionPreference = "Stop"
$releaseDir = Join-Path $PWD "release-dist"
$checksumFile = Join-Path $releaseDir "checksums.txt"

function Get-ExpectedHash([string]$AssetName) {
  $found = @()
  foreach ($line in Get-Content -LiteralPath $checksumFile) {
    if ($line -match '^(?<hash>[0-9A-Fa-f]{64})[ \t]{2}(?<name>.+)$' -and $Matches.name -eq $AssetName) {
      $found += $Matches.hash.ToLowerInvariant()
    }
  }
  if ($found.Count -ne 1) {
    throw "checksums.txt must contain exactly one entry for $AssetName"
  }
  return $found[0]
}

foreach ($asset in @("tdk-windows-amd64.exe", "tdk-cli-engine.tar.gz")) {
  $assetPath = Join-Path $releaseDir $asset
  if (!(Test-Path -LiteralPath $assetPath -PathType Leaf)) {
    throw "Release candidate is missing $asset"
  }
  $expected = Get-ExpectedHash $asset
  $actual = (Get-FileHash -LiteralPath $assetPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected) {
    throw "SHA-256 mismatch for $asset; expected $expected, got $actual"
  }
}

$exePath = Join-Path $releaseDir "tdk.exe"
Copy-Item -LiteralPath (Join-Path $releaseDir "tdk-windows-amd64.exe") -Destination $exePath
tar -xzf (Join-Path $releaseDir "tdk-cli-engine.tar.gz") -C $releaseDir
if ($LASTEXITCODE -ne 0) { throw "Engine archive extraction failed" }

$actualVersion = (& $exePath --version).Trim()
if ($LASTEXITCODE -ne 0) { throw "tdk.exe --version failed" }
if ($actualVersion -ne $env:VERSION) {
  throw "Version mismatch: expected $env:VERSION, got $actualVersion"
}

$runtimeJson = & $exePath runtime --check-assets --json
if ($LASTEXITCODE -ne 0) { throw "tdk.exe runtime --check-assets failed: $runtimeJson" }
$runtime = $runtimeJson | ConvertFrom-Json
if (!$runtime.ok) { throw "Runtime asset check failed: $runtimeJson" }

$expectedRoot = (Resolve-Path -LiteralPath (Join-Path $releaseDir "tdk-cli")).Path.TrimEnd("\\")
$actualRoot = (Resolve-Path -LiteralPath $runtime.assetRoot).Path.TrimEnd("\\")
if (![string]::Equals($actualRoot, $expectedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Expected adjacent engine root '$expectedRoot', got '$actualRoot'"
}

