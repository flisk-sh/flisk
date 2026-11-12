// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { type DockerRunner, defaultDockerRunner } from "./docker-build-cache.js";

export interface TiltImagePruneResult {
  removed: string[];
  kept: string[];
  /** Bytes of image size the removed tags referenced (shared layers may free less). */
  removedBytes: number;
}

interface TiltImage {
  repo: string;
  tag: string;
  created: number;
  bytes: number;
}

const UNITS: Record<string, number> = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 };

function sizeToBytes(raw: string): number {
  const m = /^([\d.]+)\s*([KMGT]?B)$/i.exec(raw.trim());
  return m ? Math.round(Number(m[1]) * (UNITS[(m[2] ?? "B").toUpperCase()] ?? 1)) : 0;
}

/** Tilt tags every build `tilt-<hash>`, so superseded builds stay tagged and never count as dangling. */
export function selectSupersededTiltImages(
  rows: string,
  keep: number,
): { remove: TiltImage[]; kept: TiltImage[] } {
  const byRepo = new Map<string, TiltImage[]>();
  for (const line of rows.split("\n")) {
    const [repo = "", tag = "", created = "", size = ""] = line.split("\t");
    if (!tag.startsWith("tilt-") || !repo || repo === "<none>") continue;
    const list = byRepo.get(repo) ?? [];
    list.push({
      repo,
      tag,
      created: Date.parse(created.replace(/ [A-Z]{2,5}$/, "")) || 0,
      bytes: sizeToBytes(size),
    });
    byRepo.set(repo, list);
  }
  const remove: TiltImage[] = [];
  const kept: TiltImage[] = [];
  for (const list of byRepo.values()) {
    list.sort((a, b) => b.created - a.created);
    kept.push(...list.slice(0, keep));
    remove.push(...list.slice(keep));
  }
  return { remove, kept };
}

/**
 * Removes every `tilt-<hash>` tag except the newest `keep` per repository. `docker rmi <repo:tag>` only untags
 * and refuses an image a container still uses, so a running stack is never touched. Never throws.
 */
export async function pruneSupersededTiltImages(
  keep = 1,
  run: DockerRunner = defaultDockerRunner,
): Promise<TiltImagePruneResult> {
  const result: TiltImagePruneResult = { removed: [], kept: [], removedBytes: 0 };
  let rows: string;
  try {
    rows = await run([
      "image",
      "ls",
      "--format",
      "{{.Repository}}\t{{.Tag}}\t{{.CreatedAt}}\t{{.Size}}",
    ]);
  } catch {
    return result;
  }
  const { remove, kept } = selectSupersededTiltImages(rows, keep);
  result.kept = kept.map((i) => `${i.repo}:${i.tag}`);
  for (const image of remove) {
    const ref = `${image.repo}:${image.tag}`;
    try {
      await run(["rmi", ref]);
      result.removed.push(ref);
      result.removedBytes += image.bytes;
    } catch {
      result.kept.push(ref); // in use by a container
    }
  }
  return result;
}
