# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# POWERSHELL EQUIVALENTS OF THE ENGINE'S POSIX HOST SCRIPTS
# =============================================================================
# Each function returns the body of a PowerShell -Command for one local_resource
# that otherwise runs `sh -c` / `bash -c`. Call sites keep their POSIX command and
# pass these as cmd_bat, so Linux, macOS and WSL2 are unchanged. Values come in
# through environment variables (env=), never through string interpolation.
#
# Rules for these scripts: ASCII only and no double quotes (argv quoting and the
# console code page on Windows make both unreliable); statements end in `;`.
#
# NOT run on a real Windows machine yet. tests/tilt-engine/test_windows_scripts.py
# only checks the rules above and that the POSIX commands are untouched.
# =============================================================================

def _join(lines):
    return " ".join([l.strip() for l in lines if l.strip()])

def init_networks_script():
    """Create the platform Docker networks (env FLISK_NETWORKS, comma separated); same outcome as fix_docker_networks."""
    return _join([
        "Write-Output 'Initializing Docker networks...';",
        "foreach ($n in ($env:FLISK_NETWORKS -split ',')) {",
        "  docker network inspect $n *> $null;",
        "  if ($LASTEXITCODE -eq 0) {",
        "    $labels = docker network inspect $n --format '{{.Labels}}';",
        "    if ($labels -match 'com.docker.compose') { Write-Output ('Removing network ' + $n + ' with incorrect labels...'); docker network rm $n *> $null; }",
        "  }",
        "  $out = docker network create $n 2>&1;",
        "  if ($LASTEXITCODE -eq 0) { Write-Output ('Created network ' + $n); }",
        "  else {",
        "    docker network inspect $n *> $null;",
        "    if ($LASTEXITCODE -ne 0) { [Console]::Error.WriteLine('Failed to create Docker network ' + $n + ': ' + $out); exit 1; }",
        "  }",
        "}",
        "Write-Output 'Docker networks initialized';",
        "exit 0;",
    ])

def healthy_postgres_script():
    """Wait up to 120s for the <FLISK_PROJECT>_postgres container to report healthy (env FLISK_PROJECT)."""
    return _join([
        "$cname = $env:FLISK_PROJECT + '_postgres';",
        "$filter = 'name=^/' + $cname + '$';",
        "$exited = 0;",
        "for ($i = 0; $i -lt 120; $i++) {",
        "  $id = docker ps -q -f $filter 2>$null | Select-Object -First 1;",
        "  if (-not $id) { $id = docker ps -a -q -f $filter 2>$null | Select-Object -First 1; }",
        "  if (-not $id) { Start-Sleep -Seconds 1; continue; }",
        "  $state = docker inspect --format '{{.State.Status}}' $id 2>$null;",
        "  $code = docker inspect --format '{{.State.ExitCode}}' $id 2>$null;",
        "  if ($state -eq 'dead') { Write-Output ('ERROR: container postgres is dead (exit code ' + $code + ')'); exit 1; }",
        "  if ($state -eq 'exited') {",
        "    $policy = docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' $id 2>$null;",
        "    if ((-not $policy) -or $policy -eq 'no') {",
        "      $exited++;",
        "      if ($exited -ge 5) { Write-Output ('ERROR: container postgres exited with code ' + $code + ' and will not restart (restart: ' + $policy + ')'); exit 1; }",
        "    } else { $exited = 0; }",
        "  } else { $exited = 0; }",
        "  $health = docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' $id 2>$null;",
        "  if ($health -eq 'healthy') { Write-Output 'postgres is healthy'; exit 0; }",
        "  if ($health -eq 'unhealthy') { Write-Output 'ERROR: postgres is unhealthy'; exit 1; }",
        "  if ($health -eq 'none') { Write-Output 'ERROR: postgres container has no health check configured'; exit 1; }",
        "  Start-Sleep -Seconds 1;",
        "}",
        "Write-Output 'ERROR: timed out waiting for postgres to become healthy'; exit 1;",
    ])

