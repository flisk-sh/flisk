// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createPackageJson } from "../../commands/resource.js";
import { FRONTEND_FRAMEWORKS } from "../../frontend-frameworks/registry.js";

type Version = [number, number, number];

function parseVersion(text: string): Version {
  const [major = 0, minor = 0, patch = 0] = text
    .replace(/^[\^~=v]/, "")
    .split(".")
    .map((part) => (part === "x" || part === "*" ? 0 : Number.parseInt(part, 10)));
  return [major, minor, patch];
}

function compare(a: Version, b: Version): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

// Enough of npm's range grammar for the peer ranges below: `||`, `^x.y.z`, `x.x`, `>=a <b`.
function satisfies(version: Version, range: string): boolean {
  return range.split("||").some((alternative) =>
    alternative
      .trim()
      .split(/\s+/)
      .every((comparator) => {
        if (comparator === "*" || comparator === "") return true;
        if (comparator.startsWith(">="))
          return compare(version, parseVersion(comparator.slice(2))) >= 0;
        if (comparator.startsWith("<"))
          return compare(version, parseVersion(comparator.slice(1))) < 0;
        const floor = parseVersion(comparator);
        if (comparator.startsWith("^") || /\.x$/.test(comparator)) {
          return version[0] === floor[0] && compare(version, floor) >= 0;
        }
        return compare(version, floor) === 0;
      }),
  );
}

// The lowest and the highest version a caret range lets the package manager pick.
function caretBounds(range: string): Version[] {
  expect(range).toMatch(/^\^\d+\.\d+\.\d+$/);
  const floor = parseVersion(range);
  return [floor, [floor[0], 999, 999]];
}

// Published `peerDependencies.vite` of each framework's plugin at the scaffolded range, read with
// `npm view <plugin>@<range> peerDependencies.vite` on 2026-10-08. Update when a range changes.
const PLUGIN_VITE_PEERS: Record<string, string> = {
  "@vitejs/plugin-react@^4.3.4": "^4.2.0 || ^5.0.0 || ^6.0.0 || ^7.0.0",
  "@vitejs/plugin-vue@^5.2.4": "^5.0.0 || ^6.0.0",
  "@sveltejs/vite-plugin-svelte@^5.0.0": "^6.0.0",
  "@preact/preset-vite@^2.10.0": "2.x || 3.x || 4.x || 5.x || 6.x || 7.x || 8.x",
  "vite-plugin-solid@^2.11.0": "^3.0.0 || ^4.0.0 || ^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0 || ^9.0.0",
  "@builder.io/qwik@^1.12.0": ">=5 <8",
};

function installedVitestVitePeer(): string {
  // The CLI's own devDependency uses the same vitest range as the scaffold.
  const require = createRequire(import.meta.url);
  let dir = dirname(require.resolve("vitest"));
  while (!/node_modules[\\/]vitest$/.test(dir) && dir !== dirname(dir)) dir = dirname(dir);
  const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  return manifest.peerDependencies.vite;
}

describe("scaffolded vite and vitest versions", () => {
  const cliManifest = JSON.parse(
    readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
  );

  it("scaffolds the vitest range the CLI tests itself with", () => {
    const pkg = createPackageJson("web", "frontend", "react");
    expect(pkg.devDependencies.vitest).toBe(cliManifest.devDependencies.vitest);
  });

  it("scaffolds a vite that satisfies vitest's peer range", () => {
    const vitePeer = installedVitestVitePeer();
    const pkg = createPackageJson("web", "frontend", "react");
    for (const version of caretBounds(pkg.devDependencies.vite as string)) {
      expect(
        satisfies(version, vitePeer),
        `vite ${version.join(".")} vs vitest peer ${vitePeer}`,
      ).toBe(true);
    }
  });

  // Each scaffolded vite plugin, as "name@range", for one framework.
  function vitePlugins(frameworkId: string): string[] {
    const pkg = createPackageJson("web", "frontend", frameworkId);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;
    return Object.entries(deps)
      .filter(([dep]) => /vite|qwik/.test(dep) && dep !== "vite" && dep !== "vitest")
      .map(([dep, range]) => `${dep}@${range}`);
  }

  it.each(Object.keys(FRONTEND_FRAMEWORKS))(
    "%s: every vite plugin accepts the scaffolded vite",
    (frameworkId) => {
      const viteRange = createPackageJson("web", "frontend", frameworkId).devDependencies
        .vite as string;
      for (const plugin of vitePlugins(frameworkId)) {
        const peer = PLUGIN_VITE_PEERS[plugin];
        expect(peer, `record the vite peer range of ${plugin} in PLUGIN_VITE_PEERS`).toBeDefined();
        for (const version of caretBounds(viteRange)) {
          expect(
            satisfies(version, peer as string),
            `${plugin} peer ${peer} vs vite ${version.join(".")}`,
          ).toBe(true);
        }
      }
    },
  );

  it("does not add vite to backends or workers", () => {
    expect(createPackageJson("api", "backend").devDependencies).not.toHaveProperty("vite");
    expect(createPackageJson("jobs", "worker").devDependencies).not.toHaveProperty("vite");
  });
});
