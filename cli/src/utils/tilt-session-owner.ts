// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { realpathSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

/**
 * The Tiltfile path from `tilt get session -o json --port <port>`. A Tilt session names the Tiltfile it loaded in
 * `spec.tiltfilePath`; `tilt get tiltfile -o json` names it in `spec.path`. Both are accepted so the check works
 * with either API answer. Returns null when the answer is missing or unparseable: unknown ownership is not foreign.
 */
export function sessionTiltfilePath(jsonText: string | null | undefined): string | null {
  if (!jsonText) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const items = (parsed as Record<string, unknown>).items;
  if (!Array.isArray(items)) return null;

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const spec = (item as Record<string, unknown>).spec;
    if (!spec || typeof spec !== "object") continue;
    const candidate =
      (spec as Record<string, unknown>).tiltfilePath ?? (spec as Record<string, unknown>).path;
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
  }
  return null;
}

/**
 * Compare a path reported by Tilt with this project's generated Tiltfile. Separators are normalized, a relative
 * Tiltfile is resolved against the project root, and symlinks are followed when the path exists. The *whole* path
 * must match: a bare `Tiltfile` name or a shared trailing suffix never makes another project's Tilt ours.
 */
function canonicalTiltfilePath(path: string, projectRoot: string): string {
  let candidate = path.replace(/\\/g, "/");
  // Git Bash reports Windows paths as /c/...; Tilt may have been started from such a shell.
  if (process.platform === "win32") {
    candidate = candidate.replace(/^\/([A-Za-z])\//, "$1:/");
  }
  const absolute = isAbsolute(candidate) ? resolve(candidate) : resolve(projectRoot, candidate);
  let canonical = absolute;
  try {
    canonical = realpathSync(absolute);
  } catch {
    // A project that was never started has no generated Tiltfile; the resolved path is still comparable.
  }
  return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}

/**
 * Whether the running Tilt loaded this project's `.flisk/.flisk-out/Tiltfile`. Null means the API answer did not
 * identify a Tiltfile, so callers must keep using their previous ownership signal instead of guessing.
 */
export function tiltSessionIsForProject(
  jsonText: string | null | undefined,
  projectRoot: string,
): boolean | null {
  const tiltfilePath = sessionTiltfilePath(jsonText);
  if (tiltfilePath === null) return null;
  const expected = join(projectRoot, ".flisk", ".flisk-out", "Tiltfile");
  return (
    canonicalTiltfilePath(tiltfilePath, projectRoot) ===
    canonicalTiltfilePath(expected, projectRoot)
  );
}
