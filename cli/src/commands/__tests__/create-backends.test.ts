// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BACKEND_LANGUAGES } from "../../backend-languages/registry.js";
import { runFlisk } from "../../test-support/index.js";
import { backendCatalog } from "../../utils/create-catalog.js";

function inTempDir() {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "flisk-create-backends-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  return () => dir;
}

const backends = backendCatalog();
const backendChoices = backends.flatMap((language) =>
  language.frameworks.length > 0
    ? language.frameworks.map((framework) => ({
        label: `--backend ${framework.id}`,
        flags: ["--backend", framework.id],
        name: framework.id,
      }))
    : [
        {
          label: `--language ${language.id}`,
          flags: ["--language", language.id],
          name: language.id,
        },
      ],
);

describe("every backend generator remains selectable and produces a valid local project", () => {
  const dirOf = inTempDir();
  const parse = (file: string) => JSON.parse(readFileSync(file, "utf8"));

  it.each(backendChoices)("each backend in the registry: $label", ({ label, flags, name }) => {
    const run = runFlisk(["create", `api-${name}`, "--frontend", "none", ...flags, "--yes"], {
      cwd: dirOf(),
      timeout: 120_000,
    });
    expect(run.status, `${label}: ${run.stdout}${run.stderr}`).toBe(0);
    const api = join(dirOf(), `api-${name}`, "api");
    expect(existsSync(join(api, "Dockerfile")), `${label} Dockerfile`).toBe(false);
    const service = parse(join(api, "service.json"));
    expect(typeof service.command, `${label} command`).toBe("string");
    expect(service).not.toHaveProperty("build");
    // A language with its own package.json runs through its dev script; one without runs its own dev command.
    const language = BACKEND_LANGUAGES[service.language ?? backends[0]?.id ?? ""];
    if (existsSync(join(api, "package.json"))) {
      expect(service.command).toBe("npm run dev");
      expect(typeof parse(join(api, "package.json")).scripts.dev).toBe("string");
    } else if (language?.devCommand) {
      // The registry command listens on every interface for a container; the local one on localhost.
      expect(service.command).toBe(language.devCommand.replaceAll("0.0.0.0", "localhost"));
    }
  }, 120_000);
});
