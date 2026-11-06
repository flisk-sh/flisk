# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Gate G6 of docs/design/native-windows-runtime-decision.md: `flisk demo` (a Docker + Tilt stack) on a real Windows machine,
# with Docker Desktop in Linux-container mode, started from the committed cli/dist with the unsupported opt-in
# FLISK_ALLOW_NATIVE_WINDOWS=1. Run from the repository root:
#   powershell -NoProfile -File tests/e2e/platforms/windows-live/live-stack.ps1
# Steps: L1 doctor passes its Windows tool checks, L2 the demo reaches ready, L3 `flisk down` leaves no tilt.exe and no
# project containers (gate G2). It has NEVER been run; the first run is expected to find failures, and the Tilt log in the
# findings directory names the first failing resource.
param([string]$WorkDir = (Join-Path $(if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }) 'flisk-windows-live'), [int]$DemoTimeoutSeconds = 900)

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
  # doctor exits 1 on native Windows by design (its "Native Windows support" finding), so only its JSON matters. PowerShell
  # 5.1 turns a native command's stderr into an error under $ErrorActionPreference = 'Stop' and writes `*>` files as UTF-16,
  # so run it through cmd.exe: stdout goes to the file as bytes, stderr to a separate file.
  $json = Join-Path $Out 'doctor.json'
  cmd /c ('node "' + $Cli + '" doctor --json > "' + $json + '" 2> "' + (Join-Path $Out 'doctor.err') + '"')
  $report = Get-Content -Raw -LiteralPath $json | ConvertFrom-Json
  $tools = @($report.data.checks | Where-Object { $_.name -eq 'Windows Runtime Tools' -or $_.name -eq 'Docker container mode' })
  if ($tools.Count -lt 2) { throw 'doctor did not report the Windows tool checks' }
  foreach ($t in $tools) { if (-not $t.didPass) { throw ($t.name + ' failed: ' + $t.message) } }
}

