// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { lookup } from "node:dns/promises";
import type { CheckResult } from "../types/index.js";
import { parsePublishedPortHolders, probeHostPort } from "./doctor-runtime.js";
import { findProjectRoot } from "./paths.js";
import { getProjectName } from "./service-urls.js";
import { findOnPath } from "./which.js";

const WINDOWS_DNS_FAILURE =
  "Windows did not resolve *.flisk.localhost to 127.0.0.1. Browser URLs with hostnames will fail until you fix hosts or use the 127.0.0.1 URLs printed by flisk networks.";

function loopbackAddresses(addresses: string[]): boolean {
  return (
    addresses.length > 0 &&
    addresses.every((address) => address === "127.0.0.1" || address === "::1")
  );
}

export function parseExcludedPortRanges(output: string): Array<[number, number]> {
  return output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)(?:\s|$)/);
    return match ? [[Number(match[1]), Number(match[2])] as [number, number]] : [];
  });
}

export function findExternallyOccupiedPorts(
  occupied: number[],
  dockerHolders: ReturnType<typeof parsePublishedPortHolders>,
  projectName: string,
): number[] {
  const prefix = projectName.replace(/-/g, "_").toLowerCase();
  return occupied.filter((port) => {
    const holder = dockerHolders.find((candidate) => candidate.publishedPorts.includes(port));
    if (!holder || !prefix) return true;
    const name = holder.name.toLowerCase();
    return !name.startsWith(`${prefix}_`) && !name.startsWith(`${prefix}-`);
  });
}

function checkDockerTool(): string | null {
  return findOnPath("docker");
}

export function checkWindowsRuntimeTools(): CheckResult {
  const docker = checkDockerTool();
  if (!docker) {
    return {
      name: "Windows Runtime Tools",
      didPass: false,
      message: "Docker is not running or not installed.",
      fix: '1. Install Docker Desktop: https://www.docker.com/products/docker-desktop/\n2. Start Docker Desktop and wait for "Running" status\n3. Enable WSL2 backend in Settings → General\n4. Enable WSL Integration for Ubuntu in Settings → Resources → WSL Integration\n5. Verify: docker version && docker compose version\nDocs: https://docs.docker.com/desktop/wsl/',
    };
  }
  if (!findOnPath("tilt")) {
    return {
      name: "Windows Runtime Tools",
      didPass: false,
      message: "tilt.exe not found on PATH.",
      fix: "Install Tilt:\n  curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh | bash\nOr download from: https://docs.tilt.dev/install.html\nVerify: tilt version",
    };
  }
  const bun = findOnPath("bun");
  const npmInstall = (process.argv[1] ?? "").toLowerCase().includes("node_modules");
  const node = npmInstall ? findOnPath("node") : true;
  if (!node) {
    return {
      name: "Windows Runtime Tools",
      didPass: false,
      message: "node.exe not found on PATH for this npm installation.",
      fix: "Install Node.js 22.12+: https://nodejs.org/\nOr use Bun (includes Node.js): https://bun.sh/install",
    };
  }
  return {
    name: "Windows Runtime Tools",
    didPass: true,
    message: bun
      ? `Docker (${docker}), Tilt, and Bun found on PATH`
      : `Docker (${docker}) and Tilt found on PATH; ⚠️ Bun was not found (generated services need Bun)\n  Fix: curl -fsSL https://bun.sh/install | bash\n  Verify: bun --version`,
  };
}

export function checkWindowsDockerMode(): CheckResult {
  try {
    const osType = execFileSync(
      findOnPath("docker") ?? "docker",
      ["info", "--format", "{{.OSType}}"],
      {
        encoding: "utf-8",
        timeout: 10_000,
        windowsHide: true,
      },
    ).trim();
    if (osType.toLowerCase() === "windows") {
      return {
        name: "Docker container mode",
        didPass: false,
        message: "Docker Desktop is using Windows containers. Flisk requires Linux containers.",
        fix: '1. Open Docker Desktop → Settings → General\n2. Ensure "Use WSL 2 instead of Hyper-V" is checked\n3. Click "Apply & Restart"\n4. Verify: docker info --format \'{{.OSType}}\' (should print "linux")\nDocs: https://docs.docker.com/desktop/wsl/',
      };
    }
    return {
      name: "Docker container mode",
      didPass: true,
      message: "Docker Desktop is using Linux containers",
    };
  } catch {
    return {
      name: "Docker container mode",
      didPass: false,
      message: "Docker daemon is not responding.",
      fix: '1. Start Docker Desktop and wait for "Running" status\n2. Verify: docker version\n3. If stuck: restart Docker Desktop or run `systemctl restart docker` in WSL2\nDocs: https://docs.docker.com/desktop/troubleshoot/',
    };
  }
}

