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
  "Windows did not resolve *.tdk.localhost to 127.0.0.1. Browser URLs with hostnames will fail until you fix hosts or use the 127.0.0.1 URLs printed by flisk networks.";

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
      message:
        "Docker is not running. Start Docker Desktop, wait until it is Running, then retry flisk doctor.",
      fix: "Install Docker Desktop and start it in Linux container mode.",
    };
  }
  if (!findOnPath("tilt")) {
    return {
      name: "Windows Runtime Tools",
      didPass: false,
      message: "tilt.exe not found on PATH. Install Tilt from https://docs.tilt.dev/install.html",
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
    };
  }
  return {
    name: "Windows Runtime Tools",
    didPass: true,
    message: bun
      ? `Docker (${docker}), Tilt, and Bun found on PATH`
      : `Docker (${docker}) and Tilt found on PATH; ⚠️ Bun was not found (generated services need Bun)`,
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
        message:
          "Docker Desktop is using Windows containers. Switch to Linux containers. Flisk stacks are Linux images.",
        fix: "Switch Docker Desktop to Linux containers. Flisk does not run Windows containers.",
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
      message:
        "Docker is not running. Start Docker Desktop, wait until it is Running, then retry flisk doctor.",
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
    warnings.push("Could not inspect Windows Hyper-V excluded TCP port ranges.");
  }

  const requiredPorts = [80, 443, 5432];
  const excluded = requiredPorts.filter((port) =>
    excludedRanges.some(([start, end]) => port >= start && port <= end),
  );
  if (excluded.length > 0) {
    warnings.push(
      `⚠️ Windows reserved port${excluded.length > 1 ? "s" : ""} ${excluded.join(", ")} for Hyper-V/WSL. Fix: disable the conflicting Windows feature or change Flisk ports in project config. Common fix: run \`net stop winnat\` then \`net start winnat\` in an Administrator terminal, then retry \`flisk doctor\`.`,
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
        `⚠️ Ports ${externallyOccupied.join(", ")} are already listening${owners ? `:\n${owners}` : "."}`,
      );
    } catch {
      warnings.push(`⚠️ Ports ${externallyOccupied.join(", ")} are already in use.`);
    }
  }

  let dnsOk = true;
  for (const host of ["tdk.localhost", "example.tdk.localhost"]) {
    try {
      const records = await lookup(host, { all: true, verbatim: true });
      if (!loopbackAddresses(records.map((record) => record.address))) dnsOk = false;
    } catch {
      dnsOk = false;
    }
  }
  if (!dnsOk) {
    warnings.push(
      `${WINDOWS_DNS_FAILURE}\nAdd these lines to C:\\Windows\\System32\\drivers\\etc\\hosts (Administrator Notepad):\n127.0.0.1 tdk.localhost\n127.0.0.1 example.tdk.localhost`,
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
        "git core.autocrlf is true; generated files may get CRLF while Docker Linux containers expect LF. Recommended: git config core.autocrlf input in Flisk repos.",
      );
    }
  } catch {
    // No repository-local setting to report.
  }

  warnings.push(
    "Docker Desktop Settings → Resources → File sharing must include this project directory.",
  );
  return {
    name: "Windows ports and DNS",
    didPass: dnsOk && externallyOccupied.length === 0,
    message:
      warnings.length > 0
        ? warnings.join("\n")
        : "Required ports are available and Flisk localhost DNS resolves to loopback",
    ...(dnsOk ? {} : { fix: WINDOWS_DNS_FAILURE }),
  };
}
