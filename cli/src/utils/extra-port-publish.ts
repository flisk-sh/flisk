// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "./env-validator.js";

/**
 * `extraPorts[].publish` (#2947): the host side of a Compose port mapping, `"${TUBEHAUS_HTTP_BIND:-127.0.0.1:80}"`, so a
 * `.env` setting that Compose projects already use keeps working. Mirrors _parse_publish in
 * engine/.../compose/byo_ports.star. The string is written into the generated Compose file as it is, so only digits, `.`, `:`
 * and `${NAME:-default}` are accepted, and every variable must carry a default (the safe value is then visible in service.json
 * and a missing `.env` entry cannot leave the mapping empty).
 */
export interface PublishVariable {
  name: string;
  fallback: string;
}

export interface HostMapping {
  /** The host address, or null when the mapping names only a port (Docker then publishes on every interface). */
  address: string | null;
  port: number;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const LITERAL = /^[0-9.:]*$/;

/** The variables a `publish` template names, or the reason it is refused. */
export function publishVariables(publish: string): PublishVariable[] | string {
  const [head = "", ...rest] = publish.split("${");
  if (!LITERAL.test(head)) return "expected digits, '.', ':' and ${NAME:-default} only";
  const variables: PublishVariable[] = [];
  for (const part of rest) {
    const close = part.indexOf("}");
    if (close < 0) return "has a ${ without a closing }";
    const body = part.slice(0, close);
    const marker = body.indexOf(":-");
    if (marker < 0) return `\${${body}} needs a default, such as \${${body}:-127.0.0.1:80}`;
    const name = body.slice(0, marker);
    const fallback = body.slice(marker + 2);
    if (!NAME.test(name)) return "variable names must be letters, digits or _";
    if (!LITERAL.test(fallback) || !fallback) {
      return `the default of \${${name}} must be a port or address:port`;
    }
    if (!LITERAL.test(part.slice(close + 1))) {
      return "expected digits, '.', ':' and ${NAME:-default} only";
    }
    variables.push({ name, fallback });
  }
  return variables;
}

/** Substitutes each variable with `lookup(name)` (a non-empty value) or its default, like Compose's `${VAR:-default}`. */
export function substitutePublish(
  publish: string,
  lookup: (name: string) => string | undefined = () => undefined,
): string {
  return publish.replace(/\$\{([^:}]*):-([^}]*)\}/g, (_match, name: string, fallback: string) => {
    const value = lookup(name);
    return value ? value : fallback;
  });
}

/** `80` or `127.0.0.1:8080` as a host mapping, or null when it is neither. */
export function parseHostMapping(value: string): HostMapping | null {
  const parts = value.split(":");
  if (parts.length > 2) return null;
  const portText = parts[parts.length - 1] ?? "";
  if (!/^[0-9]{1,5}$/.test(portText)) return null;
  const port = Number(portText);
  if (port < 1 || port > 65535) return null;
  if (parts.length === 1) return { address: null, port };
  const address = parts[0] ?? "";
  const octets = address.split(".");
  const valid =
    octets.length === 4 &&
    octets.every((octet) => /^[0-9]{1,3}$/.test(octet) && Number(octet) <= 255);
  return valid ? { address, port } : null;
}

/** Where Compose reads a variable from: the shell of `flisk up` first, then the project `.env`. */
export function projectEnvLookup(
  projectRoot: string | undefined,
): (name: string) => string | undefined {
  let file: Map<string, string> | undefined;
  return (name) => {
    const fromShell = process.env[name];
    if (fromShell) return fromShell;
    if (!projectRoot) return undefined;
    if (!file) {
      const path = join(projectRoot, ".env");
      try {
        file = existsSync(path) ? parseEnv(readFileSync(path, "utf-8")) : new Map();
      } catch {
        file = new Map();
      }
    }
    return file.get(name);
  };
}
