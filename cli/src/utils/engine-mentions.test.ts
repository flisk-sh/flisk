import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Flisk runs on any Docker-compatible engine. A sentence that lists the engines a user can start ("Start Docker
// Desktop, OrbStack or Colima") has to list Kiri too, or Kiri users read it as unsupported. This is the check that
// fails when someone adds an engine to the code and forgets the docs, or the other way round.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const LISTED = ["Docker Desktop", "OrbStack", "Colima", "Podman"];
const MUST_NAME = ["Kiri"];
// Generated or historical text, and pages that compare products rather than say what runs Flisk.
const SKIP = [
  /^docs\/(benchmarks|outreach|fit|launch|CHANGELOG)/,
  /^docs\/CHANGELOG\.md$/,
  /\.test\.[cm]?[jt]s$/,
  /^cli\/dist\//,
  /^runtime\/engine\/docs\//,
];

function trackedFiles(): string[] {
  const out = execFileSync(
    "git",
    ["ls-files", "README.md", "docs", "cli/src", "cli/templates", "runtime/engine"],
    {
      cwd: ROOT,
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return out
    .split("\n")
    .filter(
      (file) =>
        /\.(md|txt|ts|tsx|star|json)$/.test(file) && !SKIP.some((pattern) => pattern.test(file)),
    );
}

describe("engine mentions", () => {
  it("names Kiri wherever a line lists two or more of Docker Desktop, OrbStack, Colima and Podman", () => {
    const missing: string[] = [];
    for (const file of trackedFiles()) {
      readFileSync(resolve(ROOT, file), "utf-8")
        .split("\n")
        .forEach((line, index) => {
          // Code comments describe how the code works, and the `colima status` probe is a command, not a list.
          if (/^\s*(\/\/|\/\*|\*)/.test(line) || line.includes('"colima status"')) return;
          const listed = LISTED.filter((name) => new RegExp(`\\b${name}\\b`, "i").test(line));
          if (listed.length < 2) return;
          for (const name of MUST_NAME) {
            if (!new RegExp(`\\b${name}\\b`, "i").test(line))
              missing.push(`${file}:${index + 1} lists ${listed.join(", ")} but not ${name}`);
          }
        });
    }
    expect(missing, missing.join("\n")).toEqual([]);
  });
});
