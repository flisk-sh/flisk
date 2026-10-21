// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const normalize = (text: string): string => text.replace(/\r\n/g, "\n");

export const UPDATE_COMMAND = "UPDATE_GOLDEN=1 bun run test -- golden-generated-output";

/**
 * Compares generated files with the committed golden copies in `goldenDir`. Returns one problem per file that
 * changed, is missing a golden, or has a golden nothing generates any more. With `update` it rewrites the goldens
 * instead and returns nothing, which is how an intentional change is accepted.
 */
export function compareWithGolden(
  actual: Record<string, string>,
  goldenDir: string,
  update = false,
): string[] {
  if (update) {
    for (const [name, content] of Object.entries(actual)) {
      const target = join(goldenDir, name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, normalize(content));
    }
    for (const stale of staleGoldens(actual, goldenDir)) {
      rmSync(join(goldenDir, stale), { force: true });
    }
    return [];
  }

  const problems: string[] = [];
  for (const [name, content] of Object.entries(actual)) {
    const path = join(goldenDir, name);
    if (!existsSync(path)) {
      problems.push(`${name}: no golden file yet`);
    } else if (normalize(readFileSync(path, "utf-8")) !== normalize(content)) {
      problems.push(`${name}: generated output differs from its golden file`);
    }
  }
  for (const stale of staleGoldens(actual, goldenDir)) {
    problems.push(`${stale}: golden file that nothing generates any more`);
  }
  return problems;
}

function staleGoldens(actual: Record<string, string>, goldenDir: string): string[] {
  if (!existsSync(goldenDir)) return [];
  return readdirSync(goldenDir).filter((name) => !(name in actual));
}
