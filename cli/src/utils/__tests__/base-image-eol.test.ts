// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ENGINE_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../engine");

// Every base image line the engine may build on, with its end-of-life date (YYYY-MM-DD).
// To add a line: find its EOL on the vendor's schedule and add it here, in the same change that uses it.
const BASE_IMAGE_EOL: Record<string, string> = {
  "alpine:3.22": "2027-05-31",
  "node:22-alpine": "2027-04-30",
};

const BASE_IMAGE_REF = /\b(alpine:\d+\.\d+|node:\d+-alpine)\b/g;

function engineBaseImageRefs(): Map<string, string[]> {
  const refs = new Map<string, string[]>();
  for (const rel of readdirSync(ENGINE_DIR, { recursive: true }) as string[]) {
    if (!rel.endsWith(".star")) continue;
    const text = readFileSync(join(ENGINE_DIR, rel), "utf8");
    for (const match of text.matchAll(BASE_IMAGE_REF)) {
      const files = refs.get(match[1]) ?? [];
      files.push(rel);
      refs.set(match[1], files);
    }
  }
  return refs;
}

describe("base image end-of-life", () => {
  it("every base image referenced in engine/ has an EOL entry", () => {
    const unknown = [...engineBaseImageRefs().entries()].filter(
      ([ref]) => !(ref in BASE_IMAGE_EOL),
    );
    const message = unknown.map(([ref, files]) => `${ref} (in ${files.join(", ")})`).join("\n");
    expect(unknown, `Base images with no EOL entry:\n${message}`).toEqual([]);
  });

  it("no base image referenced in engine/ is past its end-of-life date", () => {
    const today = new Date().toISOString().slice(0, 10);
    const expired = [...engineBaseImageRefs().keys()]
      .filter((ref) => ref in BASE_IMAGE_EOL && BASE_IMAGE_EOL[ref] < today)
      .map((ref) => `${ref} reached end of life ${BASE_IMAGE_EOL[ref]}`);
    expect(expired, expired.join("\n")).toEqual([]);
  });
});
