// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { isPlainObject } from "./is-plain-object.js";

/**
 * Patterns for `container` (#2907), the bring-your-own container runtime options. Each value is written into the generated Compose
 * YAML as it is, so engine/.../compose/byo_container.star checks the same characters.
 */
const CONTAINER_STRING_LISTS = {
  capAdd: { pattern: /^[A-Z_]+$/, expected: "capability names such as NET_ADMIN" },
  capDrop: { pattern: /^[A-Z_]+$/, expected: "capability names such as ALL" },
  securityOpt: {
    pattern: /^[A-Za-z0-9_.:=/-]+$/,
    expected: "options such as no-new-privileges:true",
  },
} as const;
const CONTAINER_KEYS = new Set([
  ...Object.keys(CONTAINER_STRING_LISTS),
  "command",
  "entrypoint",
  "init",
  "readOnly",
  "user",
  "shmSize",
  "tmpfs",
  "gpus",
  "cpus",
  "memory",
  "ipc",
  "stopGracePeriod",
  "extraHosts",
  "ulimits",
  "networkAliases",
]);
const ULIMIT_NAMES = [
  "as",
  "core",
  "cpu",
  "data",
  "fsize",
  "locks",
  "memlock",
  "msgqueue",
  "nice",
  "nofile",
  "nproc",
  "rss",
  "rtprio",
  "rttime",
  "sigpending",
  "stack",
];
const DURATION_PATTERN = /^([0-9]+(\.[0-9]+)?(us|ms|s|m|h))+$/;
const isUlimit = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= -1;

/** `name:address` for Compose extra_hosts: host-gateway, an IPv4 address, or an IPv6 address. */
function isExtraHost(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const colon = value.indexOf(":");
  if (colon < 0) return false;
  const name = value.slice(0, colon);
  const address = value.slice(colon + 1);
  if (!/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(name)) return false;
  // A Compose variable for the address: ${NAME}, ${NAME:-address} or ${NAME-address} (open-mercato's OM_HOST_GATEWAY).
  const variable = /^\$\{([A-Za-z_][A-Za-z0-9_]*)(?::?-(.*))?\}$/.exec(address);
  if (variable) return variable[2] === undefined || isHostAddress(variable[2]);
  return isHostAddress(address);
}

function isHostAddress(address: string): boolean {
  if (address === "host-gateway") return true;
  const octets = address.split(".");
  if (octets.length === 4 && octets.every((o) => /^[0-9]{1,3}$/.test(o) && Number(o) <= 255)) {
    return true;
  }
  // An IPv6 address has at least two colons; a lone ":" would resolve to "name::" and the daemon rejects it.
  return (address.match(/:/g) ?? []).length >= 2 && /^[0-9A-Fa-f:]+$/.test(address);
}

/** Why `container.ulimits` is refused, or undefined. Mirrors _ulimit_lines in engine/.../compose/byo_container.star. */
function ulimitsError(ulimits: unknown): string | undefined {
  if (!isPlainObject(ulimits)) {
    return ': expected an object such as {"nofile": {"soft": 65536, "hard": 65536}}';
  }
  for (const [name, value] of Object.entries(ulimits)) {
    if (!ULIMIT_NAMES.includes(name)) return `.${name}: expected one of ${ULIMIT_NAMES.join(", ")}`;
    if (isUlimit(value)) continue;
    if (
      !isPlainObject(value) ||
      Object.keys(value).sort().join(",") !== "hard,soft" ||
      !isUlimit(value.soft) ||
      !isUlimit(value.hard)
    ) {
      return `.${name}: expected a number, or {"soft": <number>, "hard": <number>}`;
    }
    if (value.hard !== -1 && (value.soft === -1 || value.soft > value.hard)) {
      return `.${name}: soft must not be above hard`;
    }
  }
  return undefined;
}
const CONTAINER_IPC_MODES = ["host", "private", "shareable", "none"];
const SIZE_PATTERN = /^[0-9]+([bkmg]b?)?$/i;