def provision_database_script():
    """Create one logical database in the shared Postgres container.

    env: FLISK_DB_NAME, FLISK_DB_USER, FLISK_DB_HOST, FLISK_DB_PREFIX, FLISK_RESOURCE.
    """
    return _join([
        "$db = $env:FLISK_DB_NAME; $u = $env:FLISK_DB_USER; $h = $env:FLISK_DB_HOST; $master = 'postgres';",
        "Write-Output ('DATABASE VIRTUALIZATION: Provisioning ' + $db);",
        "if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {",
        "  Write-Output ('Docker not available; assuming database ' + $db + ' is already provisioned'); exit 0;",
        "}",
        "Write-Output 'Waiting for PostgreSQL container...';",
        "for ($i = 1; $i -le 30; $i++) {",
        "  docker exec $h pg_isready -U $u -d $master *> $null;",
        "  if ($LASTEXITCODE -eq 0) { Write-Output 'PostgreSQL is ready!'; break; }",
        "  if ($i -eq 30) { Write-Output ('Timeout waiting for PostgreSQL; assuming database ' + $db + ' is already provisioned'); exit 0; }",
        "  Write-Output ('   Attempt ' + $i + '/30...');",
        "  Start-Sleep -Seconds 2;",
        "}",
        "$query = 'SELECT 1 FROM pg_database WHERE datname = ''' + $db + '''';",
        # @() and -join turn "no output" into an empty string: .Trim() on $null threw on every attempt (hosted Windows run 42190469696).
        "function Test-Db { $r = @(docker exec $h psql -U $u -d $master -tAc $query 2>$null); return (($r -join '').Trim() -eq '1'); }",
        "for ($i = 1; $i -le 30; $i++) {",
        "  if (Test-Db) { break; }",
        "  Write-Output ('Creating database ' + $db + ' (attempt ' + $i + '/30)...');",
        # Keep createdb's own message when it fails: the POSIX script hides it, which made this loop silent on Windows.
        "  $cd = @(docker exec $h createdb -U $u -O $u $db 2>&1); if ($LASTEXITCODE -ne 0) { Write-Output ('createdb failed: ' + ($cd -join ' ')); }",
        "  if (Test-Db) { break; }",
        "  if ($i -eq 30) { Write-Output ('Database ' + $db + ' could not be created'); exit 1; }",
        "  Start-Sleep -Seconds 2;",
        "}",
        "docker exec $h psql -U $u -d $master -c ('GRANT ALL PRIVILEGES ON DATABASE ' + $db + ' TO ' + $u + ';');",
        "Write-Output ('Database ' + $db + ' exists');",
        "docker exec $h psql -U $u -d $master -c ('SELECT datname AS database, pg_size_pretty(pg_database_size(datname)) AS size FROM pg_database WHERE datname LIKE ''' + $env:FLISK_DB_PREFIX + '%'' ORDER BY datname;');",
        "Write-Output ('Database ' + $db + ' is ready for service ' + $env:FLISK_RESOURCE + '!');",
        "exit 0;",
    ])

def db_status_script():
    """Print the logical databases in the shared Postgres (env FLISK_DB_HOST, FLISK_DB_USER, FLISK_DB_NAME, FLISK_DB_PREFIX)."""
    return _join([
        "Write-Output 'DATABASE VIRTUALIZATION STATUS';",
        "docker exec $env:FLISK_DB_HOST pg_isready -U $env:FLISK_DB_USER -d $env:FLISK_DB_NAME *> $null;",
        "if ($LASTEXITCODE -ne 0) { Write-Output 'PostgreSQL container not running'; exit 0; }",
        "Write-Output 'LOGICAL DATABASES:';",
        "docker exec $env:FLISK_DB_HOST psql -U $env:FLISK_DB_USER -d $env:FLISK_DB_NAME -c ('SELECT datname AS database_name, pg_size_pretty(pg_database_size(datname)) AS size FROM pg_database WHERE datname LIKE ''' + $env:FLISK_DB_PREFIX + '_%'' ORDER BY datname;');",
        "Write-Output 'MEMORY: 1 shared PostgreSQL container instead of one per service.';",
        "exit 0;",
    ])

def memory_summary_script():
    return _join([
        "Write-Output 'DATABASE VIRTUALIZATION SUMMARY';",
        "Write-Output 'BEFORE: one PostgreSQL container per service (about 256MB RAM each).';",
        "Write-Output 'AFTER: one shared PostgreSQL container with a logical database per service (about 512MB-1GB total).';",
        "exit 0;",
    ])