export async function checkWindowsHostConfiguration(): Promise<CheckResult> {
  const warnings: string[] = [];
  let excludedRanges: Array<[number, number]> = [];
  try {
    const output = execFileSync(
      "netsh",
      ["interface", "ipv4", "show", "excludedportrange", "protocol=tcp"],
      { encoding: "utf-8", timeout: 10_000, windowsHide: true },
    );
    excludedRanges = parseExcludedPortRanges(output);
  } catch {
    warnings.push(
      "Could not inspect Windows Hyper-V excluded TCP port ranges.\n  Fix: run as Administrator: netsh interface ipv4 show excludedportrange protocol=tcp\n  If netsh fails, this check is skipped.",
    );
  }

  const requiredPorts = [80, 443, 5432];
  const excluded = requiredPorts.filter((port) =>
    excludedRanges.some(([start, end]) => port >= start && port <= end),
  );
  if (excluded.length > 0) {
    warnings.push(
      `⚠️ Windows reserved port${excluded.length > 1 ? "s" : ""} ${excluded.join(", ")} for Hyper-V/WSL.\n  Fix 1 (reset reserved ranges): run as Administrator: net stop winnat && net start winnat\n  Fix 2 (change Flisk ports): set FLISK_HTTP_PORT, FLISK_HTTPS_PORT, FLISK_POSTGRES_PORT in project config\n  Verify: flisk doctor\n  Docs: https://github.com/flisk-sh/flisk/blob/main/docs/wsl2.md#troubleshooting`,
    );
  }

  const occupied: number[] = [];
  for (const port of requiredPorts) {
    if ((await probeHostPort(port)) === "in-use") occupied.push(port);
  }
  let dockerHolders: ReturnType<typeof parsePublishedPortHolders> = [];
  try {
    const dockerPs = execFileSync(
      findOnPath("docker") ?? "docker",
      ["ps", "--format", "{{.Names}}\\t{{.Ports}}"],
      { encoding: "utf-8", timeout: 10_000, windowsHide: true },
    );
    dockerHolders = parsePublishedPortHolders(dockerPs, requiredPorts);
  } catch {
    // Runtime checks report Docker daemon errors independently.
  }
  const projectName = findProjectRoot() ? getProjectName() : "";
  const externallyOccupied = findExternallyOccupiedPorts(occupied, dockerHolders, projectName);
  if (externallyOccupied.length > 0) {
    try {
      const owners = execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          `$ports = '${externallyOccupied.join(",")}'.Split(','); foreach ($port in $ports) { Get-NetTCPConnection -LocalPort ([int]$port) -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $connection = $_; $service = Get-CimInstance Win32_Service | Where-Object { $_.ProcessId -eq $connection.OwningProcess } | Select-Object -First 1; if ([int]$port -eq 80 -and ($service.Name -eq 'W3SVC' -or $connection.OwningProcess -eq 4)) { '80: IIS / World Wide Web Publishing (HTTP.sys)' } elseif ($service) { '{0}: {1}' -f $port, $service.DisplayName } else { '{0}: PID {1}' -f $port, $connection.OwningProcess } } }`,
        ],
        { encoding: "utf-8", timeout: 10_000, windowsHide: true },
      ).trim();
      warnings.push(
        `⚠️ Ports ${externallyOccupied.join(", ")} are already listening${owners ? `:\n${owners}` : "."}\n  Fix: stop the conflicting service or change Flisk ports (FLISK_HTTP_PORT, etc.)\n  Verify: flisk doctor\n  Docs: https://github.com/flisk-sh/flisk/blob/main/docs/wsl2.md#troubleshooting`,
      );
    } catch {
      warnings.push(
        `⚠️ Ports ${externallyOccupied.join(", ")} are already in use.\n  Fix: netstat -ano | findstr :${externallyOccupied.join(" :")}\n  Verify: flisk doctor`,
      );
    }
  }

  let dnsOk = true;
  for (const host of ["flisk.localhost", "example.flisk.localhost"]) {
    try {
      const records = await lookup(host, { all: true, verbatim: true });
      if (!loopbackAddresses(records.map((record) => record.address))) dnsOk = false;
    } catch {
      dnsOk = false;
    }
  }
  if (!dnsOk) {
    warnings.push(
      `${WINDOWS_DNS_FAILURE}\n  Fix: add these lines to C:\\Windows\\System32\\drivers\\etc\\hosts (run Notepad as Administrator):\n    127.0.0.1 flisk.localhost\n    127.0.0.1 example.flisk.localhost\n  Verify: ping flisk.localhost (should resolve to 127.0.0.1)\n  Docs: https://github.com/flisk-sh/flisk/blob/main/docs/wsl2.md#troubleshooting`,
    );
  }

  try {
    const autocrlf = execFileSync("git", ["config", "core.autocrlf"], {
      encoding: "utf-8",
      timeout: 5_000,
      windowsHide: true,
    }).trim();
    if (autocrlf.toLowerCase() === "true") {
      warnings.push(
        'git core.autocrlf is true; generated files may get CRLF while Docker Linux containers expect LF.\n  Fix: git config core.autocrlf input (run in Flisk repo root)\n  Verify: git config core.autocrlf (should show "input")',
      );
    }
  } catch {
    // No repository-local setting to report.
  }

  warnings.push(
    "Docker Desktop Settings → Resources → File sharing must include this project directory.\n  Fix: Docker Desktop → Settings → Resources → File sharing → add project path\n  Verify: flisk doctor",
  );
  return {
    name: "Windows ports and DNS",
    didPass: dnsOk && externallyOccupied.length === 0,
    message:
      warnings.length > 0
        ? warnings.join("\n\n")
        : "Required ports are available and Flisk localhost DNS resolves to loopback",
    ...(dnsOk ? {} : { fix: WINDOWS_DNS_FAILURE }),
  };
}