/** `container` is only read for bring-your-own resources, and only with the keys and characters the generator writes. */
export function containerErrors(manifest: Record<string, unknown>, displayPath: string): string[] {
  const container = manifest.container;
  if (container === undefined || container === null) return [];
  const field = `${displayPath}.container`;
  if (!isPlainObject(container)) return [`${field}: expected an object`];
  if (manifest.appType !== "bring-your-own") {
    return [`${field}: only applies to bring-your-own resources (appType "bring-your-own")`];
  }
  const errors: string[] = [];
  for (const key of Object.keys(container)) {
    if (!CONTAINER_KEYS.has(key)) {
      errors.push(`${field}.${key}: unknown option (use ${[...CONTAINER_KEYS].join(", ")})`);
    }
  }
  for (const [key, { pattern, expected }] of Object.entries(CONTAINER_STRING_LISTS)) {
    const values = container[key];
    if (values === undefined || values === null) continue;
    if (
      !Array.isArray(values) ||
      !values.every((value) => typeof value === "string" && pattern.test(value))
    ) {
      errors.push(`${field}.${key}: expected a list of ${expected}`);
    }
  }
  for (const key of ["command", "entrypoint"] as const) {
    const value = container[key];
    if (value === undefined) continue;
    const good =
      Array.isArray(value) &&
      // An empty entrypoint drops the image's ENTRYPOINT (Compose `entrypoint: []`); an empty command is refused.
      (value.length > 0 || key === "entrypoint") &&
      // biome-ignore lint/suspicious/noControlCharactersInRegex: a control character would break the generated Compose YAML
      value.every((part) => typeof part === "string" && /^[^\u0000-\u001f\u007f]+$/.test(part));
    if (!good) {
      errors.push(
        `${field}.${key}: expected a list of non-empty strings without control characters${key === "entrypoint" ? " (an empty list drops the image's ENTRYPOINT)" : ""}`,
      );
    }
  }
  for (const key of ["init", "readOnly"] as const) {
    if (container[key] !== undefined && typeof container[key] !== "boolean") {
      errors.push(`${field}.${key}: expected true or false`);
    }
  }
  if (
    container.user !== undefined &&
    !(typeof container.user === "string" && /^[A-Za-z0-9_.:-]+$/.test(container.user))
  ) {
    errors.push(`${field}.user: expected a user or uid[:gid] such as 10001:10001`);
  }
  if (
    container.shmSize !== undefined &&
    !(typeof container.shmSize === "string" && SIZE_PATTERN.test(container.shmSize))
  ) {
    errors.push(`${field}.shmSize: expected a size such as 256mb or 1g`);
  }
  // GPU and HPC workloads: NVIDIA device reservations, CPU and memory limits (Flisk's defaults are 0.5 CPU and 512M) and IPC.
  const { gpus, cpus, memory, ipc } = container;
  if (gpus !== undefined && !(gpus === "all" || (Number.isInteger(gpus) && (gpus as number) > 0))) {
    errors.push(`${field}.gpus: expected "all" or a GPU count of 1 or more`);
  }
  const cpusOk =
    (Number.isInteger(cpus) && (cpus as number) > 0) ||
    (typeof cpus === "string" && /^[0-9]+(\.[0-9]{1,2})?$/.test(cpus) && Number(cpus) > 0);
  if (cpus !== undefined && !cpusOk) {
    errors.push(`${field}.cpus: expected a CPU count above 0 such as 4 or "2.5"`);
  }
  if (
    memory !== undefined &&
    !(typeof memory === "string" && SIZE_PATTERN.test(memory) && Number.parseInt(memory, 10) > 0)
  ) {
    errors.push(`${field}.memory: expected a size such as 8g or 512mb`);
  }
  const { tmpfs } = container;
  if (
    tmpfs !== undefined &&
    !(
      Array.isArray(tmpfs) &&
      tmpfs.every(
        (entry) =>
          typeof entry === "string" &&
          /^\/[A-Za-z0-9_./-]*(:[a-z0-9=,_-]+)?$/.test(entry) &&
          !`${entry.split(":")[0]}/`.includes("/../"),
      )
    )
  ) {
    errors.push(
      `${field}.tmpfs: expected a list of absolute paths with optional options, such as /tmp:noexec,nosuid,nodev,size=100m`,
    );
  }
  if (ipc !== undefined && !(typeof ipc === "string" && CONTAINER_IPC_MODES.includes(ipc))) {
    errors.push(`${field}.ipc: expected one of ${CONTAINER_IPC_MODES.join(", ")}`);
  }
  const { stopGracePeriod, extraHosts, ulimits, networkAliases } = container;
  if (
    stopGracePeriod !== undefined &&
    !(typeof stopGracePeriod === "string" && DURATION_PATTERN.test(stopGracePeriod))
  ) {
    errors.push(`${field}.stopGracePeriod: expected a duration such as 30s or 1m30s`);
  }
  if (extraHosts !== undefined && !(Array.isArray(extraHosts) && extraHosts.every(isExtraHost))) {
    errors.push(
      `${field}.extraHosts: expected a list of name:address, such as host.docker.internal:host-gateway or db:10.0.0.5`,
    );
  }
  if (ulimits !== undefined) {
    const problem = ulimitsError(ulimits);
    if (problem) errors.push(`${field}.ulimits${problem}`);
  }
  if (networkAliases !== undefined) {
    if (
      !Array.isArray(networkAliases) ||
      !networkAliases.every(
        (alias) => typeof alias === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(alias),
      )
    ) {
      errors.push(
        `${field}.networkAliases: expected a list of names such as ["mercure"] (letters, digits, '-', '_' and '.')`,
      );
    } else if (new Set(networkAliases).size !== networkAliases.length) {
      errors.push(`${field}.networkAliases: lists a name twice`);
    } else if (networkAliases.length > 0 && manifest.sidecarOf) {
      errors.push(
        `${field}.networkAliases: does not apply to a sidecar (sidecarOf), which shares another container's network`,
      );
    }
  }
  return errors;
}