def prebuild_image_script():
    """Copy the Dockerfile, write its allowlist .dockerignore and docker build it.

    env: FLISK_DOCKERFILE, FLISK_PREBUILD, FLISK_IGNORE, FLISK_TARGET, FLISK_TAG, FLISK_BUILD_CONTEXT.
    """
    return _join([
        "Copy-Item -LiteralPath $env:FLISK_DOCKERFILE -Destination $env:FLISK_PREBUILD -Force;",
        "if (-not $?) { exit 1; }",
        "[IO.File]::WriteAllText($env:FLISK_PREBUILD + '.dockerignore', $env:FLISK_IGNORE, (New-Object Text.UTF8Encoding($false)));",
        "docker build --network host --target $env:FLISK_TARGET -f $env:FLISK_PREBUILD -t $env:FLISK_TAG $env:FLISK_BUILD_CONTEXT;",
        "exit $LASTEXITCODE;",
    ])

def pytest_script():
    """pytest-on-save inside the service container.

    env: FLISK_PROJECT, FLISK_COMPOSE_FILE, FLISK_SERVICE, FLISK_TEST_PATH, FLISK_TEST_DIR (empty when the test path is .), FLISK_RES_PATH.
    """
    inner = (
        "if ! command -v pytest >/dev/null 2>&1; then "
        + "echo '[flisk] Error: pytest is not installed in container '$1'.'; "
        + "echo '[flisk] Hint: Add pytest to pyproject.toml dev dependencies.'; "
        + "exit 1; fi; exec pytest $2"
    ).replace("'", "''")
    return _join([
        "$p = $env:FLISK_PROJECT; $f = $env:FLISK_COMPOSE_FILE; $svc = $env:FLISK_SERVICE; $tp = $env:FLISK_TEST_PATH; $td = $env:FLISK_TEST_DIR; $rp = $env:FLISK_RES_PATH;",
        "$running = docker compose -p $p -f $f ps --status running -q $svc 2>$null | Select-Object -First 1;",
        "if (-not $running) { Write-Output ('[flisk] Container ' + $svc + ' is not currently running; skipping pytest'); exit 0; }",
        "if (($tp -ne '.') -and $td -and -not (Test-Path -LiteralPath $td)) { Write-Output ('[flisk] Test path ' + $tp + ' does not exist; skipping pytest'); exit 0; }",
        "if (($tp -ne '.') -and $td -and (Test-Path -LiteralPath $td -PathType Container)) {",
        "  docker compose -p $p -f $f cp ($td + '/.') ($svc + ':/app/' + $rp + '/' + $tp) 2>$null;",
        "  if ($LASTEXITCODE -ne 0) { docker cp ($td + '/.') ($running + ':/app/' + $rp + '/' + $tp) 2>$null; }",
        "}",
        "$inner = '" + inner + "';",
        "docker compose -p $p -f $f exec -T $svc sh -c $inner sh $svc $tp;",
        "exit $LASTEXITCODE;",
    ])

def healthy_script():
    """Wait until a Compose service container is healthy.

    env: FLISK_JOB, FLISK_MAX_POLLS, FLISK_COMPOSE (JSON array of the `docker` arguments, without the leading docker).
    """
    return _join([
        "$job = $env:FLISK_JOB; $max = [int]$env:FLISK_MAX_POLLS; $ca = @(ConvertFrom-Json $env:FLISK_COMPOSE); $exited = 0;",
        "for ($i = 0; $i -lt $max; $i++) {",
        "  $id = docker @ca ps -q $job 2>$null | Select-Object -First 1;",
        "  if (-not $id) { $id = docker @ca ps -a -q $job 2>$null | Select-Object -First 1; }",
        "  if (-not $id) { Start-Sleep -Seconds 1; continue; }",
        "  $state = docker inspect --format '{{.State.Status}}' $id 2>$null;",
        "  $code = docker inspect --format '{{.State.ExitCode}}' $id 2>$null;",
        "  if ($state -eq 'dead') { Write-Output ('ERROR: container ' + $job + ' is dead (exit code ' + $code + ')'); exit 1; }",
        "  if ($state -eq 'exited') {",
        "    $policy = docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' $id 2>$null;",
        "    if ((-not $policy) -or $policy -eq 'no') {",
        "      $exited++;",
        "      if ($exited -ge 5) { Write-Output ('ERROR: container ' + $job + ' exited with code ' + $code + ' and will not restart (restart: ' + $policy + ')'); exit 1; }",
        "    } else { $exited = 0; }",
        "  } else { $exited = 0; }",
        "  $hasHealth = docker inspect --format '{{if .State.Health}}yes{{else}}no{{end}}' $id 2>$null;",
        "  if ($hasHealth -eq 'no') {",
        "    if ($state -eq 'running') { Write-Output ($job + ' has no health check configured, proceeding once running'); exit 0; }",
        "  } else {",
        "    $health = docker inspect --format '{{.State.Health.Status}}' $id 2>$null;",
        "    if ($health -eq 'healthy') { Write-Output ($job + ' is healthy'); exit 0; }",
        "    if ($health -eq 'unhealthy') {",
        "      $log = @(docker inspect --format '{{json .State.Health.Log}}' $id 2>$null | ConvertFrom-Json);",
        "      $streak = [int](docker inspect --format '{{.State.Health.FailingStreak}}' $id 2>$null);",
        "      $ran = @($log | Where-Object { $o = [string]$_.Output; -not ((($_.ExitCode -eq -1) -and ($o -match 'OCI runtime exec failed')) -or (($_.ExitCode -eq 127) -and ($o -match 'not found')) -or (($_.ExitCode -eq 126) -and ($o -match 'permission denied|cannot execute|not executable|is a directory'))) }).Count;",
        "      $shell = @($log | Where-Object { $_.ExitCode -eq 126 -or $_.ExitCode -eq 127 }).Count;",
        "      if ($state -eq 'running' -and $log.Count -gt 0 -and $ran -eq 0 -and -not ($shell -gt 0 -and $streak -gt $log.Count)) { Write-Output ('WARNING: ' + $job + ' health check cannot run in its image (command not found or not executable), proceeding because the container is running'); exit 0; }",
        "      Write-Output ('ERROR: ' + $job + ' is unhealthy'); exit 1;",
        "    }",
        "  }",
        "  Start-Sleep -Seconds 1;",
        "}",
        "Write-Output ('ERROR: timed out waiting for ' + $job + ' to become healthy (waited ' + $max + 's)'); exit 1;",
    ])

