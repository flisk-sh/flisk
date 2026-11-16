// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { isPlainObject } from "./is-plain-object.js";

/**
 * `volumes` (#1748): named volumes and bind mounts for a bring-your-own resource. Mirrors engine/.../compose/byo_volumes.star,
 * which refuses the same values. A bind mount's `source` is relative to the service directory and must stay inside the project;
 * `serviceDepth` is how many directories the service sits below the project root (unknown when validating a manifest alone).
 */
export function volumesErrors(
  manifest: Record<string, unknown>,
  displayPath: string,
  serviceDepth?: number,
): string[] {
  const volumes = manifest.volumes;
  if (volumes === undefined || volumes === null) return [];
  const field = `${displayPath}.volumes`;
  if (!Array.isArray(volumes))
    return [`${field}: expected a list such as [{ "source": "data", "target": "/data" }]`];
  if (manifest.appType !== "bring-your-own") {
    return [`${field}: only applies to bring-your-own resources (appType "bring-your-own")`];
  }
  const errors: string[] = [];
  const targets = new Set<string>();
  volumes.forEach((entry: unknown, i) => {
    const at = `${field}[${i}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${at}: expected an object such as { "source": "data", "target": "/data" }`);
      return;
    }
    for (const key of Object.keys(entry)) {
      if (!["source", "target", "readOnly", "name", "selinux"].includes(key)) {
        errors.push(`${at}.${key}: unknown option (use source, target, readOnly, name, selinux)`);
      }
    }
    const { target, readOnly, name, selinux } = entry;
    // A bind mount's source may come from the environment: ${OM_MCP_SHARED_DIR:-./.mercato/mcp-shared}, ${NAME-./path}, or a bare
    // ${STORAGE_DIR} (an absolute path from the .env), each optionally followed by /sub/path. A default is checked like any
    // other bind path; "./" stands in for a bare variable.
    const variable =
      typeof entry.source === "string"
        ? /^\$\{[A-Za-z_][A-Za-z0-9_]*(?::?-(\.{1,2}(?:\/[A-Za-z0-9_.-]+)*\/?))?\}((?:\/[A-Za-z0-9_.-]+)*)$/.exec(
            entry.source,
          )
        : null;
    const badSuffix = variable?.[2]
      ?.split("/")
      .some((segment) => segment === "." || segment === "..");
    if (
      typeof entry.source === "string" &&
      entry.source.startsWith("${") &&
      (!variable || badSuffix)
    ) {
      errors.push(
        `${at}.source: variables must be \${NAME}, \${NAME:-./path} or \${NAME-./path}, optionally followed by /sub/path, with a default path starting with ./ or ../`,
      );
      return;
    }
    const source = variable ? (variable[1] ?? "./") : entry.source;
    if (selinux !== undefined) {
      if (selinux !== "z" && selinux !== "Z") {
        errors.push(`${at}.selinux: expected z (shared) or Z (private)`);
      } else if (typeof source === "string" && !source.startsWith(".")) {
        errors.push(`${at}.selinux: only applies to a bind mount`);
      }
    }
    if (
      typeof source !== "string" ||
      !/^([a-z0-9][a-z0-9_-]*|\.{1,2}(\/[A-Za-z0-9_.-]+)*\/?)$/.test(source)
    ) {
      errors.push(
        `${at}.source: expected a volume name such as data, or a path starting with ./ such as ./config`,
      );
    } else if (serviceDepth !== undefined && source.startsWith(".")) {
      let depth = serviceDepth;
      for (const segment of source.split("/")) {
        if (segment === "..") depth -= 1;
        else if (segment !== "." && segment !== "") depth += 1;
        if (depth < 0) break;
      }
      if (depth < 0) errors.push(`${at}.source: must stay inside the project`);
    }
    if (
      typeof target !== "string" ||
      !/^\/[A-Za-z0-9_./-]*$/.test(target) ||
      `${target}/`.includes("/../")
    ) {
      errors.push(`${at}.target: expected an absolute path in the container such as /data`);
    } else if (targets.has(target)) {
      errors.push(`${at}.target: ${target} is mounted twice`);
    } else {
      targets.add(target);
    }
    if (readOnly !== undefined && typeof readOnly !== "boolean") {
      errors.push(`${at}.readOnly: expected true or false`);
    }
    // `name` is the Docker volume's own name, such as the one an existing Compose install created (tubehaus_tubehaus-data).
    if (name !== undefined) {
      if (typeof name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)) {
        errors.push(
          `${at}.name: expected a Docker volume name such as myapp_data (letters, digits, '_', '.' and '-')`,
        );
      } else if (typeof source === "string" && source.startsWith(".")) {
        errors.push(`${at}.name: only applies to a named volume, not a bind mount`);
      }
    }
  });
  return errors;
}
