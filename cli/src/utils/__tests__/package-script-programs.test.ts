// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  commandPrograms,
  programsForServiceCommand,
  readPackageScript,
  scriptOfCommand,
} from "../package-script-programs.js";

/** Serves package.json bodies without touching the disk. A missing file throws like readFileSync. */
const packages = (bodies: Record<string, string>) => (path: string) => {
  // node:path.join normalises separators to the host platform; compare with forward slashes.
  const normalized = path.replace(/\\/g, "/");
  const body = Object.entries(bodies).find(
    ([candidate]) => candidate.replace(/\\/g, "/") === normalized,
  )?.[1];
  if (body !== undefined) return body;
  throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
};

describe("package-manager script resolution (#4680)", () => {
  it.each([
    ["npm run dev", "dev"],
    ["npm run dev -- --watch", "dev"],
    ["yarn dev", "dev"],
    ["yarn run dev", "dev"],
    ["pnpm dev", "dev"],
    ["pnpm run dev", "dev"],
    ["bun run dev", "dev"],
    ["PORT=4000 exec npm run dev", "dev"],
  ])("recognises %s as script %s", (command, script) => {
    expect(scriptOfCommand(command)).toBe(script);
  });

  it.each(["node server.js", "npm install", "bun install", "bun src/index.ts", "npm run"])(
    "does not treat %s as a package-manager script",
    (command) => {
      expect(scriptOfCommand(command)).toBeNull();
    },
  );

  it("returns the first program of each && part", () => {
    expect(commandPrograms("prisma generate && bun run --watch src/index.ts")).toEqual([
      "prisma",
      "bun",
    ]);
  });

  it("follows an npm run script one level into the service's own package.json", () => {
    const programs = programsForServiceCommand(
      "/project/api",
      "npm run dev",
      packages({
        "/project/api/package.json": JSON.stringify({
          scripts: { dev: "bun run --watch src/index.ts" },
        }),
      }),
    );
    expect(programs).toEqual([{ program: "npm" }, { program: "bun", script: "dev" }]);
  });

  it("checks the first program of each chained part of a script", () => {
    const programs = programsForServiceCommand(
      "/project/shop-api",
      "npm run dev",
      packages({
        "/project/shop-api/package.json": JSON.stringify({
          scripts: { dev: "prisma generate && bun run --watch src/index.ts" },
        }),
      }),
    );
    expect(programs).toEqual([
      { program: "npm" },
      { program: "prisma", script: "dev" },
      { program: "bun", script: "dev" },
    ]);
  });

  it("checks chained parts of the service command itself", () => {
    const programs = programsForServiceCommand(
      "/project/api",
      "npm run build && npm run dev",
      packages({
        "/project/api/package.json": JSON.stringify({
          scripts: { build: "tsc", dev: "bun run src/index.ts" },
        }),
      }),
    );
    expect(programs).toEqual([
      { program: "npm" },
      { program: "tsc", script: "build" },
      { program: "bun", script: "dev" },
    ]);
  });

  it("skips a script when there is no package.json", () => {
    const programs = programsForServiceCommand("/project/api", "npm run dev", packages({}));
    expect(programs).toEqual([{ program: "npm" }]);
  });

  it("skips a script that is absent or not a string", () => {
    const readFile = packages({
      "/project/api/package.json": JSON.stringify({ scripts: { build: 42 } }),
    });
    expect(programsForServiceCommand("/project/api", "npm run dev", readFile)).toEqual([
      { program: "npm" },
    ]);
    expect(programsForServiceCommand("/project/api", "npm run build", readFile)).toEqual([
      { program: "npm" },
    ]);
  });

  it("does not follow a script into another script (one level only)", () => {
    const programs = programsForServiceCommand(
      "/project/api",
      "npm run dev",
      packages({
        "/project/api/package.json": JSON.stringify({
          scripts: { dev: "npm run build", build: "bun run src/index.ts" },
        }),
      }),
    );
    expect(programs).toEqual([{ program: "npm" }, { program: "npm", script: "dev" }]);
  });

  it("ignores shell builtins and deduplicates repeated programs", () => {
    const programs = programsForServiceCommand(
      "/project/api",
      "npm run dev",
      packages({
        "/project/api/package.json": JSON.stringify({
          scripts: { dev: "true && bun run a && bun run b" },
        }),
      }),
    );
    expect(programs).toEqual([{ program: "npm" }, { program: "bun", script: "dev" }]);
  });

  it("reads a package script from the given directory", () => {
    expect(
      readPackageScript(
        "/project/api",
        "dev",
        packages({ "/project/api/package.json": '{"scripts":{"dev":"node s.js"}}' }),
      ),
    ).toBe("node s.js");
  });
});