def job_done_script():
    """Wait for a one-shot job container to exit; fail unless it exited 0, then copy its output env file.

    env: FLISK_JOB, FLISK_COMPOSE (JSON array of docker arguments). File modes (chmod 700/600) are not applied on Windows.
    """
    return _join([
        "$job = $env:FLISK_JOB; $ca = @(ConvertFrom-Json $env:FLISK_COMPOSE);",
        "$id = docker @ca ps -a -q $job 2>$null | Select-Object -First 1;",
        "if (-not $id) { Write-Output ('no container for ' + $job); exit 1; }",
        "$code = (docker wait $id | Select-Object -First 1);",
        "$out = '.flisk/outputs/' + $job + '.env';",
        "if ([string]$code -ne '0') { Remove-Item -LiteralPath $out -Force -ErrorAction SilentlyContinue; Write-Output ($job + ' exited with code ' + $code); exit 1; }",
        "New-Item -ItemType Directory -Force -Path '.flisk/outputs' | Out-Null;",
        "docker cp ($id + ':/tmp/flisk-output.env') $out 2>$null;",
        "Write-Output ($job + ' finished (exit code 0)'); exit 0;",
    ])

def typecheck_script():
    """Host tsc type check. env: FLISK_SERVICE_DIR (service dir), FLISK_TYPECHECK (command, e.g. bunx tsc --noEmit)."""
    return _join([
        "Set-Location -LiteralPath $env:FLISK_SERVICE_DIR;",
        "bunx tsc --version *> $null; $haveTsc = ($LASTEXITCODE -eq 0);",
        "if ((-not $haveTsc) -or (-not (Test-Path -LiteralPath (Join-Path $env:FLISK_SERVICE_DIR 'node_modules/vite/package.json')))) { Write-Output ('typecheck needs host dependencies: run bun install in ' + $env:FLISK_SERVICE_DIR); exit 1; }",
        "Invoke-Expression $env:FLISK_TYPECHECK;",
        "exit $LASTEXITCODE;",
    ])

