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
        "function Test-Db { $r = docker exec $h psql -U $u -d $master -tAc $query 2>$null; return (([string]$r).Trim() -eq '1'); }",
        "for ($i = 1; $i -le 30; $i++) {",
        "  if (Test-Db) { break; }",
        "  Write-Output ('Creating database ' + $db + ' (attempt ' + $i + '/30)...');",
        "  docker exec $h createdb -U $u -O $u $db *> $null;",
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
