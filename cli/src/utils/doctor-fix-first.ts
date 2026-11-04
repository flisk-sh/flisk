// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { CheckResult } from "../types/index.js";
import { CONTAINER_RUNTIME_CHECK } from "./constants.js";
import { DISK_SAFE_CLEANUP, DISK_SPACE_CHECK } from "./doctor-host.js";

/** One entry of the "Fix first" list: a failing check and one command that can be pasted as is. */
export interface RankedFix {
  /** 1 is the fix that unblocks the most other checks. */
  rank: number;
  /** Stable kebab-case id derived from the check name (for example `container-runtime`). */
  checkId: string;
  /** Check name as shown in the report, so a consumer can find the matching `checks` entry. */
  check: string;
  command: string;
}

interface FixRule {
  /** Lower blocks more: nothing after a stopped Docker daemon can be tested or fixed. */
  tier: number;
  command: (platform: NodeJS.Platform, result: CheckResult) => string | null;
}

const POSIX = (platform: NodeJS.Platform): boolean => platform === "darwin" || platform === "linux";

function conflictingPort(result: CheckResult): number | null {
  const match = /^\s*(\d{2,5}) \(/m.exec(result.message);
  return match ? Number(match[1]) : null;
}

function inspectPort(platform: NodeJS.Platform, port: number | null): string | null {
  if (port === null) return null;
  if (platform === "darwin") return `lsof -nP -iTCP:${port} -sTCP:LISTEN`;
  if (platform === "linux") return `ss -ltnp 'sport = :${port}'`;
  return null;
}

const RULES: Record<string, FixRule> = {
  [CONTAINER_RUNTIME_CHECK]: {
    tier: 0,
    command: (platform) =>
      platform === "darwin"
        ? "open -a Docker"
        : platform === "linux" && !process.env.WSL_DISTRO_NAME
          ? "sudo systemctl start docker"
          : null,
  },
  Colima: { tier: 1, command: (platform) => (POSIX(platform) ? "colima start" : null) },
  "Host Ports": {
    tier: 2,
    command: (platform, result) => inspectPort(platform, conflictingPort(result)),
  },
  "Ingress Ports": { tier: 2, command: () => null },
  "Tilt CLI": {
    tier: 3,
    command: (platform) =>
      POSIX(platform)
        ? "curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh | bash"
        : null,
  },
  Bun: {
    tier: 3,
    command: (platform) => (POSIX(platform) ? "curl -fsSL https://bun.sh/install | bash" : null),
  },
  "Docker Network Pool": { tier: 4, command: () => "flisk down --prune-networks" },
  "Docker networks": { tier: 4, command: () => "flisk down --prune-networks" },
  // Build cache only: it frees the most after image builds and never removes an image, container or volume a running
  // stack uses. `docker system prune -af` deleted every unused image, so the next `flisk up` rebuilt them all.
  [DISK_SPACE_CHECK]: { tier: 5, command: () => DISK_SAFE_CLEANUP },
  "Flisk installs": { tier: 6, command: () => "flisk upgrade" },
  "Flisk version": { tier: 6, command: () => "flisk upgrade" },
  "Master Configs": { tier: 7, command: () => "flisk project" },
  "Generated Runtime Assets": { tier: 7, command: () => "flisk config regenerate" },
  "Starlark Load Exports": { tier: 7, command: () => "flisk config regenerate" },
};

/** Project-level findings come after every machine-level one that has no rule. */
const UNRANKED_TIER = 99;

export function checkId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Failing checks ordered by how much they block, each with one runnable command. Hard failures come before
 * warnings (a low-disk warning never outranks a stopped daemon), and a port 5432 conflict leads the port tier.
 * Checks without a command that is valid on this platform are left out; their prose fix is still printed.
 */
export function rankDoctorFixes(
  results: CheckResult[],
  platform: NodeJS.Platform = process.platform,
): RankedFix[] {
  const candidates = results
    .filter((result) => !result.didPass && !result.isSkipped)
    .map((result, index) => {
      const rule = RULES[result.name];
      return {
        result,
        index,
        tier: rule?.tier ?? UNRANKED_TIER,
        command: rule?.command(platform, result) ?? null,
      };
    })
    .filter((entry): entry is typeof entry & { command: string } => entry.command !== null);
  const weight = (entry: (typeof candidates)[number]): number =>
    (entry.result.isWarning ? 1000 : 0) +
    entry.tier * 10 +
    (entry.result.name === "Host Ports" && conflictingPort(entry.result) === 5432 ? 0 : 1);
  candidates.sort((left, right) => weight(left) - weight(right) || left.index - right.index);
  return candidates.map((entry, position) => ({
    rank: position + 1,
    checkId: checkId(entry.result.name),
    check: entry.result.name,
    command: entry.command,
  }));
}

/** The human "Fix first" section, or an empty list when there is nothing to run. */
export function formatFixFirst(fixes: RankedFix[]): string[] {
  if (fixes.length === 0) return [];
  return fixes.flatMap((fix) => [`  ${fix.rank}. ${fix.check}`, `     ${fix.command}`]);
}