def golden_build_script():
    """Build the golden layer images (PowerShell twin of _GOLDEN_BUILD_TEMPLATE in golden_image_build.star).

    env: FLISK_GOLDEN_CONFIG, JSON {df, root, hash_label, images[], legacy[], layers[{key, target, ref}]}.
    Also reads FLISK_GOLDEN_REBUILD, FLISK_GOLDEN_REGISTRY and FLISK_GOLDEN_RETRY_DELAY from the environment.
    """
    return _join([
        "$q = [char]34; $cfg = ConvertFrom-Json $env:FLISK_GOLDEN_CONFIG;",
        "$df = (Resolve-Path -LiteralPath $cfg.df).Path; $root = (Resolve-Path -LiteralPath $cfg.root).Path;",
        "$hash = (Get-FileHash -LiteralPath $df -Algorithm SHA256).Hash.ToLower();",
        "$images = @($cfg.images); $label = $cfg.hash_label;",
        "if (-not $env:FLISK_GOLDEN_REBUILD) {",
        "  $fresh = $true;",
        "  foreach ($img in $images) {",
        "    $have = docker image inspect -f ('{{index .Config.Labels ' + $q + $label + $q + '}}') $img 2>$null;",
        "    if ([string]$have -ne $hash) { $fresh = $false; }",
        "  }",
        "  if ($fresh) { Write-Output ('Golden images are up to date (hash ' + $hash + ') - skipping build'); exit 0; }",
        "}",
        "if ($env:FLISK_GOLDEN_REGISTRY -and -not $env:FLISK_GOLDEN_REBUILD) {",
        "  $tag12 = $hash.Substring(0, 12); $pulled = $true;",
        "  foreach ($l in @($cfg.layers)) {",
        "    $remote = $env:FLISK_GOLDEN_REGISTRY + '/golden-' + $l.key + ':' + $tag12;",
        "    docker pull -q $remote *> $null;",
        "    if ($LASTEXITCODE -eq 0) { docker tag $remote $l.ref; if ($LASTEXITCODE -ne 0) { $pulled = $false; } } else { $pulled = $false; }",
        "  }",
        "  if ($pulled) { Write-Output ('Golden images pulled from ' + $env:FLISK_GOLDEN_REGISTRY + ' (hash ' + $tag12 + ')'); exit 0; }",
        "  Write-Output ('No prebuilt golden images for ' + $tag12 + ' in ' + $env:FLISK_GOLDEN_REGISTRY + '; building them here');",
        "}",
        "Write-Output ('Building golden layered images (' + $images.Count + ' total)...');",
        "docker buildx version *> $null;",
        "if ($LASTEXITCODE -eq 0) {",
        "  Write-Output 'Building all golden targets with one docker buildx bake';",
        "  $dfH = $df.Replace('\\', '/'); $rootH = $root.Replace('\\', '/');",
        "  $hcl = 'variable ' + $q + 'HASH' + $q + ' {' + [char]10 + '  default = ' + $q + $q + [char]10 + '}' + [char]10;",
        "  $names = (@($cfg.layers) | ForEach-Object { $q + $_.key + $q }) -join ', ';",
        "  $hcl += 'group ' + $q + 'default' + $q + ' {' + [char]10 + '  targets = [' + $names + ']' + [char]10 + '}' + [char]10;",
        "  foreach ($l in @($cfg.layers)) {",
        "    $hcl += 'target ' + $q + $l.key + $q + ' {' + [char]10 + '  dockerfile = ' + $q + $dfH + $q + [char]10 + '  context = ' + $q + $rootH + $q + [char]10;",
        "    $hcl += '  target = ' + $q + $l.target + $q + [char]10 + '  tags = [' + $q + $l.ref + $q + ']' + [char]10;",
        "    $hcl += '  labels = {' + [char]10 + '    ' + $q + $label + $q + ' = HASH' + [char]10 + '  }' + [char]10 + '}' + [char]10;",
        "  }",
        "  [IO.File]::WriteAllText((Join-Path (Get-Location).Path 'golden-layers.bake.hcl'), $hcl, (New-Object Text.UTF8Encoding($false)));",
        "  $allow = @();",
        "  $ver = [regex]::Match([string](docker buildx version 2>$null), 'v(\\d+)\\.(\\d+)');",
        "  if ($ver.Success -and (([int]$ver.Groups[1].Value -gt 0) -or ([int]$ver.Groups[2].Value -ge 19))) { $allow = @('--allow', ('fs.read=' + $rootH)); }",
        "  $env:HASH = $hash; $attempt = 1;",
        "  while ($true) {",
        "    docker buildx bake @allow -f golden-layers.bake.hcl --load;",
        "    if ($LASTEXITCODE -eq 0) { break; }",
        "    if ($attempt -ge 3) { Write-Output ('Golden layers build failed after ' + $attempt + ' attempts (see the first error above)'); exit 1; }",
        "    $step = 10; if ($env:FLISK_GOLDEN_RETRY_DELAY) { $step = [int]$env:FLISK_GOLDEN_RETRY_DELAY; }",
        "    $delay = $attempt * $step;",
        "    Write-Output ('docker buildx bake failed (attempt ' + $attempt + ' of 3) - retrying in ' + $delay + 's');",
        "    Start-Sleep -Seconds $delay; $attempt++;",
        "  }",
        "} else {",
        "  Write-Output 'docker buildx is not available - building golden targets one at a time';",
        "  foreach ($l in @($cfg.layers)) {",
        "    docker build --label ($label + '=' + $hash) -f $df --target $l.target -t $l.ref $root;",
        "    if ($LASTEXITCODE -ne 0) { exit 1; }",
        "  }",
        "}",
        "foreach ($img in @($cfg.legacy)) { docker image rm $img *> $null; if ($LASTEXITCODE -eq 0) { Write-Output ('Removed legacy golden image ' + $img); } }",
        "$missing = @();",
        "foreach ($img in $images) { docker image inspect -f '{{.Id}}' $img *> $null; if ($LASTEXITCODE -ne 0) { $missing += $img; } }",
        "if ($missing.Count -gt 0) { Write-Output ('Golden images missing after the build: ' + ($missing -join ' ')); exit 1; }",
        "Write-Output ('Golden layers built (' + $images.Count + ' images):');",
        "foreach ($img in $images) { Write-Output ('  ' + $img); }",
        "exit 0;",
    ])

