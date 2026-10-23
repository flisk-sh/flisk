// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync } from "node:fs";
import { delimiter, extname, join } from "node:path";
import { isWindows, pathLookups } from "./platform.js";

export function findOnPath(command: string): string | null {
  const pathEnv = process.env.PATH ?? process.env.Path ?? "";
  const windows = isWindows();
  const names = pathLookups(command, windows);
  if (windows && !extname(command)) {
    for (const extension of (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")) {
      const suffix = extension.toLowerCase();
      if (suffix && !names.includes(`${command}${suffix}`)) names.push(`${command}${suffix}`);
    }
  }
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export function findAllOnPath(command: string): string[] {
  const pathEnv = process.env.PATH ?? process.env.Path ?? "";
  const windows = isWindows();
  const names = pathLookups(command, windows);
  if (windows && !extname(command)) {
    for (const extension of (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")) {
      const suffix = extension.toLowerCase();
      if (suffix && !names.includes(`${command}${suffix}`)) names.push(`${command}${suffix}`);
    }
  }
  const found: string[] = [];
  const seen = new Set<string>();
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      const candidate = join(dir, name);
      if (!existsSync(candidate)) continue;
      const key = windows ? candidate.toLowerCase() : candidate;
      if (!seen.has(key)) {
        seen.add(key);
        found.push(candidate);
      }
    }
  }
  return found;
}
