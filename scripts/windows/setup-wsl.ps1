# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# One command that sets up Ubuntu on WSL2 for a Flisk Docker stack, the steps of docs/start-here-on-windows.md in order.
# Run it in PowerShell on Windows. To clone your fork into Ubuntu at the same time, pass its URL:
#
#   powershell -ExecutionPolicy Bypass -File setup-wsl.ps1 -Repo https://github.com/<you>/flisk-task-starter
#
# Or without downloading it first:
#
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/flisk-sh/flisk/main/scripts/windows/setup-wsl.ps1))) -Repo https://github.com/<you>/flisk-task-starter
#
# What it does, stopping with one clear next step whenever something needs you:
#   1. Ubuntu on WSL2: installs it when missing (that needs PowerShell as administrator and usually a restart).
#   2. Docker Desktop: checks that `docker` answers inside Ubuntu (turning on WSL integration is a click it cannot make for you).
#   3. Inside Ubuntu: installs git and curl, Node.js 22 when older or missing, and Tilt; sets core.autocrlf to input.
#   4. Clones -Repo into the Ubuntu home folder (~/, not /mnt/c), then runs `flisk doctor` there.
# Running it again is safe: every step skips what is already done. Ubuntu asks for your Ubuntu password for the installs.
param(
  [string]$Repo = '',
  [string]$Distro = 'Ubuntu'
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Text) { Write-Host ''; Write-Host ('== ' + $Text) -ForegroundColor Cyan }
function Stop-With([string]$Text, [int]$Code = 1) { Write-Host ''; Write-Host $Text -ForegroundColor Yellow; exit $Code }

# The Ubuntu half. Kept in this file so the one-line install above needs no second download.
$UbuntuScript = @'
#!/usr/bin/env bash
set -euo pipefail
repo="${1:-}"

say() { printf '\n== %s\n' "$1"; }

node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  local v major minor
  v="$(node --version)"; v="${v#v}"
  major="${v%%.*}"; minor="${v#*.}"; minor="${minor%%.*}"
  [ "$major" -gt 22 ] || { [ "$major" -eq 22 ] && [ "$minor" -ge 12 ]; }
}

say "git and curl"
if command -v git >/dev/null 2>&1 && command -v curl >/dev/null 2>&1; then
  echo "already installed"
else
  sudo apt-get update -qq
  sudo apt-get install -y -qq git curl ca-certificates
fi

say "Node.js 22.12 or newer"
if node_ok; then
  echo "node $(node --version) is new enough"
else
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs
  node_ok || { echo "Node.js is still older than 22.12: install it from https://nodejs.org (Linux) and run this again"; exit 4; }
fi

say "Tilt"
if command -v tilt >/dev/null 2>&1; then
  echo "tilt $(tilt version 2>/dev/null | head -n 1)"
else
  curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh | bash
fi

say "Git keeps LF line endings"
git config --global core.autocrlf input
echo "core.autocrlf=$(git config --global core.autocrlf)"

say "Docker from Ubuntu"
if ! docker version >/dev/null 2>&1; then
  echo "docker does not answer inside Ubuntu."
  echo "Start Docker Desktop, open Settings > Resources > WSL Integration, turn on Ubuntu, click Apply & Restart, then run this again."
  exit 3
fi
echo "docker answers"

dir="$HOME"
if [ -n "$repo" ]; then
  name="$(basename "$repo")"; name="${name%.git}"
  dir="$HOME/$name"
  say "Clone $repo into ~/$name"
  if [ -d "$dir/.git" ]; then
    echo "already cloned"
  else
    git clone "$repo" "$dir"
  fi
fi

say "flisk doctor"
cd "$dir"
npx -y @flisk-sh/flisk doctor || echo "doctor reported problems above; each failed check prints its fix"

say "Done"
echo "Next, in Ubuntu:"
echo "  cd $dir"
echo "  npx @flisk-sh/flisk up"
'@

Write-Step 'WSL'
if (-not (Get-Command wsl -ErrorAction SilentlyContinue)) {
  Stop-With 'WSL is not available. Windows 10 2004+ or Windows 11 is needed. Then run: wsl --install -d Ubuntu (PowerShell as administrator).'
}

# `wsl -l -q` prints UTF-16, which reaches PowerShell 5.1 with NUL characters between letters.
$distros = @(wsl -l -q 2>$null | ForEach-Object { ($_ -replace "`0", '').Trim() } | Where-Object { $_ })
if ($distros -notcontains $Distro) {
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) {
    Stop-With ($Distro + ' is not installed. Open PowerShell as administrator (right-click > Run as administrator) and run this script again.')
  }
  Write-Host ('Installing ' + $Distro + ' on WSL2...')
  wsl --install -d $Distro
  Stop-With ('When it finishes, restart Windows if asked, open the ' + $Distro + ' app once to choose a user name and password, then run this script again (no administrator needed).') 0
}
Write-Host ($Distro + ' is installed')

Write-Step 'Docker Desktop'
wsl -d $Distro -- docker version *> $null
if ($LASTEXITCODE -ne 0) {
  Stop-With ('docker does not answer inside ' + $Distro + '. Install and start Docker Desktop (https://www.docker.com/products/docker-desktop/), open Settings > Resources > WSL Integration, turn on ' + $Distro + ', click Apply & Restart, then run this script again.') 3
}
Write-Host ('docker answers inside ' + $Distro)

Write-Step ('Set up ' + $Distro)
# Hand the script over through stdin with Windows line endings removed, then run it in its own call so sudo can ask for the
# password on the terminal.
$UbuntuScript | wsl -d $Distro -- bash -c "tr -d '\r' > /tmp/flisk-setup-wsl.sh"
if ($LASTEXITCODE -ne 0) { Stop-With 'Could not copy the setup script into Ubuntu.' }
if ($Repo) { wsl -d $Distro -- bash /tmp/flisk-setup-wsl.sh $Repo } else { wsl -d $Distro -- bash /tmp/flisk-setup-wsl.sh }
$code = $LASTEXITCODE
if ($code -ne 0) { Stop-With ('Setup stopped (exit ' + $code + '). Fix what it printed above, then run this script again.') $code }

Write-Host ''
Write-Host ('Open the ' + $Distro + ' app and run the two commands printed above. From now on, type Flisk commands in ' + $Distro + ', not in PowerShell.') -ForegroundColor Green