def tilt_image_tags_script():
    """Long-running cleanup of superseded tilt-* image tags (PowerShell twin of TILT_IMAGE_TAGS_SCRIPT). env: FLISK_REPO_PREFIX."""
    return _join([
        "$prefix = $env:FLISK_REPO_PREFIX; $script:pending = @();",
        "function Get-Epoch([string]$t) { try { return [DateTimeOffset]::Parse(($t -replace '\\.\\d+', '')).ToUnixTimeSeconds(); } catch { return $null; } }",
        "function Clean-Repo([string]$repo) {",
        "  $dev = docker image inspect -f '{{.Id}} {{.Created}}' ($repo + ':dev') 2>$null;",
        "  if ($LASTEXITCODE -ne 0 -or -not $dev) { return; }",
        "  $devId = ([string]$dev).Split(' ')[0]; $devAt = Get-Epoch (([string]$dev).Split(' ', 2)[1]);",
        "  foreach ($ref in @(docker image ls --format '{{.Repository}}:{{.Tag}}' $repo 2>$null)) {",
        "    if (-not ([string]$ref).StartsWith($repo + ':tilt-')) { continue; }",
        "    $img = docker image inspect -f '{{.Id}} {{.Created}}' $ref 2>$null;",
        "    if ($LASTEXITCODE -ne 0 -or -not $img) { continue; }",
        "    $imgId = ([string]$img).Split(' ')[0];",
        "    if ($imgId -ne $devId) {",
        "      $imgAt = Get-Epoch (([string]$img).Split(' ', 2)[1]);",
        "      if (($null -eq $imgAt) -or ($null -eq $devAt) -or ($imgAt -ge $devAt)) { continue; }",
        "    }",
        "    docker image rm $ref *> $null;",
        "    if ($LASTEXITCODE -eq 0) { Write-Output ('removed ' + $ref); }",
        "    else {",
        "      docker image inspect $ref *> $null;",
        "      if (($LASTEXITCODE -eq 0) -and ($script:pending -notcontains $repo)) { $script:pending += $repo; }",
        "    }",
        "  }",
        "}",
        "$since = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds();",
        "foreach ($ref in @(docker image ls --format '{{.Repository}}:{{.Tag}}' 2>$null)) {",
        "  if (([string]$ref).StartsWith($prefix) -and ([string]$ref).EndsWith(':dev')) { Clean-Repo ([string]$ref).Substring(0, ([string]$ref).Length - 4); }",
        "}",
        "docker events --since $since --filter type=image --filter event=tag --filter type=container --filter event=destroy --format '{{.Type}} {{.Action}} {{.Actor.Attributes.name}}' | ForEach-Object {",
        "  $parts = ([string]$_).Split(' ', 3); $type = $parts[0]; $action = $parts[1]; $name = $parts[2];",
        "  if (($type + ' ' + $action) -eq 'image tag') {",
        "    if ($name.StartsWith($prefix) -and $name.EndsWith(':dev')) { Clean-Repo $name.Substring(0, $name.Length - 4); }",
        "  } elseif ((($type + ' ' + $action) -eq 'container destroy') -and ($script:pending.Count -gt 0)) {",
        "    $retry = $script:pending; $script:pending = @();",
        "    foreach ($repo in $retry) { Clean-Repo $repo; }",
        "  }",
        "}",
    ])