$Project = Join-Path $WorkDir 'demo project'
Step 'L2 demo reaches ready' {
  Remove-Item -Recurse -Force -LiteralPath $Project -ErrorAction SilentlyContinue
  $proc = Start-Process -FilePath 'node' -ArgumentList @($Cli, 'demo', '--project', ('"' + $Project + '"')) -NoNewWindow -PassThru `
    -RedirectStandardOutput (Join-Path $Out 'demo.out') -RedirectStandardError (Join-Path $Out 'demo.err')
  # Without reading .Handle, ExitCode stays empty for a process started with -PassThru (run 42067874152 printed "exited ").
  $null = $proc.Handle
  if (-not $proc.WaitForExit($DemoTimeoutSeconds * 1000)) {
    # Run 42231914760 sat at "13 of 48 services ready, 15 building" from minute 9 to minute 30. Tilt is still alive here and gone
    # after the kill, so take the snapshot first: which resources are building, what Docker has, and the end of Tilt's log.
    $snap = Join-Path $Out 'stall'
    New-Item -ItemType Directory -Force -Path $snap | Out-Null
    cmd /c ('tilt get uiresource -o json > "' + (Join-Path $snap 'uiresources.json') + '" 2> "' + (Join-Path $snap 'uiresources.err') + '"')
    cmd /c ('tilt logs > "' + (Join-Path $snap 'tilt-logs-full.txt') + '" 2>&1')
    cmd /c ('docker ps -a > "' + (Join-Path $snap 'docker-ps-a.txt') + '" 2>&1')
    cmd /c ('docker images > "' + (Join-Path $snap 'docker-images.txt') + '" 2>&1')
    cmd /c ('docker system df > "' + (Join-Path $snap 'docker-df.txt') + '" 2>&1')
    cmd /c ('docker buildx ls > "' + (Join-Path $snap 'buildx-ls.txt') + '" 2>&1')
    $proc.Kill()
    throw 'flisk demo did not finish in time (stall snapshot saved)'
  }
  $proc.WaitForExit()
  if ($proc.ExitCode -ne 0) {
    $tail = (Get-Content -LiteralPath (Join-Path $Out 'demo.err') -Tail 12 -ErrorAction SilentlyContinue) -join ' | '
    throw ('flisk demo exited ' + $proc.ExitCode + ': ' + $tail)
  }
}

# The demo's exit code alone proved too little (run 42093138026: "6 of 6 services ready" while `docker ps` listed only Traefik),
# so ask the gateway for the pages the demo printed. *.localhost does not resolve to loopback on Windows, so the Host header
# carries the name and curl.exe (shipped with Windows) talks to 127.0.0.1.
Step 'L2b the stack answers through the gateway' {
  $port = '8080'
  $paths = @('reservation-app', 'floor-app')
  $bad = @()
  foreach ($path in $paths) {
    $code = '000'
    for ($i = 0; $i -lt 12; $i++) {
      $code = (cmd /c ('curl.exe -s -o NUL -w "%{http_code}" -H "Host: app.flisk-restaurant-example.localhost" http://127.0.0.1:' + $port + '/' + $path + ' 2>&1')).Trim()
      if ($code -match '^[23]') { break }
      Start-Sleep -Seconds 5
    }
    ($path + ' -> HTTP ' + $code) | Out-File -FilePath (Join-Path $Out 'gateway-check.txt') -Append -Encoding utf8
    if ($code -notmatch '^[23]') { $bad += ($path + ' answered ' + $code) }
  }
  $names = @(docker ps --format '{{.Names}}' 2>$null)
  ('containers running: ' + ($names -join ', ')) | Out-File -FilePath (Join-Path $Out 'gateway-check.txt') -Append -Encoding utf8
  if ($bad.Count -gt 0) { throw ('the gateway did not serve: ' + ($bad -join '; ') + ' (containers: ' + ($names -join ', ') + ')') }
}

# Run the discovery helpers on this machine's real project path (run 42133012577: "Loaded 0 services" while 7 service.json exist).
Step 'Discovery probe' {
  $ext = Join-Path $Project '.flisk\.flisk-out\flisk-cli-ext\discovery\native_windows.star'
  $probe = Join-Path $Out 'probe.star'
  $q = [char]39
  $lines = @(
    ('load(' + $q + ($ext -replace '\\', '/') + $q + ', ' + $q + 'find_files' + $q + ', ' + $q + 'IS_NATIVE_WINDOWS' + $q + ', ' + $q + 'dir_exists' + $q + ')'),
    ('root = ' + $q + ($Project -replace '\\', '/') + $q),
    'files = listdir(root, recursive=True)',
    'r = {',
    ('  ' + $q + 'is_native_windows' + $q + ': IS_NATIVE_WINDOWS,'),
    ('  ' + $q + 'exists' + $q + ': os.path.exists(root),'),
    ('  ' + $q + 'dir_exists' + $q + ': dir_exists(root),'),
    ('  ' + $q + 'abspath' + $q + ': os.path.abspath(root),'),
    ('  ' + $q + 'listdir_count' + $q + ': len(files),'),
    ('  ' + $q + 'listdir_first' + $q + ': files[:3],'),
    ('  ' + $q + 'find_root' + $q + ': find_files(root, ' + $q + 'service.json' + $q + '),'),
    ('  ' + $q + 'find_services' + $q + ': find_files(root + ' + $q + '/services' + $q + ', ' + $q + 'service.json' + $q + '),'),
    '}',
    ('fail(' + $q + 'PROBE' + $q + ' + encode_json(r))')
  )
  $lines | Out-File -FilePath $probe -Encoding ascii
  cmd /c ('tilt alpha tiltfile-result -f "' + $probe + '" > "' + (Join-Path $Out 'probe-result.txt') + '" 2>&1')
}

# The CLI cuts a Tiltfile failure after a few hundred characters; ask Tilt for the whole error (Windows run 42183705419: the
# Tiltfile failed inside registry.star's discovery once it found services for the first time).
Step 'Tiltfile error' {
  $tiltfile = Join-Path $Project '.flisk\.flisk-out\Tiltfile'
  if (Test-Path -LiteralPath $tiltfile) {
    $env:FLISK_PROJECT_ROOT = $Project
    Push-Location -LiteralPath (Split-Path -Parent $tiltfile)
    try { cmd /c ('tilt alpha tiltfile-result -f "' + $tiltfile + '" > "' + (Join-Path $Out 'tiltfile-result.json') + '" 2>&1') } finally { Pop-Location }
    Remove-Item Env:FLISK_PROJECT_ROOT -ErrorAction SilentlyContinue
  }
}

# Replay two failing resources by hand: the CLI cuts their messages at 800 characters, and Tilt's API is gone once the demo exits.
Step 'Replay failing resources' {
  $extract = Join-Path $PSScriptRoot 'extract-resource-cmd.py'
  $result = Join-Path $Out 'tiltfile-result.json'
  if (-not (Test-Path -LiteralPath $result)) { return }
  $replay = Join-Path $Out 'replay'
  foreach ($name in 'provision-db-guest', 'service-discovery-daemon') {
    cmd /c ('python "' + $extract + '" "' + $result + '" ' + $name + ' "' + $replay + '" > "' + (Join-Path $Out ('replay-' + $name + '-extract.txt')) + '" 2>&1')
    $script = Join-Path $replay ($name + '.ps1')
    $envFile = Join-Path $replay ($name + '.env.json')
    if (-not (Test-Path -LiteralPath $script)) { continue }
    $saved = @{}
    if (Test-Path -LiteralPath $envFile) {
      $vars = Get-Content -Raw -LiteralPath $envFile | ConvertFrom-Json
      foreach ($p in $vars.PSObject.Properties) { $saved[$p.Name] = [Environment]::GetEnvironmentVariable($p.Name); [Environment]::SetEnvironmentVariable($p.Name, [string]$p.Value) }
    }
    $o = Join-Path $Out ('replay-' + $name + '.out')
    $e = Join-Path $Out ('replay-' + $name + '.err')
    $proc = Start-Process -FilePath 'powershell' -ArgumentList @('-NoProfile', '-NonInteractive', '-File', ('"' + $script + '"')) -NoNewWindow -PassThru -RedirectStandardOutput $o -RedirectStandardError $e
    $null = $proc.Handle
    if (-not $proc.WaitForExit(120000)) { $proc.Kill(); 'killed after 120s (still running)' | Out-File -FilePath $e -Append -Encoding utf8 }
    else { ('exit ' + $proc.ExitCode) | Out-File -FilePath $e -Append -Encoding utf8 }
    foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k]) }
  }
}

# provision-db replay (run 42193518707): createdb printed nothing yet the database never appeared. Ask Postgres directly.
Step 'Postgres probe' {
  $envFile = Join-Path $Out 'replay\provision-db-guest.env.json'
  if (-not (Test-Path -LiteralPath $envFile)) { return }
  $v = Get-Content -Raw -LiteralPath $envFile | ConvertFrom-Json
  $pg = $v.FLISK_DB_HOST; $pu = $v.FLISK_DB_USER
  $o = Join-Path $Out 'pg-probe.txt'
  ('host=' + $pg + ' user=' + $pu) | Out-File -FilePath $o -Encoding utf8
  $q = [char]39
  $steps = @(
    @('databases', ('docker exec ' + $pg + ' psql -U ' + $pu + ' -d postgres -tAc "SELECT datname FROM pg_database ORDER BY 1"')),
    @('roles', ('docker exec ' + $pg + ' psql -U ' + $pu + ' -d postgres -tAc "SELECT rolname, rolcreatedb FROM pg_roles ORDER BY 1"')),
    @('createdb diag_probe_db', ('docker exec ' + $pg + ' createdb -U ' + $pu + ' -O ' + $pu + ' diag_probe_db')),
    @('exists diag_probe_db', ('docker exec ' + $pg + ' psql -U ' + $pu + ' -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = ' + $q + 'diag_probe_db' + $q + '"')),
    @('drop diag_probe_db', ('docker exec ' + $pg + ' dropdb -U ' + $pu + ' --if-exists diag_probe_db'))
  )
  # Is the output lost on the way back? Compare exec from Windows (through WSL's localhost relay) with exec run inside WSL.
  $steps = @(
    @('transport: windows docker exec echo', ('docker exec ' + $pg + ' echo hello-from-exec')),
    @('transport: windows docker exec psql', ('docker exec ' + $pg + ' psql -U ' + $pu + ' -d postgres -tAc "SELECT 42"')),
    @('transport: wsl docker exec echo', ('wsl -d Ubuntu -u root -- docker exec ' + $pg + ' echo hello-from-exec')),
    @('transport: wsl docker exec psql', ('wsl -d Ubuntu -u root -- docker exec ' + $pg + ' psql -U ' + $pu + ' -d postgres -tAc "SELECT 42"')),
    @('transport: windows docker exec exit code', ('docker exec ' + $pg + ' sh -c "exit 7" & echo exit=%errorlevel%')),
    @('transport: windows docker run echo', 'docker run --rm alpine echo hello-from-run')
  ) + $steps
  foreach ($st in $steps) {
    ('--- ' + $st[0]) | Out-File -FilePath $o -Append -Encoding utf8
    cmd /c ($st[1] + ' >> "' + $o + '" 2>&1')
  }
}

# Always collect what the engine and Flisk say, so a failed run names the failing resource (run 42069367765 showed only
# "Resources failed (traefik: ...)" with the command cut off).
Step 'Diagnostics' {
  $logs = Join-Path $env:USERPROFILE '.flisk\logs'
  if (Test-Path -LiteralPath $logs) { Copy-Item -Path (Join-Path $logs '*') -Destination $Out -Force -ErrorAction SilentlyContinue }
  cmd /c ('docker ps -a --format "{{.Names}} {{.Status}} {{.Ports}}" > "' + (Join-Path $Out 'docker-ps.txt') + '" 2>&1')
  cmd /c ('docker network ls > "' + (Join-Path $Out 'docker-networks.txt') + '" 2>&1')
  cmd /c ('docker ps -a > "' + (Join-Path $Out 'docker-ps-all.txt') + '" 2>&1')
  # Re-run the failing Traefik command by hand: Tilt cut its stderr from the failure message (run 42071351532).
  $flisk = Join-Path $Project '.flisk\.flisk-out'
  if (Test-Path -LiteralPath $flisk) {
    $compose = Join-Path $flisk 'docker-compose.traefik.yml'
    $base = 'docker compose --project-name flisk-restaurant-example-traefik --project-directory "' + $flisk + '" -f "' + $compose + '"'
    cmd /c ($base + ' up --no-deps --remove-orphans --no-build -d traefik > "' + (Join-Path $Out 'traefik-up.txt') + '" 2>&1')
    cmd /c ($base + ' config > "' + (Join-Path $Out 'traefik-config.txt') + '" 2>&1')
    cmd /c ('tilt logs traefik > "' + (Join-Path $Out 'tilt-traefik.txt') + '" 2>&1')
    # Tilt's API is gone once the demo exits, so run the discovery daemon by hand for a few seconds and keep what it prints.
    $daemon = Join-Path $flisk 'flisk-cli-ext\discovery\resource_snapshot.py'
    $note = Join-Path $Out 'daemon-manual.txt'
    ('script exists: ' + (Test-Path -LiteralPath $daemon) + ' (' + $daemon + ')') | Out-File -FilePath $note -Encoding utf8
    foreach ($n in 'python3', 'python', 'py') {
      foreach ($c in @(Get-Command $n -All -ErrorAction SilentlyContinue)) {
        $v = cmd /c ('"' + $c.Source + '" --version 2>&1')
        ($n + ' -> ' + $c.Source + ' : exit ' + $LASTEXITCODE + ' : ' + $v) | Out-File -FilePath $note -Append -Encoding utf8
      }
    }
    if (Test-Path -LiteralPath $daemon) {
      $env:PYTHONUTF8 = '1'
      $d = Start-Process -FilePath 'python' -ArgumentList @(('"' + $daemon + '"'), 'watch') -WorkingDirectory $flisk -NoNewWindow -PassThru `
        -RedirectStandardOutput (Join-Path $Out 'daemon-manual.out') -RedirectStandardError (Join-Path $Out 'daemon-manual.err')
      $null = $d.Handle
      if (-not $d.WaitForExit(15000)) { $d.Kill(); 'still running after 15s (no crash)' | Out-File -FilePath $note -Append -Encoding utf8 }
      else { ('exited ' + $d.ExitCode) | Out-File -FilePath $note -Append -Encoding utf8 }
    }
    cmd /c ('tilt logs service-discovery-daemon > "' + (Join-Path $Out 'tilt-discovery-daemon.txt') + '" 2>&1')
    cmd /c ('tilt get uiresource service-discovery-daemon -o json > "' + (Join-Path $Out 'tilt-discovery-daemon.json') + '" 2>&1')
    cmd /c ('tilt get cmd -o json > "' + (Join-Path $Out 'tilt-cmds.json') + '" 2>&1')
  }
  foreach ($c in @(docker ps -a --format '{{.Names}}' 2>$null | Where-Object { $_ -match 'traefik' })) {
    cmd /c ('docker logs --tail 80 ' + $c + ' > "' + (Join-Path $Out ('logs-' + $c + '.txt')) + '" 2>&1')
  }
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
